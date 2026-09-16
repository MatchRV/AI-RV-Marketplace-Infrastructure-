import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { z } from "zod/v4";
import {
  buildContext,
  compareUnits,
  constraintsSchema,
  evaluateTowFit,
  evaluateUnit,
  prepareDealerContactInput,
  resolveTowVehicle,
  runSearch,
  submitDealerContactInput,
  type Constraints,
} from "@workspace/agent-core";
import { getInventory } from "./services/agent-inventory";
import { createPreview, draftMessage, submitPreview } from "./services/agent-leads";

const searchInput = z.object({
  constraints: constraintsSchema,
  limit: z.number().int().min(1).max(10).optional().default(5),
});

const getRvInput = z.object({ unit_id: z.string().min(3).max(120) });

const compareInput = z.object({
  unit_ids: z.array(z.string().min(3).max(120)).min(2).max(4),
  constraints: constraintsSchema.optional().default({}),
});

const towInput = z.object({
  vehicle: z.string().min(2).max(120),
  unit_ids: z.array(z.string().min(3).max(120)).min(1).max(6),
});

const contactInput = z.discriminatedUnion("action", [
  prepareDealerContactInput.extend({
    action: z.literal("prepare"),
    constraints: constraintsSchema.optional().default({}),
  }),
  submitDealerContactInput.extend({ action: z.literal("submit") }),
]);

function cleanConstraints(value: z.infer<typeof constraintsSchema> | undefined): Constraints {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value ?? {})) {
    if (item !== null && item !== undefined) out[key] = item;
  }
  return out as Constraints;
}

function textResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {}),
  };
}

function buildMatchRvServer(): McpServer {
  const server = new McpServer(
    {
      name: "matchrv",
      version: "0.1.0",
      websiteUrl: "https://matchrv.com",
    },
    {
      capabilities: { tools: { listChanged: false } },
      instructions:
        "MatchRV searches normalized dealer RV inventory. Preserve unknown fields as unknown. Never claim towing safety from a generic vehicle model. Dealer contact is a two-phase action: prepare a preview, require the human to approve it in MatchRV, then submit only the approved preview.",
    },
  );

  server.registerTool(
    "search_rvs",
    {
      title: "Search and match RVs",
      description:
        "Search MatchRV's normalized dealer inventory using structured buyer constraints. Returns deterministic match scores, hard/soft match evidence, unknown fields, provenance, and freshness. Use this for natural-language RV shopping after translating the shopper's request into constraints.",
      inputSchema: searchInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ constraints, limit }) => {
      try {
        const outcome = runSearch(getInventory().units, cleanConstraints(constraints));
        const results = outcome.results.slice(0, limit).map(({ unit, ...match }) => ({ ...match, unit }));
        return textResult({
          funnel: outcome.funnel,
          towResolution: outcome.towResolution,
          locationResolution: outcome.locationResolution,
          appliedConstraints: outcome.appliedConstraints,
          results,
        });
      } catch (error) {
        return textResult({ error: "search_failed", detail: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "get_rv",
    {
      title: "Get RV details",
      description:
        "Get the full canonical MatchRV record for one unit returned by search_rvs, including dealer, specs, price, features, source/provenance, freshness, and explicit unknowns. Never invent missing specifications.",
      inputSchema: getRvInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ unit_id }) => {
      const inv = getInventory();
      const unit = inv.byId.get(unit_id);
      if (!unit) return textResult({ error: "unit_not_found", guidance: "Use a unit_id returned by search_rvs." }, true);
      return textResult({ unit, dataset: { builtAt: inv.snapshot.builtAt, note: inv.snapshot.datasetNote } });
    },
  );

  server.registerTool(
    "compare_rvs",
    {
      title: "Compare RVs",
      description:
        "Compare 2-4 MatchRV units side by side against the buyer's constraints. Keeps unknown values explicit and returns deterministic comparison evidence rather than guessed specifications.",
      inputSchema: compareInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ unit_ids, constraints }) => {
      const inv = getInventory();
      const units = unit_ids.map((id) => inv.byId.get(id));
      const missing = unit_ids.filter((_id, index) => !units[index]);
      if (missing.length) return textResult({ error: "unit_not_found", unit_ids: missing }, true);
      try {
        const typedUnits = units.filter((u): u is NonNullable<typeof u> => Boolean(u));
        return textResult({ comparison: compareUnits(typedUnits, cleanConstraints(constraints)), units: typedUnits });
      } catch (error) {
        return textResult({ error: "compare_failed", detail: error instanceof Error ? error.message : String(error) }, true);
      }
    },
  );

  server.registerTool(
    "evaluate_tow_fit",
    {
      title: "Evaluate tow fit",
      description:
        "Evaluate weight fit between a shopper-stated tow vehicle and 1-6 RVs. This is screening guidance, not a towing-safety guarantee. Configuration-specific payload, GVWR/GCWR, hitch ratings, passengers and cargo can change the result.",
      inputSchema: towInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ vehicle, unit_ids }) => {
      const inv = getInventory();
      const resolution = resolveTowVehicle(vehicle);
      const fits = [];
      for (const id of unit_ids) {
        const unit = inv.byId.get(id);
        if (!unit) return textResult({ error: "unit_not_found", unit_id: id }, true);
        fits.push({ ...evaluateTowFit(unit, resolution), unit_id: id, title: unit.title });
      }
      return textResult({ resolution, fits, safetyNotice: "Verify the exact tow-vehicle configuration, payload sticker, GVWR/GCWR, hitch limits, passengers and cargo before towing." });
    },
  );

  server.registerTool(
    "contact_dealer",
    {
      title: "Prepare or submit dealer contact",
      description:
        "Two-phase dealer contact. action=prepare stages the exact dealer/unit/shopper/message preview and sends nothing. The human must approve that preview in MatchRV. action=submit accepts only a preview_id that MatchRV already records as human-approved; otherwise it fails without sending. Never treat prepare as consent to submit.",
      inputSchema: contactInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input) => {
      if (input.action === "prepare") {
        const inv = getInventory();
        const unit = inv.byId.get(input.unit_id);
        if (!unit) return textResult({ error: "unit_not_found", guidance: "Use a unit_id returned by search_rvs." }, true);
        const constraints = cleanConstraints(input.constraints);
        let unknowns: string[] = [];
        try {
          unknowns = evaluateUnit(unit, buildContext(constraints)).unknownFields;
        } catch {
          // A preview can still be staged when optional matching context is incomplete.
        }
        const message = input.message?.trim() || draftMessage(unit, constraints, unknowns);
        const created = createPreview({
          unit,
          customer: { name: input.name, email: input.email, phone: input.phone },
          message,
        });
        // Deliberately do not return approvalToken. Only the MatchRV human UI receives it.
        return textResult({ preview: created.preview, next: "Human approval is required in MatchRV before action=submit can succeed." });
      }

      const result = submitPreview(input.preview_id);
      if (!result.ok) {
        return textResult({ error: result.code, guidance: result.guidance ?? "The preview must be approved by the human in MatchRV before submission." }, true);
      }
      return textResult({
        receipt: {
          leadId: result.leadId,
          recordedAt: result.recordedAt,
          delivery: result.delivery,
          unit: result.preview.unitTitle,
          dealer: result.preview.dealer.name,
        },
      });
    },
  );

  return server;
}

export const matchRvMcpHandler = createMcpHandler(() => buildMatchRvServer());
export const matchRvMcpNodeHandler = toNodeHandler(matchRvMcpHandler);
