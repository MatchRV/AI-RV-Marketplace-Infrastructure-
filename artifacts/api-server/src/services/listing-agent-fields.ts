/**
 * Agent-grade fields for GET /api/listings and /api/listings/:id.
 *
 * Additive and optional: existing clients keep every field they already read.
 * Rules (same as the MCP layer): unknown is null, never a default; every
 * spec says where it came from; availability is what the dealer's page showed
 * and when, never a live stock check.
 */
import type { CanonicalUnit, Fact } from "@workspace/agent-core";
import { verifiedAtFor } from "./inventory-state-freshness";

export interface FieldSource {
  source: string | null;
  confidence: string | null;
  sourceUrl: string | null;
  observedAt: string | null;
}

export type ListingSourceSummary = Record<
  "price" | "lengthFt" | "dryWeightLbs" | "gvwrLbs" | "sleeps" | "slides",
  FieldSource | null
>;

export interface ListingAgentFields {
  lengthFt: number | null;
  dryWeightLbs: number | null;
  gvwrLbs: number | null;
  /** The dealer's own page for this unit, when MatchRV has it. */
  listingUrl: string | null;
  /** When MatchRV first saw the unit on the dealer's site (not the dealer's own list date). */
  firstSeenAt: string | null;
  /** When MatchRV last saw the unit on the dealer's site. */
  lastSeenAt: string | null;
  /** Explicit verification time when present, else lastSeenAt. */
  verifiedAt: string | null;
  /** Dealer-stated availability as last seen: available | pending | sold | removed | unknown. */
  availability: string;
  daysSinceVerified: number | null;
  /** True unless the dealer showed it available within the last 2 days. */
  needsDealerConfirmation: boolean;
  /** Per-field provenance; null entry = the value is unknown. */
  sources: ListingSourceSummary | null;
}

const isoOrNull = (s: string | null | undefined): string | null =>
  s && Number.isFinite(Date.parse(s)) ? s : null;

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function factSource(f: Fact<unknown> | undefined): FieldSource | null {
  if (!f || f.value === null || f.value === undefined) return null;
  return {
    source: f.source ?? null,
    confidence: f.confidence ?? null,
    sourceUrl: f.sourceUrl ?? null,
    observedAt: f.observedAt ?? null,
  };
}

export function daysSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t) || t > now.getTime()) return null;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/** Agent fields for a snapshot unit (DISABLE_DB=1 deploy). */
export function agentFieldsForUnit(unit: CanonicalUnit, now: Date = new Date()): ListingAgentFields {
  const p = unit.provenance ?? ({} as CanonicalUnit["provenance"]);
  const verifiedAt = verifiedAtFor(unit);
  const daysSinceVerified = daysSince(verifiedAt, now);
  const listingUrl = /^https?:\/\//i.test(p.listingUrl ?? "") ? (p.listingUrl as string) : null;
  return {
    lengthFt: unit.lengthFt?.value ?? null,
    dryWeightLbs: unit.dryWeightLbs?.value ?? null,
    gvwrLbs: unit.gvwrLbs?.value ?? null,
    listingUrl,
    firstSeenAt: isoOrNull(p.firstSeenAt),
    lastSeenAt: isoOrNull(p.lastSeenAt),
    verifiedAt,
    availability: unit.status ?? "unknown",
    daysSinceVerified,
    needsDealerConfirmation: unit.status !== "available" || daysSinceVerified === null || daysSinceVerified > 2,
    sources: {
      price: factSource(unit.priceUsd),
      lengthFt: factSource(unit.lengthFt),
      dryWeightLbs: factSource(unit.dryWeightLbs),
      gvwrLbs: factSource(unit.gvwrLbs),
      sleeps: factSource(unit.sleeps),
      slides: factSource(unit.slideouts),
    },
  };
}

/**
 * Agent fields for a database row (classic Postgres/PGlite mode). The listings
 * table has no provenance or freshness columns, so those stay null/unknown.
 */
export function agentFieldsForRow(row: Record<string, unknown>): ListingAgentFields {
  return {
    lengthFt: numOrNull(row.length),
    dryWeightLbs: numOrNull(row.dry_weight ?? row.dryWeight),
    gvwrLbs: numOrNull(row.gvwr),
    listingUrl: null,
    firstSeenAt: null,
    lastSeenAt: null,
    verifiedAt: null,
    availability: "unknown",
    daysSinceVerified: null,
    needsDealerConfirmation: true,
    sources: null,
  };
}
