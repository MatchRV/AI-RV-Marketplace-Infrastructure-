/**
 * WebMCP registration for MatchRV.
 *
 * The page registers 10 structured tools via `document.modelContext`
 * (ChatGPT's in-app browser; Chrome 149+ behind the WebMCP flag, with
 * `navigator.modelContext` supported as the legacy alias). Every tool
 * handler does three things, in order:
 *
 *   1. validate input against the same Zod contract the schema was
 *      generated from,
 *   2. call the MatchRV agent API and mirror the result into the shared
 *      shopping session (so the human sees exactly what the agent did),
 *   3. return a compact structured summary to the agent (~1.5KB budget,
 *      per WebMCP output guidance) — the page carries the full detail.
 *
 * The same handlers are also exposed on an internal executor used by the
 * guided demo and by automated tests. That executor never pretends to be a
 * real agent runtime: `getRuntime()` reports which one is present.
 */

import {
  TOOL_CONTRACTS,
  toInputSchema,
  getContract,
  mergeConstraints,
  searchInputToConstraints,
  searchInventoryInput,
  getUnitDetailsInput,
  explainMatchInput,
  checkAvailabilityInput,
  compareUnitsInput,
  evaluateTowFitInput,
  updateShortlistInput,
  prepareDealerContactInput,
  submitDealerContactInput,
  compactSearchResult,
  compactUnitDetail,
  type Constraints,
  type SearchOutcome,
  type UnitMatch,
  type CompareResult,
  type TowResolution,
  type TowFitResult,
} from "@workspace/agent-core";
import { agentApi, type LeadPreviewDto } from "./api";
import { rememberApprovalToken } from "./human-actions";
import {
  applySearchOutcome,
  describeConstraints,
  ensureOnShopPage,
  getSession,
  logLedger,
  markAgentActive,
  setComparison,
  setFocusedUnit,
  setLeadPreview,
  setRuntime,
  setSearching,
  setTowResolution,
  toggleShortlist,
  updateLeadPreview,
} from "./session";

type ToolResult = Record<string, unknown>;
type Handler = (input: unknown) => Promise<ToolResult>;

interface ModelContextLike {
  registerTool: (tool: {
    name: string;
    title?: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations?: Record<string, boolean>;
    execute: (input: unknown) => Promise<unknown>;
  }) => unknown;
}

function findModelContext(): ModelContextLike | null {
  if (typeof document !== "undefined") {
    const d = (document as unknown as { modelContext?: ModelContextLike }).modelContext;
    if (d && typeof d.registerTool === "function") return d;
  }
  if (typeof navigator !== "undefined") {
    const n = (navigator as unknown as { modelContext?: ModelContextLike }).modelContext;
    if (n && typeof n.registerTool === "function") return n;
  }
  return null;
}

// ── Handlers ───────────────────────────────────────────────────────────────

const invalid = (issues: { path: PropertyKey[]; message: string }[]): ToolResult => ({
  error: "invalid_arguments",
  issues: issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).slice(0, 8),
  guidance: "Fix the listed arguments and retry.",
});

async function handleSearch(raw: unknown): Promise<ToolResult> {
  const parsed = searchInventoryInput.safeParse(raw ?? {});
  if (!parsed.success) return invalid(parsed.error.issues);
  const { incoming, mode, clear, limit, intentSummary } = searchInputToConstraints(parsed.data);

  const current = getSession().constraints;
  // radius-only update: keep the current place
  if (incoming.location && incoming.location.place === "" ) {
    const place = current.location?.place;
    if (place) incoming.location = { place, radiusMiles: incoming.location.radiusMiles };
    else delete (incoming as Record<string, unknown>).location;
  }
  let next = mergeConstraints(current, incoming, mode);
  for (const key of clear) delete (next as Record<string, unknown>)[key];

  setSearching(true);
  ensureOnShopPage();
  const res = await agentApi.search(next, Math.max(limit, 12));
  if (!res.ok) {
    setSearching(false);
    logLedger("system", `search rejected: ${res.error.error}`);
    return { ...res.error } as ToolResult;
  }

  applySearchOutcome({
    actor: "agent",
    constraints: res.data.appliedConstraints,
    funnel: res.data.funnel,
    results: res.data.results,
    towResolution: res.data.towResolution,
    locationResolution: res.data.locationResolution,
    intentSummary,
  });

  const outcome: SearchOutcome = {
    funnel: res.data.funnel,
    results: res.data.results,
    appliedConstraints: res.data.appliedConstraints,
    towResolution: res.data.towResolution,
    locationResolution: res.data.locationResolution,
  };
  return {
    session_constraints: describeConstraints(res.data.appliedConstraints),
    ...compactSearchResult(outcome, limit),
  };
}

