/**
 * Shopper fit — RV-fit facts collected during the ChatGPT interview (Golden
 * Ticket) and attached to a dealer inquiry so MatchRV ops / dealers see
 * budget, tow vehicle, party size, etc.
 *
 * Privacy rules (same as the interview tools):
 *   - Only RV-fit facts. Never income, credit, SSN, or conversation-only
 *     rapport answers (time off, who's buying, the trade, trips).
 *   - Only facts the shopper actually stated. Never guess or fill blanks.
 *   - Never put fit facts in ntfy pushes (topics are not private).
 *
 * Linkage without changing MCP tool schemas: search_rvs already receives the
 * fit fields on every call. We remember the latest non-empty snapshot per
 * shopper scope (openai/subject, mcp-session-id, …). send_dealer_inquiry then
 * attaches that snapshot to the stored inquiry. PublicInquiry (what the model
 * sees) is unchanged — fit lives only on the ops record and in dealer/ops
 * email / forward text.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { dataDirAcceptsWrites, registerDataWriter } from "./data-dir-freeze";
import type { MemoryScope } from "./learned-store";

const FIT_TTL_MS = Number(process.env.SHOPPER_FIT_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000;
const MAX_SCOPES = 20_000;

export interface ShopperFit {
  rvTypes?: string[];
  useTypes?: string[];
  desiredFeatures?: string[];
  condition?: "new" | "used" | "any";
  partySize?: number;
  towVehicle?: string;
  towedVehicle?: string;
  lengthMaxFt?: number;
  lengthReason?: "storage" | "comfort" | "hard_limit";
  noLengthLimit?: true;
  location?: string;
  paymentMethod?: "cash" | "finance";
  budgetMaxUsd?: number;
  downPaymentUsd?: number;
  monthlyPaymentUsd?: number;
}

const FEATURE_SET = new Set([
  "bunkhouse", "outdoor_kitchen", "solar", "solar_prep", "lithium", "generator", "four_season", "two_entry_doors",
]);
const RV_TYPES = new Set([
  "travel_trailer", "fifth_wheel", "toy_hauler", "class_a", "class_b", "class_c", "popup_camper", "truck_camper",
]);
const USE_TYPES = new Set(["living", "camping", "tailgating", "traveling"]);

const cleanStr = (s: unknown, max: number): string | undefined => {
  if (typeof s !== "string") return undefined;
  const t = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().replace(/\s+/g, " ");
  if (!t || t.length > max) return undefined;
  // Never keep anything that looks like PII / sensitive beyond fit.
  if (/ssn|social.?security|credit.?score|income|salary|\$\/yr/i.test(t)) return undefined;
  return t;
};

const cleanNum = (n: unknown, min: number, max: number): number | undefined => {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  if (n < min || n > max) return undefined;
  return n;
};

const cleanEnum = <T extends string>(v: unknown, allowed: readonly T[]): T | undefined =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

const cleanList = (v: unknown, allowed: Set<string>, max: number): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.filter((x): x is string => typeof x === "string" && allowed.has(x)))].slice(0, max);
  return out.length ? out : undefined;
};

/** Keep only stated RV-fit facts. Omits blanks; never invents. */
export function sanitizeFit(raw: unknown): ShopperFit | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const fit: ShopperFit = {};
  const rvTypes = cleanList(r.rvTypes ?? r.rv_types, RV_TYPES, 8);
  if (rvTypes) fit.rvTypes = rvTypes;
  const useTypes = cleanList(r.useTypes ?? r.use_type, USE_TYPES, 4);
  if (useTypes) fit.useTypes = useTypes;
  const desired = cleanList(r.desiredFeatures ?? r.desired_features, FEATURE_SET, 8);
  if (desired) fit.desiredFeatures = desired;
  const condition = cleanEnum(r.condition, ["new", "used", "any"] as const);
  if (condition) fit.condition = condition;
  const partySize = cleanNum(r.partySize ?? r.party_size, 1, 14);
  if (partySize != null) fit.partySize = Math.round(partySize);
  const towVehicle = cleanStr(r.towVehicle ?? r.tow_vehicle, 120);
  if (towVehicle && !/^(none|n\/a|na|not sure|none yet|unknown)$/i.test(towVehicle)) fit.towVehicle = towVehicle;
  const towedVehicle = cleanStr(r.towedVehicle ?? r.towed_vehicle, 120);
  if (towedVehicle) fit.towedVehicle = towedVehicle;
  if (r.noLengthLimit === true || r.no_length_limit === true) fit.noLengthLimit = true;
  else {
    const lengthMaxFt = cleanNum(r.lengthMaxFt ?? r.length_max_ft, 8, 60);
    if (lengthMaxFt != null) fit.lengthMaxFt = lengthMaxFt;
  }
  const lengthReason = cleanEnum(r.lengthReason ?? r.length_reason, ["storage", "comfort", "hard_limit"] as const);
  if (lengthReason) fit.lengthReason = lengthReason;
  const location = cleanStr(r.location, 80);
  if (location) fit.location = location;
  const paymentMethod = cleanEnum(r.paymentMethod ?? r.payment_method, ["cash", "finance"] as const);
  if (paymentMethod) fit.paymentMethod = paymentMethod;
  const budgetMaxUsd = cleanNum(r.budgetMaxUsd ?? r.budget_max_usd, 0, 2_000_000);
  if (budgetMaxUsd != null) fit.budgetMaxUsd = budgetMaxUsd;
  const downPaymentUsd = cleanNum(r.downPaymentUsd ?? r.down_payment_usd, 0, 2_000_000);
  if (downPaymentUsd != null) fit.downPaymentUsd = downPaymentUsd;
  const monthlyPaymentUsd = cleanNum(r.monthlyPaymentUsd ?? r.monthly_payment_usd, 0, 50_000);
  if (monthlyPaymentUsd != null) fit.monthlyPaymentUsd = monthlyPaymentUsd;
  return Object.keys(fit).length ? fit : undefined;
}

