/**
 * The shared shopping session — one state object that the human (via the UI)
 * and the agent (via WebMCP tools) both read and write. Every mutation is
 * recorded in a visible activity ledger with its actor, which is what makes
 * agent actions legible instead of spooky.
 */

import { useSyncExternalStore } from "react";
import type {
  CompareResult,
  Constraints,
  CanonicalUnit,
  SearchFunnel,
  TowResolution,
  UnitMatch,
} from "@workspace/agent-core";
import type { LeadPreviewDto } from "./api";

export type LedgerActor = "agent" | "human" | "system";

export interface LedgerEntry {
  id: number;
  at: string;
  actor: LedgerActor;
  text: string;
  detail?: string;
}

export interface ShortlistEntry {
  id: string;
  title: string;
  price: number | null;
  image: string | null;
  dealer: string;
}

export type AgentRuntime = "native" | "none";

export interface AgentSessionState {
  runtime: AgentRuntime;
  toolCount: number;
  agentActive: boolean; // an agent tool has been called at least once
  guidedDemoRunning: boolean;
  constraints: Constraints;
  intentSummary: string | null;
  funnel: SearchFunnel | null;
  results: UnitMatch[];
  towResolution: TowResolution | null;
  locationResolution: { place: string; lat: number; lng: number } | null;
  searching: boolean;
  ledger: LedgerEntry[];
  shortlist: ShortlistEntry[];
  focused: { unit: CanonicalUnit; via: LedgerActor } | null;
  comparison: { comparison: CompareResult; units: CanonicalUnit[] } | null;
  leadPreview: LeadPreviewDto | null;
  leadModalHidden: boolean;
}

let state: AgentSessionState = {
  runtime: "none",
  toolCount: 0,
  agentActive: false,
  guidedDemoRunning: false,
  constraints: {},
  intentSummary: null,
  funnel: null,
  results: [],
  towResolution: null,
  locationResolution: null,
  searching: false,
  ledger: [],
  shortlist: [],
  focused: null,
  comparison: null,
  leadPreview: null,
  leadModalHidden: false,
};

const listeners = new Set<() => void>();
let ledgerSeq = 0;
let navigateFn: ((path: string) => void) | null = null;

function emit(): void {
  for (const l of listeners) l();
}

export function getSession(): AgentSessionState {
  return state;
}

function set(patch: Partial<AgentSessionState>): void {
  state = { ...state, ...patch };
  emit();
}

export function useAgentSession(): AgentSessionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

// ── Navigation bridge (registered by the router) ───────────────────────────

export function registerNavigate(fn: (path: string) => void): void {
  navigateFn = fn;
}

export function ensureOnShopPage(): void {
  if (typeof window !== "undefined" && !window.location.pathname.includes("/shop")) {
    navigateFn?.("/shop");
  }
}

// ── Mutations (each one is a ledger event) ─────────────────────────────────

export function logLedger(actor: LedgerActor, text: string, detail?: string): void {
  const entry: LedgerEntry = {
    id: ++ledgerSeq,
    at: new Date().toISOString(),
    actor,
    text,
    ...(detail ? { detail } : {}),
  };
  set({ ledger: [...state.ledger.slice(-79), entry] });
}

export function setRuntime(runtime: AgentRuntime, toolCount: number): void {
  set({ runtime, toolCount });
}

export function markAgentActive(): void {
  if (!state.agentActive) set({ agentActive: true });
}

export function setSearching(on: boolean): void {
  set({ searching: on });
}

export function setConstraints(constraints: Constraints, actor: LedgerActor, summary?: string): void {
  set({ constraints, ...(summary !== undefined ? { intentSummary: summary } : {}) });
  if (actor === "human") logLedger("human", summaryOfChange(summary ?? "adjusted the search constraints"));
}

function summaryOfChange(s: string): string {
  return s;
}