async function handleUnitDetails(raw: unknown): Promise<ToolResult> {
  const parsed = getUnitDetailsInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const res = await agentApi.unit(parsed.data.unit_id);
  if (!res.ok) return { ...res.error } as ToolResult;
  ensureOnShopPage();
  setFocusedUnit(res.data.unit, "agent");
  return compactUnitDetail(res.data.unit);
}

async function handleExplain(raw: unknown): Promise<ToolResult> {
  const parsed = explainMatchInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const res = await agentApi.explain(parsed.data.unit_id, getSession().constraints);
  if (!res.ok) return { ...res.error } as ToolResult;
  const m = res.data.match;
  ensureOnShopPage();
  setFocusedUnit(m.unit, "agent");
  logLedger("agent", `explained the match for ${m.unit.title}`, `score ${m.score}, ${m.hardStatus}`);
  return compactExplain(m);
}

function compactExplain(m: UnitMatch): ToolResult {
  return {
    unit: m.unit.title,
    id: m.unit.id,
    matchScore: m.score,
    verdict: m.hardStatus,
    hard: m.hardChecks.map((h) => `${h.status === "pass" ? "✓" : h.status === "fail" ? "✗" : "?"} ${h.constraint} (${h.actual})`),
    preferences: m.softChecks.map((s) => `${s.satisfied === true ? "✓" : s.satisfied === false ? "△" : "?"} ${s.preference} — ${s.detail}`),
    scoreMath: m.scoreBreakdown.map((b) => `${b.points >= 0 ? "+" : ""}${b.points} ${b.label}`),
    unknowns: m.unknownFields,
    note: "✓ verified · ✗ fails · ? dealer doesn't publish this — unknown is not no.",
  };
}

async function handleAvailability(raw: unknown): Promise<ToolResult> {
  const parsed = checkAvailabilityInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const res = await agentApi.availability(parsed.data.unit_id);
  if (!res.ok) return { ...res.error } as ToolResult;
  logLedger("agent", "checked listing freshness");
  return res.data.availability;
}

async function handleCompare(raw: unknown): Promise<ToolResult> {
  const parsed = compareUnitsInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const res = await agentApi.compare(parsed.data.unit_ids, getSession().constraints);
  if (!res.ok) return { ...res.error } as ToolResult;
  ensureOnShopPage();
  setComparison(res.data, "agent");
  return compactCompare(res.data.comparison);
}

function compactCompare(c: CompareResult): ToolResult {
  const rows: Record<string, unknown> = {};
  for (const row of c.rows) {
    if (row.values.every((v) => v === null)) continue; // all-unknown rows noted below
    rows[row.spec + (row.unit ? ` (${row.unit})` : "")] = row.values.map((v, i) =>
      v === null ? "unknown" : `${v}${row.bestIndex === i ? " ◀ best" : ""}`,
    );
  }
  return {
    units: c.titles,
    specs: rows,
    vsConstraints: c.constraintSummary.map(
      (s) => `${s.hardStatus} (score ${s.score})${s.failed.length ? ` — fails: ${s.failed.join("; ")}` : ""}`,
    ),
    unknownNotes: c.unknownNotes,
  };
}

async function handleTowFit(raw: unknown): Promise<ToolResult> {
  const parsed = evaluateTowFitInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const s = getSession();
  const ids =
    parsed.data.unit_ids ??
    (s.shortlist.length > 0
      ? s.shortlist.map((x) => x.id).slice(0, 6)
      : s.results.slice(0, 3).map((m) => m.unit.id));
  if (ids.length === 0) {
    return {
      error: "no_units_in_context",
      guidance: "Run search_inventory first, or pass unit_ids explicitly.",
    };
  }
  const res = await agentApi.towFit(parsed.data.vehicle, ids);
  if (!res.ok) return { ...res.error } as ToolResult;
  ensureOnShopPage();
  setTowResolution(res.data.resolution, "agent");
  return compactTow(res.data.resolution, res.data.fits);
}

