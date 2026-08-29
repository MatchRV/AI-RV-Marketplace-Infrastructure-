/**
 * /api/agent/* — the server side of MatchRV's WebMCP tool layer.
 *
 * The page registers WebMCP tools; their handlers call these endpoints and
 * mirror every result into the UI. Everything here is deterministic (no LLM
 * calls — the shopper's agent does the reasoning), Zod-validated, and honest
 * about unknowns. Errors are structured so an agent can self-correct.
 */

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  availabilitySummary,
  buildContext,
  compareUnits,
  compareUnitsInput,
  constraintsSchema,
  ConstraintError,
  evaluateTowFit,
  evaluateUnit,
  prepareDealerContactInput,
  resolveTowVehicle,
  runSearch,
  submitDealerContactInput,
  TOOL_CONTRACTS,
  toInputSchema,
  type Constraints,
} from "@workspace/agent-core";
import { getInventory } from "../services/agent-inventory";
import { agentMetricsSnapshot, timedAgentOp } from "../services/agent-metrics";
import {
  createPreview,
  decidePreview,
  draftMessage,
  getPreview,
  submitPreview,
} from "../services/agent-leads";

const router: IRouter = Router();

function badRequest(res: Response, error: z.ZodError): void {
  res.status(400).json({
    error: "invalid_arguments",
    issues: error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).slice(0, 8),
    guidance: "Fix the listed arguments and retry — the tool schema documents valid values.",
  });
}

function handleEngineError(res: Response, err: unknown): void {
  if (err instanceof ConstraintError) {
    res.status(422).json({ error: err.message, hint: err.hint });
    return;
  }
  console.error("[agent] internal error:", err);
  res.status(500).json({ error: "internal_error", guidance: "Retry once; report persistent failures to the human." });
}

const searchBody = z.object({
  constraints: constraintsSchema,
  limit: z.number().int().min(1).max(24).optional(),
});

// ── Meta / observability ───────────────────────────────────────────────────

router.get("/agent/meta", (_req: Request, res: Response) => {
  const inv = getInventory();
  res.json({
    dataset: {
      units: inv.units.length,
      dealers: inv.snapshot.stats.dealers,
      builtAt: inv.snapshot.builtAt,
      note: inv.snapshot.datasetNote,
    },
    tools: TOOL_CONTRACTS.map((t) => ({
      name: t.name,
      description: t.description,
      annotations: t.annotations,
      inputSchema: toInputSchema(t),
    })),
    metrics: agentMetricsSnapshot(),
  });
});

// ── Search ─────────────────────────────────────────────────────────────────

router.post("/agent/search", async (req: Request, res: Response) => {
  const parsed = searchBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  try {
    const outcome = await timedAgentOp(
      "search",
      () => runSearch(getInventory().units, cleanConstraints(parsed.data.constraints)),
      (o) => o.results.length === 0,
    );
    const limit = parsed.data.limit ?? 5;
    res.json({
      funnel: outcome.funnel,
      towResolution: outcome.towResolution,
      locationResolution: outcome.locationResolution,
      appliedConstraints: outcome.appliedConstraints,
      results: outcome.results.slice(0, Math.max(limit, 12)).map(serializeMatch),
      shownToAgent: limit,
    });
  } catch (err) {
    handleEngineError(res, err);
  }
});

function cleanConstraints(c: z.infer<typeof constraintsSchema>): Constraints {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out as Constraints;
}

function serializeMatch(m: ReturnType<typeof evaluateUnit>) {
  const { unit, ...rest } = m;
  return { ...rest, unit }; // full unit included — the UI renders photos/provenance
}

// ── Unit detail / availability / explain ───────────────────────────────────

const unitIdParam = z.string().min(3).max(120);

router.get("/agent/units/:id", async (req: Request, res: Response) => {
  const id = unitIdParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res, id.error);
  const unit = getInventory().byId.get(id.data);
  if (!unit) {
    return void res.status(404).json({
      error: "unit_not_found",
      guidance: "Use a unit id returned by search_inventory (e.g. \"vin:...\").",
    });
  }
  await timedAgentOp("get_unit", () => undefined);
  res.json({ unit });
});

router.get("/agent/units/:id/availability", async (req: Request, res: Response) => {
  const id = unitIdParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res, id.error);
  const inv = getInventory();
  const unit = inv.byId.get(id.data);
  if (!unit) {
    return void res.status(404).json({ error: "unit_not_found", guidance: "Use a unit id from search results." });
  }
  await timedAgentOp("availability", () => undefined);
  res.json({ availability: availabilitySummary(unit, inv.snapshot.datasetNote) });
});

const explainBody = z.object({ unit_id: unitIdParam, constraints: constraintsSchema });

