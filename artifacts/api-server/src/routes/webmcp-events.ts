/**
 * WebMCP call telemetry (MAT-38).
 * Storage: in-memory ring + append-only JSONL under /tmp (Render disk is ephemeral;
 * survives process lifetime only). No PII — tool name, dealer/unit ids, duration, ok/error, path, ts.
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { appendFile, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const router: IRouter = Router();

export interface WebmcpEvent {
  tool: string;
  dealerIds?: string[];
  unitIds?: string[];
  durationMs?: number;
  ok: boolean;
  path?: string;
  ts: string; // ISO
}

const MAX_MEMORY = 20_000;
const events: WebmcpEvent[] = [];
const LOG_DIR = resolve("/tmp/matchrv-webmcp");
const LOG_FILE = resolve(LOG_DIR, "events.jsonl");

function pushEvent(e: WebmcpEvent): void {
  events.push(e);
  if (events.length > MAX_MEMORY) events.splice(0, events.length - MAX_MEMORY);
  // Fire-and-forget disk append (ephemeral on Render).
  void (async () => {
    try {
      if (!existsSync(LOG_DIR)) await mkdir(LOG_DIR, { recursive: true });
      await appendFile(LOG_FILE, JSON.stringify(e) + "\n", "utf8");
    } catch {
      /* ignore disk errors */
    }
  })();
  console.log(
    `[webmcp-event] tool=${e.tool} ok=${e.ok} ms=${e.durationMs ?? "?"} dealers=${(e.dealerIds || []).join(",") || "-"} units=${(e.unitIds || []).length}`,
  );
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 200).slice(0, 20);
  return out.length ? out : undefined;
}

router.post("/webmcp/event", (req: Request, res: Response) => {
  // Accept JSON or text/plain (sendBeacon often sends as text/plain).
  let body: Record<string, unknown> = {};
  if (typeof req.body === "string") {
    try {
      body = JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return void res.status(400).json({ error: "invalid_json" });
    }
  } else if (req.body && typeof req.body === "object") {
    body = req.body as Record<string, unknown>;
  }

  const tool = typeof body.tool === "string" ? body.tool.slice(0, 80) : "";
  if (!tool) return void res.status(400).json({ error: "tool_required" });

  const ok = body.ok !== false && body.error !== true;
  const durationMs =
    typeof body.durationMs === "number" && Number.isFinite(body.durationMs)
      ? Math.max(0, Math.min(600_000, Math.round(body.durationMs)))
      : undefined;
  const path =
    typeof body.path === "string" ? body.path.slice(0, 200) : undefined;
  const ts =
    typeof body.ts === "string" && body.ts.length >= 10
      ? body.ts.slice(0, 40)
      : new Date().toISOString();

  pushEvent({
    tool,
    dealerIds: asStringArray(body.dealerIds ?? body.dealer_ids),
    unitIds: asStringArray(body.unitIds ?? body.unit_ids),
    durationMs,
    ok,
    path,
    ts,
  });
  res.status(204).end();
});

router.get("/webmcp/stats", (_req: Request, res: Response) => {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = events.filter((e) => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= cutoff;
  });

  // Also try loading JSONL if memory was empty after restart (best-effort).
  let pooled = recent;
  if (pooled.length === 0 && existsSync(LOG_FILE)) {
    try {
      const lines = readFileSync(LOG_FILE, "utf8").split("\n").filter(Boolean);
      pooled = [];
      for (const line of lines.slice(-MAX_MEMORY)) {
        try {
          const e = JSON.parse(line) as WebmcpEvent;
          const t = Date.parse(e.ts);
          if (Number.isFinite(t) && t >= cutoff) pooled.push(e);
        } catch {
          /* skip */
        }
      }
    } catch {
      /* ignore */
    }
  }

  const byTool: Record<string, number> = {};
  const byDealer: Record<string, number> = {};
  let errors = 0;
  for (const e of pooled) {
    byTool[e.tool] = (byTool[e.tool] || 0) + 1;
    if (!e.ok) errors += 1;
    for (const d of e.dealerIds || []) {
      byDealer[d] = (byDealer[d] || 0) + 1;
    }
  }

  res.json({
    windowDays: 7,
    total: pooled.length,
    errors,
    byTool,
    byDealer,
    storage: {
      kind: "memory+jsonl",
      note: "Render disk is ephemeral; JSONL is under /tmp and does not survive redeploys. In-memory ring holds the last ~20k events in-process.",
      memoryCount: events.length,
    },
  });
});

export default router;