function compactTow(r: TowResolution, fits: (TowFitResult & { title: string })[]): ToolResult {
  return {
    vehicle: r.matched?.label ?? r.input,
    ...(r.statedRatingLbs ? { statedRatingLbs: r.statedRatingLbs } : {}),
    ...(r.rangeLbs ? { ratingRangeLbs: `${r.rangeLbs.min}-${r.rangeLbs.max}` } : {}),
    caveat: r.caveats[0],
    fits: fits.map((f) => `${f.title}: ${f.verdict.replace(/_/g, " ")} — ${f.detail}`),
  };
}

async function handleSession(): Promise<ToolResult> {
  const s = getSession();
  const humanActions = s.ledger.filter((l) => l.actor === "human").slice(-5);
  return {
    constraints: describeConstraints(s.constraints),
    constraintsRaw: s.constraints as Record<string, unknown>,
    funnel: s.funnel
      ? `${s.funnel.totalUnits} searched → ${s.funnel.passedHard} verified, ${s.funnel.unverified} unverified`
      : "no search yet",
    shortlist: s.shortlist.map((x) => `${x.id} — ${x.title}`),
    focusedUnit: s.focused ? `${s.focused.unit.id} — ${s.focused.unit.title}` : null,
    leadPreview: s.leadPreview
      ? { previewId: s.leadPreview.previewId, status: s.leadPreview.status, unit: s.leadPreview.unitTitle }
      : null,
    recentHumanActions: humanActions.map((l) => l.text),
    guidance: "Human UI edits land here — trust this over your memory of earlier turns.",
  };
}

async function handleShortlist(raw: unknown): Promise<ToolResult> {
  const parsed = updateShortlistInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const s = getSession();
  const summaries = new Map(s.results.map((m) => [m.unit.id, m.unit]));
  const changed: string[] = [];
  for (const id of parsed.data.add ?? []) {
    if (s.shortlist.some((x) => x.id === id)) continue;
    let unit = summaries.get(id) ?? s.focused?.unit;
    if (!unit || unit.id !== id) {
      const res = await agentApi.unit(id);
      if (!res.ok) return { ...res.error } as ToolResult;
      unit = res.data.unit;
    }
    toggleShortlist(
      {
        id,
        title: unit.title,
        price: unit.priceUsd.value,
        image: unit.images[0] ?? null,
        dealer: unit.dealer.name,
      },
      "agent",
    );
    changed.push(`added ${id}`);
  }
  for (const id of parsed.data.remove ?? []) {
    const entry = getSession().shortlist.find((x) => x.id === id);
    if (entry) {
      toggleShortlist(entry, "agent");
      changed.push(`removed ${id}`);
    }
  }
  ensureOnShopPage();
  return {
    changed,
    shortlist: getSession().shortlist.map((x) => `${x.id} — ${x.title}`),
  };
}

async function handleLeadPreview(raw: unknown): Promise<ToolResult> {
  const parsed = prepareDealerContactInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const res = await agentApi.leadPreview({ ...parsed.data, constraints: getSession().constraints });
  if (!res.ok) return { ...res.error } as ToolResult;
  ensureOnShopPage();
  // The approval token stays with the page (human-actions module) — it is
  // deliberately NOT part of this tool's return value or any session state
  // an agent can read.
  rememberApprovalToken(res.data.preview.previewId, res.data.approvalToken);
  setLeadPreview(res.data.preview, "agent");
  const p = res.data.preview;
  return {
    preview_id: p.previewId,
    status: p.status,
    dealer: `${p.dealer.name}, ${p.dealer.city}`,
    unit: p.unitTitle,
    willSend: { name: p.customer.name, email: p.customer.email, phone: p.customer.phone, message: p.message },
    guidance:
      "NOTHING has been sent. The human sees this exact preview on the MatchRV page — ask them to review it and click Approve there, then call submit_dealer_contact.",
  };
}