/** Build a fit snapshot from search_rvs / outfitter_discovery tool input (already-validated fields). */
export function fitFromToolInput(input: Record<string, unknown>): ShopperFit | undefined {
  return sanitizeFit({
    rv_types: input.rv_types,
    use_type: input.use_type,
    desired_features: input.desired_features,
    condition: input.condition,
    party_size: input.party_size ?? input.sleeps_min,
    tow_vehicle: input.tow_vehicle,
    towed_vehicle: input.towed_vehicle,
    length_max_ft: input.length_max_ft,
    no_length_limit: input.no_length_limit,
    length_reason: input.length_reason,
    location: input.location,
    payment_method: input.payment_method,
    budget_max_usd: input.budget_max_usd ?? input.price_max_usd,
    down_payment_usd: input.down_payment_usd,
    monthly_payment_usd: input.monthly_payment_usd,
  });
}

/** Merge two fits: later stated fields win; never clears a prior stated field with a blank. */
export function mergeFit(prev: ShopperFit | undefined, next: ShopperFit | undefined): ShopperFit | undefined {
  if (!prev) return next;
  if (!next) return prev;
  const out: ShopperFit = { ...prev };
  for (const [k, v] of Object.entries(next) as [keyof ShopperFit, ShopperFit[keyof ShopperFit]][]) {
    if (v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0)) (out as Record<string, unknown>)[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Human lines for the ops inbox / dealer forward text. Omits blanks. */
export function formatFitLines(fit: ShopperFit | null | undefined): string[] {
  if (!fit) return [];
  const lines: string[] = [];
  if (fit.rvTypes?.length) lines.push(`RV type: ${fit.rvTypes.map((t) => t.replace(/_/g, " ")).join(", ")}`);
  if (fit.condition && fit.condition !== "any") lines.push(`Condition: ${fit.condition}`);
  if (fit.useTypes?.length) lines.push(`Use: ${fit.useTypes.join(", ")}`);
  if (fit.desiredFeatures?.length) lines.push(`Features wanted: ${fit.desiredFeatures.map((f) => f.replace(/_/g, " ")).join(", ")}`);
  if (fit.partySize != null) lines.push(`Party size: ${fit.partySize}`);
  if (fit.towVehicle) lines.push(`Tow vehicle: ${fit.towVehicle}`);
  if (fit.towedVehicle) lines.push(`Towed behind: ${fit.towedVehicle}`);
  if (fit.noLengthLimit) lines.push("Length: no limit stated");
  else if (fit.lengthMaxFt != null) lines.push(`Length max: ${fit.lengthMaxFt} ft${fit.lengthReason ? ` (${fit.lengthReason})` : ""}`);
  if (fit.location) lines.push(`Shopping area: ${fit.location}`);
  if (fit.paymentMethod) lines.push(`Payment: ${fit.paymentMethod}`);
  if (fit.budgetMaxUsd != null) lines.push(`Budget max: ${money(fit.budgetMaxUsd)}`);
  if (fit.downPaymentUsd != null) lines.push(`Down payment: ${money(fit.downPaymentUsd)}`);
  if (fit.monthlyPaymentUsd != null) lines.push(`Monthly payment target: ${money(fit.monthlyPaymentUsd)}`);
  return lines;
}

// ── Per-scope stash (ChatGPT → inquiry linkage) ────────────────────────────

interface FitEntry { fit: ShopperFit; touchedAt: number }
const fits = new Map<string, FitEntry>();
let loaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let diskDirty = false;
let persistenceEnabled = process.env.NODE_ENV !== "test" && !process.env.VITEST;

function storePath(): string {
  if (process.env.SHOPPER_FIT_PATH) return resolve(process.env.SHOPPER_FIT_PATH);
  if (process.env.LEARNED_FACTS_PATH) return resolve(dirname(resolve(process.env.LEARNED_FACTS_PATH)), "shopper-fit.json");
  return resolve("data/shopper-fit.json");
}

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!persistenceEnabled) return;
  try {
    const p = storePath();
    if (!existsSync(p)) return;
    const raw = JSON.parse(readFileSync(p, "utf8")) as Record<string, FitEntry>;
    const cutoff = Date.now() - FIT_TTL_MS;
    for (const [id, entry] of Object.entries(raw)) {
      if (!entry?.fit || entry.touchedAt < cutoff) continue;
      const fit = sanitizeFit(entry.fit);
      if (fit) fits.set(id, { fit, touchedAt: entry.touchedAt });
    }
  } catch (err) {
    console.warn("[shopper-fit] could not restore:", err instanceof Error ? err.message : err);
  }
}