export function applySearchOutcome(args: {
  actor: LedgerActor;
  constraints: Constraints;
  funnel: SearchFunnel;
  results: UnitMatch[];
  towResolution: TowResolution | null;
  locationResolution: { place: string; lat: number; lng: number } | null;
  intentSummary?: string | null;
}): void {
  set({
    constraints: args.constraints,
    funnel: args.funnel,
    results: args.results,
    towResolution: args.towResolution,
    locationResolution: args.locationResolution,
    searching: false,
    ...(args.intentSummary !== undefined ? { intentSummary: args.intentSummary } : {}),
  });
  const f = args.funnel;
  logLedger(
    args.actor,
    args.actor === "agent"
      ? `searched ${f.totalUnits.toLocaleString()} units → ${f.passedHard} verified matches, ${f.unverified} unverified`
      : `updated the search — ${f.passedHard} verified matches, ${f.unverified} unverified`,
    f.excluded.slice(0, 4).map((e) => `${e.count} excluded: ${e.reason}`).join(" · "),
  );
}

export function setFocusedUnit(unit: CanonicalUnit | null, via: LedgerActor): void {
  set({ focused: unit ? { unit, via } : null });
  if (unit && via === "agent") logLedger("agent", `pulled full details for ${unit.title}`);
}

export function setComparison(payload: { comparison: CompareResult; units: CanonicalUnit[] } | null, via: LedgerActor): void {
  set({ comparison: payload });
  if (payload && via === "agent") {
    logLedger("agent", `compared ${payload.units.length} units side-by-side`);
  }
}

export function setTowResolution(resolution: TowResolution, via: LedgerActor): void {
  set({ towResolution: resolution });
  const label = resolution.matched?.label ?? resolution.input;
  logLedger(via, `${via === "agent" ? "evaluated" : "set"} tow vehicle: ${label}`);
}

export function toggleShortlist(entry: ShortlistEntry, actor: LedgerActor): "added" | "removed" {
  const exists = state.shortlist.some((s) => s.id === entry.id);
  set({
    shortlist: exists
      ? state.shortlist.filter((s) => s.id !== entry.id)
      : [...state.shortlist, entry],
  });
  logLedger(actor, `${exists ? "removed" : "added"} ${entry.title} ${exists ? "from" : "to"} the shortlist`);
  return exists ? "removed" : "added";
}

export function setLeadModalHidden(hidden: boolean): void {
  set({ leadModalHidden: hidden });
}

export function setLeadPreview(preview: LeadPreviewDto | null, via: LedgerActor): void {
  set({ leadPreview: preview, leadModalHidden: false });
  if (preview && via === "agent") {
    logLedger(
      "agent",
      `prepared a contact request to ${preview.dealer.name} — waiting for your approval`,
      "Nothing is sent until you approve it.",
    );
  }
}

export function updateLeadPreview(preview: LeadPreviewDto): void {
  set({ leadPreview: preview });
}

export function setGuidedDemo(on: boolean): void {
  set({ guidedDemoRunning: on });
}

/** Human-readable delta between two constraint objects, for ledger entries. */
export function describeConstraints(c: Constraints): string {
  const bits: string[] = [];
  if (c.rvTypes?.length) bits.push(c.rvTypes.map((t) => t.replace(/_/g, " ")).join("/"));
  if (c.priceMaxUsd != null) bits.push(`≤ $${c.priceMaxUsd.toLocaleString()}`);
  if (c.lengthMaxFt != null) bits.push(`≤ ${c.lengthMaxFt} ft`);
  if (c.towVehicle) bits.push(`tow: ${c.towVehicle}`);
  if (c.sleepsMin != null) bits.push(`sleeps ${c.sleepsMin}+`);
  if (c.mustHave?.length) bits.push(`must: ${c.mustHave.join(", ")}`);
  if (c.prefer?.length) bits.push(`prefer: ${c.prefer.join(", ")}`);
  if (c.location) bits.push(`${c.location.radiusMiles} mi of ${c.location.place}`);
  if (c.boondocking) bits.push("boondocking");
  return bits.join(" · ") || "no constraints yet";
}