async function handleLeadSubmit(raw: unknown): Promise<ToolResult> {
  const parsed = submitDealerContactInput.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues);
  const res = await agentApi.leadSubmit(parsed.data.preview_id);
  if (!res.ok) {
    logLedger("system", `submit blocked: ${res.error.error}`);
    return { ...res.error } as ToolResult;
  }
  updateLeadPreview(res.data.preview);
  logLedger("agent", `submitted the contact request to ${res.data.receipt.dealer}`, res.data.receipt.delivery);
  return { receipt: res.data.receipt as unknown as Record<string, unknown> };
}

const HANDLERS: Record<string, Handler> = {
  search_inventory: handleSearch,
  get_unit_details: handleUnitDetails,
  compare_units: handleCompare,
  explain_match: handleExplain,
  check_availability: handleAvailability,
  evaluate_tow_fit: handleTowFit,
  get_shopping_session: handleSession,
  update_shortlist: handleShortlist,
  prepare_dealer_contact: handleLeadPreview,
  submit_dealer_contact: handleLeadSubmit,
};

// ── Registration + internal executor ───────────────────────────────────────

let registered = false;

export interface MatchrvAgentBridge {
  executeTool: (name: string, input: unknown) => Promise<ToolResult>;
  listTools: () => { name: string; description: string; readOnly: boolean }[];
  runtime: () => "native" | "none";
  /** Read-only snapshot for automated tests and the guided demo. */
  state: () => {
    resultIds: string[];
    shortlistIds: string[];
    leadStatus: string | null;
    leadPreviewId: string | null;
    ledgerCount: number;
  };
}

export async function executeToolByName(name: string, input: unknown): Promise<ToolResult> {
  const handler = HANDLERS[name];
  if (!handler) {
    return { error: "unknown_tool", guidance: `No MatchRV tool named "${name}".` };
  }
  markAgentActive();
  const t0 = performance.now();
  const result = await handler(input);
  const ms = Math.round(performance.now() - t0);
  if ("error" in result) {
    logLedger("system", `${name} → ${String(result.error)} (${ms}ms)`);
  }
  return result;
}

export function registerMatchrvTools(): "native" | "none" {
  if (registered) return getBridgeRuntime();
  registered = true;

  const mc = findModelContext();
  for (const contract of TOOL_CONTRACTS) {
    if (mc) {
      try {
        void mc.registerTool({
          name: contract.name,
          title: contract.title,
          description: contract.description,
          inputSchema: toInputSchema(contract),
          annotations: contract.annotations,
          execute: (input: unknown) => executeToolByName(contract.name, input),
        });
      } catch (err) {
        console.warn(`[webmcp] failed to register ${contract.name}:`, err);
      }
    }
  }

  const runtime = mc ? "native" : "none";
  setRuntime(runtime, TOOL_CONTRACTS.length);
  logLedger(
    "system",
    mc
      ? `WebMCP active — ${TOOL_CONTRACTS.length} MatchRV capabilities exposed to your agent`
      : "No WebMCP runtime detected — open this page in ChatGPT's browser or Chrome with WebMCP enabled (the guided demo works everywhere)",
  );

  // Internal executor for the guided demo and automated tests (clearly not an agent).
  const bridge: MatchrvAgentBridge = {
    executeTool: executeToolByName,
    listTools: () =>
      TOOL_CONTRACTS.map((t) => ({
        name: t.name,
        description: t.description,
        readOnly: t.annotations.readOnlyHint === true,
      })),
    runtime: () => runtime,
    state: () => {
      const s = getSession();
      return {
        resultIds: s.results.map((m) => m.unit.id),
        shortlistIds: s.shortlist.map((x) => x.id),
        leadStatus: s.leadPreview?.status ?? null,
        leadPreviewId: s.leadPreview?.previewId ?? null,
        ledgerCount: s.ledger.length,
      };
    },
  };
  (window as unknown as { __matchrv: MatchrvAgentBridge }).__matchrv = bridge;

  return runtime;
}

function getBridgeRuntime(): "native" | "none" {
  return findModelContext() ? "native" : "none";
}

export function getToolContractsForDisplay(): { name: string; title: string; description: string; readOnly: boolean }[] {
  return TOOL_CONTRACTS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    readOnly: t.annotations.readOnlyHint === true,
  }));
}
