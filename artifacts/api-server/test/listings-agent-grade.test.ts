/**
 * GET /api/listings on the snapshot deploy (DISABLE_DB=1) is agent-grade:
 * unknown values are null (never a default), placeholders are gone, and each
 * listing carries freshness, the dealer's own link, availability, and
 * per-field provenance as additive fields.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

vi.hoisted(() => {
  process.env.DISABLE_DB = "1";
});

import app from "../src/app";
import { getInventory, gcsSnapshotEnabled } from "../src/services/agent-inventory";
import { agentFieldsForUnit, agentFieldsForRow } from "../src/services/listing-agent-fields";
import { getListingRows } from "../src/services/outfitter-inventory";

let server: Server;
let base = "";

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

type Json = Record<string, any>;

async function page(qs: string): Promise<Json[]> {
  const res = await fetch(`${base}/api/listings?${qs}`);
  expect(res.status).toBe(200);
  return ((await res.json()) as { listings: Json[] }).listings;
}

describe("GET /api/listings (snapshot deploy)", () => {
  it("never invents sleeps, slides, market value or days on market", async () => {
    const listings = await page("limit=100");
    expect(listings.length).toBeGreaterThan(0);
    const inv = getInventory();
    for (const l of listings) {
      const u = inv.byId.get(String(l.id))!;
      expect(u).toBeDefined();
      expect(l.sleeps).toBe(u.sleeps.value ?? null);
      expect(l.slides).toBe(u.slideouts.value ?? null);
      expect(l.marketValue).toBeNull();
      expect(l.daysOnMarket).toBeNull();
    }
  });

  it("returns null sleeps/slides for a unit whose dealer did not publish them", async () => {
    const rows = getListingRows();
    const inv = getInventory();
    const unknown = rows.find((r) => {
      const u = inv.byId.get(String(r.id))!;
      return Array.isArray(r.images) && (r.images as unknown[]).length > 0 && u.sleeps.value == null && u.slideouts.value == null;
    });
    expect(unknown).toBeDefined();
    const res = await fetch(`${base}/api/listings/${encodeURIComponent(String(unknown!.id))}`);
    expect(res.status).toBe(200);
    const l = (await res.json()) as Json;
    expect(l.sleeps).toBeNull();
    expect(l.slides).toBeNull();
    expect(l.sources.sleeps).toBeNull();
    expect(l.sources.slides).toBeNull();
  });

  it("adds freshness, dealer link, availability and per-field sources", async () => {
    const listings = await page("limit=50");
    const inv = getInventory();
    for (const l of listings) {
      const u = inv.byId.get(String(l.id))!;
      for (const k of ["lengthFt", "dryWeightLbs", "gvwrLbs", "listingUrl", "firstSeenAt", "lastSeenAt", "verifiedAt", "availability", "needsDealerConfirmation", "sources"]) {
        expect(l).toHaveProperty(k);
      }
      expect(l.lengthFt).toBe(u.lengthFt.value ?? null);
      expect(l.dryWeightLbs).toBe(u.dryWeightLbs.value ?? null);
      expect(l.gvwrLbs).toBe(u.gvwrLbs.value ?? null);
      expect(l.availability).toBe(u.status);
      expect(l.lastSeenAt).toBe(u.provenance.lastSeenAt);
      if (l.listingUrl !== null) expect(l.listingUrl).toMatch(/^https?:\/\//);
      expect(l.sources.price?.source ?? null).toBe(u.priceUsd.value == null ? null : u.priceUsd.source);
      expect(l.sources.lengthFt === null).toBe(u.lengthFt.value == null);
    }
  });

  it("keeps every field existing clients read", async () => {
    const [l] = await page("limit=1");
    for (const k of ["id", "title", "make", "model", "year", "type", "price", "marketValue", "dealScore", "location", "state", "dealerName", "dealerId", "images", "daysOnMarket", "sleeps", "slides", "condition", "isNew"]) {
      expect(l).toHaveProperty(k);
    }
  });
});

describe("agent field projection", () => {
  const unit = getInventory().units[0];
  it("prefers an explicit verifiedAt and flags stale or non-available units", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    const fresh = agentFieldsForUnit(
      { ...unit, status: "available", provenance: { ...unit.provenance, verifiedAt: "2026-11-17T02:00:00Z" } },
      now,
    );
    expect(fresh.verifiedAt).toBe("2026-11-17T02:00:00Z");
    expect(fresh.daysSinceVerified).toBe(0);
    expect(fresh.needsDealerConfirmation).toBe(false);
    const sold = agentFieldsForUnit({ ...unit, status: "sold", provenance: { ...unit.provenance, verifiedAt: "2026-11-17T02:00:00Z" } }, now);
    expect(sold.needsDealerConfirmation).toBe(true);
    const old = agentFieldsForUnit({ ...unit, status: "available", provenance: { ...unit.provenance, verifiedAt: "2026-11-01T00:00:00Z" } }, now);
    expect(old.needsDealerConfirmation).toBe(true);
  });

  it("database rows have no provenance, so freshness stays unknown", () => {
    const f = agentFieldsForRow({ length: 28, dry_weight: null, gvwr: "7600" });
    expect(f).toMatchObject({ lengthFt: 28, dryWeightLbs: null, gvwrLbs: 7600, availability: "unknown", verifiedAt: null, sources: null, needsDealerConfirmation: true });
  });
});

describe("Google Cloud inventory export loader", () => {
  it("is off by default", () => {
    expect(gcsSnapshotEnabled({})).toBe(false);
    expect(gcsSnapshotEnabled({ INVENTORY_GCS_ENABLED: "0" })).toBe(false);
    expect(gcsSnapshotEnabled({ INVENTORY_GCS_ENABLED: "true" })).toBe(true);
    expect(gcsSnapshotEnabled({ INVENTORY_GCS_ENABLED: "1" })).toBe(true);
  });

  it("pre-start script exits 0 without network when the flag is off", () => {
    const script = resolve(import.meta.dirname, "../scripts/fetch-gcs-snapshot.mjs");
    const env = { ...process.env, INVENTORY_GCS_BUCKET: "b", INVENTORY_SNAPSHOT_PATH: "/nonexistent/x.json.gz", GCP_SA_KEY_JSON: "{}" };
    delete env.INVENTORY_GCS_ENABLED;
    const r = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("INVENTORY_GCS_ENABLED is off");
  });

  it("pre-start script exits 0 and falls back when enabled but not configured", () => {
    const script = resolve(import.meta.dirname, "../scripts/fetch-gcs-snapshot.mjs");
    const env = { ...process.env, INVENTORY_GCS_ENABLED: "1" };
    delete env.INVENTORY_GCS_BUCKET;
    delete env.GCP_SA_KEY_JSON;
    const r = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("not configured; using the committed snapshot");
  });
});