router.post("/agent/explain", async (req: Request, res: Response) => {
  const parsed = explainBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const unit = getInventory().byId.get(parsed.data.unit_id);
  if (!unit) {
    return void res.status(404).json({ error: "unit_not_found", guidance: "Use a unit id from search results." });
  }
  try {
    const match = await timedAgentOp("explain", () =>
      evaluateUnit(unit, buildContext(cleanConstraints(parsed.data.constraints))),
    );
    res.json({ match: serializeMatch(match) });
  } catch (err) {
    handleEngineError(res, err);
  }
});

// ── Compare ────────────────────────────────────────────────────────────────

const compareBody = compareUnitsInput.extend({ constraints: constraintsSchema });

router.post("/agent/compare", async (req: Request, res: Response) => {
  const parsed = compareBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const inv = getInventory();
  const units: import("@workspace/agent-core").CanonicalUnit[] = [];
  for (const id of parsed.data.unit_ids) {
    const u = inv.byId.get(id);
    if (!u) {
      return void res.status(404).json({ error: "unit_not_found", detail: id, guidance: "All unit_ids must come from search results." });
    }
    units.push(u);
  }
  try {
    const comparison = await timedAgentOp("compare", () =>
      compareUnits(units, cleanConstraints(parsed.data.constraints)),
    );
    res.json({ comparison, units });
  } catch (err) {
    handleEngineError(res, err);
  }
});

// ── Tow fit ────────────────────────────────────────────────────────────────

const towBody = z.object({
  vehicle: z.string().min(2).max(120),
  unit_ids: z.array(unitIdParam).max(6),
});

router.post("/agent/tow-fit", async (req: Request, res: Response) => {
  const parsed = towBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const inv = getInventory();
  const resolution = resolveTowVehicle(parsed.data.vehicle);
  const fits = [];
  for (const id of parsed.data.unit_ids) {
    const u = inv.byId.get(id);
    if (!u) {
      return void res.status(404).json({ error: "unit_not_found", detail: id, guidance: "All unit_ids must come from search results." });
    }
    fits.push({ ...evaluateTowFit(u, resolution), title: u.title });
  }
  await timedAgentOp("tow_fit", () => undefined);
  res.json({ resolution, fits });
});

// ── Lead flow (two-phase, human-gated) ─────────────────────────────────────

const previewBody = prepareDealerContactInput.extend({ constraints: constraintsSchema });

router.post("/agent/leads/preview", async (req: Request, res: Response) => {
  const parsed = previewBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const unit = getInventory().byId.get(parsed.data.unit_id);
  if (!unit) {
    return void res.status(404).json({ error: "unit_not_found", guidance: "Use a unit id from search results." });
  }
  const constraints = cleanConstraints(parsed.data.constraints);
  let unknowns: string[] = [];
  try {
    unknowns = evaluateUnit(unit, buildContext(constraints)).unknownFields;
  } catch {
    // Constraints may be unresolvable (e.g. unknown place) — draft without them.
  }
  const message = parsed.data.message?.trim() || draftMessage(unit, constraints, unknowns);
  const preview = await timedAgentOp("lead_preview", () =>
    createPreview({
      unit,
      customer: { name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone },
      message,
    }),
  );
  res.status(201).json({ preview });
});

router.get("/agent/leads/:id", (req: Request, res: Response) => {
  const preview = getPreview(String(req.params.id));
  if (!preview) return void res.status(404).json({ error: "preview_not_found" });
  res.json({ preview });
});

// Human decisions — driven by the page UI's Approve/Reject buttons.
router.post("/agent/leads/:id/approve", (req: Request, res: Response) => {
  const preview = decidePreview(String(req.params.id), "approved");
  if (!preview) return void res.status(404).json({ error: "preview_not_found" });
  res.json({ preview });
});

router.post("/agent/leads/:id/reject", (req: Request, res: Response) => {
  const preview = decidePreview(String(req.params.id), "rejected");
  if (!preview) return void res.status(404).json({ error: "preview_not_found" });
  res.json({ preview });
});

router.post("/agent/leads/submit", async (req: Request, res: Response) => {
  const parsed = submitDealerContactInput.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const result = await timedAgentOp("lead_submit", () => submitPreview(parsed.data.preview_id));
  if (!result.ok) {
    const status =
      result.code === "not_found" ? 404 :
      result.code === "awaiting_human_approval" ? 409 :
      result.code === "duplicate" || result.code === "already_submitted" ? 409 : 410;
    return void res.status(status).json({ error: result.code, guidance: result.guidance });
  }
  res.json({
    receipt: {
      leadId: result.leadId,
      recordedAt: result.recordedAt,
      delivery: result.delivery,
      unit: result.preview.unitTitle,
      dealer: result.preview.dealer.name,
    },
    preview: result.preview,
  });
});

export default router;