function sweep(): void {
  const cutoff = Date.now() - FIT_TTL_MS;
  for (const [id, e] of fits) if (e.touchedAt < cutoff) fits.delete(id);
  if (fits.size > MAX_SCOPES) {
    const oldest = [...fits.entries()].sort((a, b) => a[1].touchedAt - b[1].touchedAt).slice(0, fits.size - MAX_SCOPES);
    for (const [id] of oldest) fits.delete(id);
  }
}

function persistSync(): void {
  if (!persistenceEnabled) return;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const out: Record<string, FitEntry> = {};
  for (const [id, e] of fits) out[id] = e;
  try {
    const p = storePath();
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(out));
    renameSync(tmp, p);
    diskDirty = false;
  } catch (err) {
    diskDirty = true;
    console.warn("[shopper-fit] could not persist:", err instanceof Error ? err.message : err);
  }
}
function persistSoon(): void {
  if (!persistenceEnabled) return;
  diskDirty = true;
  if (!dataDirAcceptsWrites()) return;
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; persistSync(); }, 400);
}
function fitPending(): boolean {
  return persistenceEnabled && (diskDirty || saveTimer != null);
}
registerDataWriter({ name: "shopper-fit", pending: fitPending, flush: persistSync });

/** Remember the latest fit facts for this shopper scope (from search_rvs). No-op without a scope or empty fit. */
export function rememberFit(scope: MemoryScope, raw: ShopperFit | undefined): void {
  if (!dataDirAcceptsWrites()) return;
  if (!scope.id || !raw) return;
  load();
  const next = sanitizeFit(raw);
  if (!next) return;
  const prev = fits.get(scope.id)?.fit;
  const merged = mergeFit(prev, next);
  if (!merged) return;
  fits.set(scope.id, { fit: merged, touchedAt: Date.now() });
  sweep();
  persistSoon();
}

/** Recall fit facts for this shopper scope, or undefined. */
export function recallFit(scope: MemoryScope): ShopperFit | undefined {
  if (!scope.id) return undefined;
  load();
  const e = fits.get(scope.id);
  if (!e || e.touchedAt < Date.now() - FIT_TTL_MS) return undefined;
  return e.fit;
}

/** Deterministic fingerprint for tests (separate from learned-store memory). */
export function fitFingerprint(): string {
  const parts = [...fits.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, e]) => `${id}:${e.touchedAt}:${JSON.stringify(e.fit)}`);
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

export function __resetShopperFit(): void {
  fits.clear();
  loaded = true;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  diskDirty = false;
}
export function __enableFitPersistence(on: boolean): void {
  persistenceEnabled = on;
  if (!on && saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!on) diskDirty = false;
}
