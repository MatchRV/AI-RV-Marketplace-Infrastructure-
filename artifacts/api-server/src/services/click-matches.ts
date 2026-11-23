/**
 * Click matches: MatchRV ops' record that a shopper MatchRV sent to a dealer's site (GET /api/out)
 * shows up in the dealer's own records (a CRM export, or the dealer's analytics on utm_source=matchrv).
 * A click-only credit counts 0 until it is matched here. Recording the match ("match sent") starts the
 * dealer's dispute clock for that click.
 *
 * Stored as one small JSON file next to the outbound click log. No shopper details: only the click key
 * (one-way session hash + RV/dealer), the dealer record's date and where it came from.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { dataDirAcceptsWrites } from "./data-dir-freeze";
import { clicksPath, clickKey, firstClickForKey, persistenceEnabled } from "./outbound-clicks";
import { cleanClickMatch, emptyReview, type ClickMatch, type CreditReview } from "./lead-credit";

const KEY_RE = /^[a-f0-9]{32}\|[A-Za-z0-9._:-]{1,160}$/;

const matches = new Map<string, ClickMatch>();
let loaded = false;

export function clickMatchesPath(): string {
  return resolve(dirname(clicksPath()), "click-matches.json");
}

function load(): void {
  if (loaded) return;
  loaded = true;
  if (!persistenceEnabled()) return;
  try {
    const p = clickMatchesPath();
    if (!existsSync(p)) return;
    const file = JSON.parse(readFileSync(p, "utf8")) as { matches?: ClickMatch[] };
    for (const m of file.matches ?? []) if (m && typeof m.click_key === "string") matches.set(m.click_key, m);
  } catch (err) { console.warn("[click-matches] could not read:", err instanceof Error ? err.message : err); }
}

function persist(): boolean {
  if (!persistenceEnabled()) return true;
  try {
    const p = clickMatchesPath();
    mkdirSync(dirname(p), { recursive: true });
    const tmp = `${p}.tmp`;
    writeFileSync(tmp, JSON.stringify({ version: 1, matches: [...matches.values()] }));
    renameSync(tmp, p);
    return true;
  } catch (err) {
    console.warn("[click-matches] could not persist:", err instanceof Error ? err.message : err);
    return false;
  }
}

export function listClickMatches(): Map<string, ClickMatch> { load(); return new Map(matches); }
export function getClickMatch(key: string): ClickMatch | null { load(); return matches.get(key) ?? null; }

export type ClickMatchError = "invalid_key" | "click_not_found" | "frozen" | "invalid_source" | "date_required" | "invalid_date" | "date_in_future" | "write_failed";

/**
 * Records (or corrects) the dealer-record match for one click. A correction keeps the original
 * `matched_at` and any dispute, so fixing a typo never restarts the dealer's dispute clock.
 */
export function recordClickMatch(raw: Record<string, unknown>, now = Date.now()): { ok: true; match: ClickMatch; created: boolean } | { ok: false; code: ClickMatchError } {
  load();
  const key = typeof raw.click_key === "string" ? raw.click_key.trim() : "";
  if (!KEY_RE.test(key)) return { ok: false, code: "invalid_key" };
  const click = firstClickForKey(key);
  if (!click || clickKey(click) !== key) return { ok: false, code: "click_not_found" };
  const clean = cleanClickMatch(raw, { now, dealerState: click.dealerState ?? null, clickedAt: click.at });
  if (!clean.ok) return { ok: false, code: clean.code };
  if (!dataDirAcceptsWrites()) return { ok: false, code: "frozen" };
  const prev = matches.get(key);
  const match: ClickMatch = {
    click_key: key, dealer_id: click.dealerId, unit_id: click.unitId || null, dealer_state: click.dealerState ?? null,
    clicked_at: click.at, ...clean.value,
    matched_at: prev?.matched_at ?? new Date(now).toISOString(), by: "matchrv_ops",
    review: prev?.review ?? emptyReview(),
  };
  matches.set(key, match);
  if (!persist()) { if (prev) matches.set(key, prev); else matches.delete(key); return { ok: false, code: "write_failed" }; }
  return { ok: true, match, created: !prev };
}

/** Saves a dealer dispute review on a match (validated by the caller with cleanCreditReview). */
export function recordClickMatchReview(key: string, review: CreditReview): { ok: true; match: ClickMatch } | { ok: false; code: "not_found" | "frozen" | "write_failed" } {
  load();
  const prev = matches.get(key);
  if (!prev) return { ok: false, code: "not_found" };
  if (!dataDirAcceptsWrites()) return { ok: false, code: "frozen" };
  const match = { ...prev, review };
  matches.set(key, match);
  if (!persist()) { matches.set(key, prev); return { ok: false, code: "write_failed" }; }
  return { ok: true, match };
}

/** Test helper. */
export function __resetClickMatches(): void { matches.clear(); loaded = true; }
