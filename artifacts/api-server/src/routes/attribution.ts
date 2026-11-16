import { Router, type IRouter, type Request, type Response } from "express";
import { createAgentClient, listAgentClients, revokeAgentClient } from "../services/agent-clients";
import { buildAttributionReport } from "../services/attribution-report";
import { DATA_DIR_FROZEN_GUIDANCE, DATA_DIR_FROZEN_RETRY_AFTER_SECONDS, DataDirFrozenError } from "../services/data-dir-freeze";
import { opsKeyValid } from "../services/dealer-inquiries";
import { storageStatus } from "../services/storage-monitor";

/**
 * Agent attribution ops API. Every route needs the ops key
 * (Authorization: Bearer <INQUIRY_OPS_KEY>) and is never cached.
 *
 *   GET  /api/attribution/ops/report              ?from=YYYY-MM-DD&to=YYYY-MM-DD&dealer=<id>&client=<id>
 *   GET  /api/attribution/ops/clients             issued API keys (no secrets, no hashes)
 *   POST /api/attribution/ops/clients             { name, scopes?: ["read","inquiry"], limits? } -> the key, shown once
 *   POST /api/attribution/ops/clients/:id/revoke  stop a key working, permanently
 *   GET  /api/attribution/ops/storage             data-file sizes, modes, backups, disk space, warnings
 */
const router: IRouter = Router();

function requireOps(req: Request, res: Response): boolean {
  res.setHeader("Cache-Control", "no-store");
  if (!process.env.INQUIRY_OPS_KEY) { res.status(503).json({ error: "ops_not_configured" }); return false; }
  if (!opsKeyValid(req.get("authorization"))) { res.status(401).json({ error: "unauthorized" }); return false; }
  return true;
}

function refuseWrite(res: Response, err: unknown): void {
  if (err instanceof DataDirFrozenError) {
    res.setHeader("Retry-After", String(DATA_DIR_FROZEN_RETRY_AFTER_SECONDS));
    res.status(503).json({ error: "writes_frozen", retryable: true, guidance: DATA_DIR_FROZEN_GUIDANCE });
    return;
  }
  console.error("[agent-clients] registry write failed:", err instanceof Error ? (err as NodeJS.ErrnoException).code ?? err.name : "error");
  res.status(500).json({ error: "registry_write_failed", guidance: "The key registry could not be saved. Check /api/attribution/ops/storage." });
}

const q = (v: unknown) => (typeof v === "string" ? v : undefined);

router.get("/attribution/ops/report", (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  res.json(buildAttributionReport({ from: q(req.query.from), to: q(req.query.to), dealerId: q(req.query.dealer), clientId: q(req.query.client) }));
});

router.get("/attribution/ops/clients", (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  res.json({ clients: listAgentClients() });
});

router.post("/attribution/ops/clients", (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const created = createAgentClient({ name: body.name, scopes: body.scopes, limits: body.limits });
    if (!created.ok) { res.status(created.code === "name_taken" ? 409 : 400).json({ error: created.code }); return; }
    res.status(201).json({
      client: created.client,
      key: created.key,
      note: "Store this key now. MatchRV keeps only a hash and cannot show it again. Send it as 'Authorization: Bearer <key>'.",
    });
  } catch (err) {
    refuseWrite(res, err);
  }
});

router.post("/attribution/ops/clients/:id/revoke", (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  try {
    const client = revokeAgentClient(String(req.params.id));
    if (!client) { res.status(404).json({ error: "not_found" }); return; }
    res.json({ client });
  } catch (err) {
    refuseWrite(res, err);
  }
});

router.get("/attribution/ops/storage", (req: Request, res: Response) => {
  if (!requireOps(req, res)) return;
  res.json(storageStatus());
});

export default router;
