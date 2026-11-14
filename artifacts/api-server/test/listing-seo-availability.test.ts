import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { CanonicalUnit } from "@workspace/agent-core";
import { availability, buildListingBodySummary, buildUnitJsonLd } from "../src/lib/listing-seo";

const snapshotPath = new URL("../../../lib/agent-core/data/inventory.snapshot.json", import.meta.url);
const snapshot = JSON.parse(
  existsSync(snapshotPath)
    ? readFileSync(snapshotPath, "utf8")
    : gunzipSync(readFileSync(new URL(`${snapshotPath.href}.gz`))).toString("utf8"),
);
const base = structuredClone((snapshot.units as CanonicalUnit[])[0]);
const withStatus = (status: CanonicalUnit["status"]): CanonicalUnit => ({ ...structuredClone(base), status });
const offerOf = (u: CanonicalUnit) => buildUnitJsonLd(u).offers as Record<string, unknown>;

describe("unit page JSON-LD availability (unknown stays unknown)", () => {
  it("omits availability entirely for unknown status — never InStock", () => {
    expect(availability({ status: "unknown" })).toBeUndefined();
    const offer = offerOf(withStatus("unknown"));
    expect("availability" in offer).toBe(false);
    expect(JSON.stringify(buildUnitJsonLd(withStatus("unknown")))).not.toContain("InStock");
  });

  it("maps pending to Reserved, not PreOrder", () => {
    expect(offerOf(withStatus("pending")).availability).toBe("https://schema.org/Reserved");
    expect(JSON.stringify(buildUnitJsonLd(withStatus("pending")))).not.toContain("PreOrder");
  });

  it("keeps available → InStock and removed → OutOfStock", () => {
    expect(offerOf(withStatus("available")).availability).toBe("https://schema.org/InStock");
    expect(offerOf(withStatus("removed")).availability).toBe("https://schema.org/OutOfStock");
  });
});

describe("unit page crawler summary freshness", () => {
  it("says when MatchRV last saw an available unit and never claims live stock", () => {
    const u = withStatus("available");
    u.provenance.lastSeenAt = "2026-11-10T04:47:46.000Z";
    const html = buildListingBodySummary(u);
    expect(html).toContain(`Listed as available on the dealer's site when MatchRV last saw it on <time datetime="2026-11-10">2026-11-10</time>`);
    expect(html).toContain("Confirm with the dealership.");
    expect(html).not.toMatch(/in stock|available now/i);
  });

  it("prints no availability claim for unknown status, only the last-seen date", () => {
    const u = withStatus("unknown");
    u.provenance.lastSeenAt = "2026-11-10T04:47:46.000Z";
    const html = buildListingBodySummary(u);
    expect(html).not.toContain("Listed as available");
    expect(html).toContain("Last seen on the dealer's site");
  });
});
