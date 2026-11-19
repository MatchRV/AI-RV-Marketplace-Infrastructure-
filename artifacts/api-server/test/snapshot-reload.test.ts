// In-process snapshot reload: validation, atomic swap, per-snapshot cache invalidation,
// coalescing, the localhost-only guard, and that in-memory leads survive a reload.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

const dir = mkdtempSync(join(tmpdir(), "matchrv-reload-"));
const livePath = join(dir, "inventory.snapshot.json.gz");
// Set before any module reads it: getInventory() resolves the path lazily on first use.
process.env.INVENTORY_SNAPSHOT_PATH = livePath;

const repoSnapshot = JSON.parse(
  gunzipSync(readFileSync(new URL("../../../lib/agent-core/data/inventory.snapshot.json.gz", import.meta.url))).toString("utf8"),
);
function fixture(units: unknown[], builtAt = repoSnapshot.builtAt) {
  return gzipSync(Buffer.from(JSON.stringify({ ...repoSnapshot, builtAt, stats: { ...repoSnapshot.stats, units: units.length }, units })));
}
const unitsA = repoSnapshot.units.slice(0, 300);
const unitsB = unitsA.slice(0, 280); // -6.7%: allowed
const unitsC = unitsB.slice(0, 240); // -14% vs B: rejected
const removedId: string = unitsA[290].id;

const inv = await import("../src/services/agent-inventory");
const reload = await import("../src/services/snapshot-reload");
const listings = await import("../src/services/snapshot-listings");
const { getScreenedInventory } = await import("../src/services/screened-inventory");
const { readyUnits } = await import("../src/services/search-ready");
const leads = await import("../src/services/agent-leads");
const { isDirectLoopbackRequest } = await import("../src/routes/internal");

beforeAll(() => {
  writeFileSync(livePath, fixture(unitsA, "2026-01-01T00:00:00.000Z"));
  reload.resetSnapshotReloadState();
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("snapshot reload", () => {
  it("serves the initial snapshot with a version", () => {
    expect(inv.getInventory().units.length).toBe(300);
    const v = inv.currentSnapshotVersion()!;
    expect(v.units).toBe(300);
    expect(v.version).toMatch(/^[0-9a-f]{16}$/);
    expect(v.resolvedPath).toBe(livePath);
  });

  it("reports unchanged when the file bytes are the same", async () => {
    const before = inv.getInventory();
    const out = await reload.reloadSnapshot("test");
    expect(out.status).toBe("unchanged");
    expect(inv.getInventory()).toBe(before);
  });

  it("swaps in a valid new snapshot, invalidating every per-snapshot cache; leads are untouched", async () => {
    const oldIndex = inv.getInventory();
    const oldVersion = inv.currentSnapshotVersion()!;
    const oldScreened = getScreenedInventory();
    const oldListings = listings.querySnapshotListings({ limit: "1" });
    expect(oldListings.total).toBe(listings.querySnapshotListingsUncached({ limit: "1" }).total);
    const oldCounts = listings.snapshotInventoryCounts();
    expect(listings.getSnapshotListingById(removedId)).toBeTruthy();
    const readyBefore = readyUnits().length;

    const unit = oldIndex.units[0];
    const { preview } = leads.createPreview({ unit, customer: { name: "Reload Test", email: "reload@example.com" }, message: "hi" });

    writeFileSync(livePath, fixture(unitsB, "2026-01-02T00:00:00.000Z"));
    const out = await reload.reloadSnapshot("test");
    expect(out.status).toBe("swapped");
    if (out.status !== "swapped") return;
    expect(out.previous?.version).toBe(oldVersion.version);
    expect(out.current.units).toBe(280);
    expect(out.current.builtAt).toBe("2026-01-02T00:00:00.000Z");

    const now = inv.getInventory();
    expect(now).not.toBe(oldIndex);
    expect(now.units.length).toBe(280);
    expect(inv.currentSnapshotVersion()!.version).not.toBe(oldVersion.version);
    expect(getScreenedInventory()).not.toBe(oldScreened);
    expect(getScreenedInventory().units.length).toBeLessThanOrEqual(280);
    expect(listings.getSnapshotListingById(removedId)).toBeUndefined();
    const fresh = listings.querySnapshotListings({ limit: "1" });
    expect(fresh).toEqual(listings.querySnapshotListingsUncached({ limit: "1" }));
    expect(fresh.total).toBeLessThan(oldListings.total);
    expect(listings.snapshotInventoryCounts().total).toBeLessThan(oldCounts.total);
    expect(readyUnits().length).toBeLessThanOrEqual(readyBefore);

    // In-memory leads live outside the snapshot and survive the swap.
    const kept = leads.getPreview(preview.previewId);
    expect(kept?.customer.email).toBe("reload@example.com");
    expect(kept?.status).toBe("awaiting_human_approval");

    const status = reload.snapshotStatus();
    expect(status.units).toBe(280);
    expect(status.reload.counts.swapped).toBe(1);
    expect(status.reload.last?.status).toBe("swapped");
  });

  it("rejects a corrupt file and keeps serving the old data", async () => {
    const before = inv.getInventory();
    const v = inv.currentSnapshotVersion()!.version;
    writeFileSync(livePath, Buffer.from("this is not gzip"));
    const out = await reload.reloadSnapshot("test");
    expect(out.status).toBe("rejected");
    expect(inv.getInventory()).toBe(before);
    expect(inv.currentSnapshotVersion()!.version).toBe(v);
    expect(listings.querySnapshotListings({ limit: "1" })).toEqual(listings.querySnapshotListingsUncached({ limit: "1" }));
  });

  it("rejects valid gzip that is not a snapshot, and an empty snapshot", async () => {
    const before = inv.getInventory();
    writeFileSync(livePath, gzipSync(Buffer.from('{"nope": true}')));
    expect((await reload.reloadSnapshot("test")).status).toBe("rejected");
    writeFileSync(livePath, fixture([]));
    const out = await reload.reloadSnapshot("test");
    expect(out.status).toBe("rejected");
    expect(inv.getInventory()).toBe(before);
  });

  it("rejects a drop of more than 10% and keeps serving the old data", async () => {
    const before = inv.getInventory();
    writeFileSync(livePath, fixture(unitsC));
    const out = await reload.reloadSnapshot("test");
    expect(out.status).toBe("rejected");
    if (out.status === "rejected") expect(out.reason).toMatch(/drop/i);
    expect(inv.getInventory()).toBe(before);
    expect(inv.getInventory().units.length).toBe(280);
    expect(reload.snapshotStatus().reload.counts.rejected).toBeGreaterThanOrEqual(4);
  });

  it("coalesces concurrent reloads into one running and one queued run", async () => {
    writeFileSync(livePath, fixture(unitsA, "2026-01-03T00:00:00.000Z"));
    const p1 = reload.reloadSnapshot("test");
    const p2 = reload.reloadSnapshot("test");
    const p3 = reload.reloadSnapshot("test");
    expect(p2).toBe(p3);
    expect(p1).not.toBe(p2);
    expect(reload.snapshotStatus().reload.inProgress).toBe(true);
    const [o1, o2] = await Promise.all([p1, p2]);
    expect(o1.status).toBe("swapped");
    expect(o2.status).toBe("unchanged");
    expect(inv.getInventory().units.length).toBe(300);
    expect(reload.snapshotStatus().reload.inProgress).toBe(false);
  });
});

describe("localhost-only internal routes", () => {
  const req = (remoteAddress: string, headers: Record<string, string> = {}) => ({ socket: { remoteAddress }, headers }) as never;
  it("accepts only direct loopback callers with no proxy headers", () => {
    expect(isDirectLoopbackRequest(req("127.0.0.1"))).toBe(true);
    expect(isDirectLoopbackRequest(req("::1"))).toBe(true);
    expect(isDirectLoopbackRequest(req("::ffff:127.0.0.1"))).toBe(true);
    expect(isDirectLoopbackRequest(req("10.0.0.5"))).toBe(false);
    expect(isDirectLoopbackRequest(req("203.0.113.9"))).toBe(false);
    // Caddy connects from 127.0.0.1 but always adds X-Forwarded-For: a proxied public request is refused.
    expect(isDirectLoopbackRequest(req("127.0.0.1", { "x-forwarded-for": "203.0.113.9" }))).toBe(false);
    expect(isDirectLoopbackRequest(req("127.0.0.1", { forwarded: "for=203.0.113.9" }))).toBe(false);
    expect(isDirectLoopbackRequest(req("127.0.0.1", { "x-real-ip": "203.0.113.9" }))).toBe(false);
  });

  it("serves status and reload to localhost and 404s proxied calls", async () => {
    const { default: app } = await import("../src/app");
    const server: Server = await new Promise((r) => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const status = await fetch(`${base}/internal/snapshot-status`);
      expect(status.status).toBe(200);
      const body = await status.json();
      expect(body.units).toBe(inv.getInventory().units.length);
      expect(body.snapshot.version).toBe(inv.currentSnapshotVersion()!.version);
      expect(status.headers.get("cache-control")).toContain("no-store");

      const proxied = await fetch(`${base}/internal/reload-snapshot`, { method: "POST", headers: { "X-Forwarded-For": "203.0.113.9" } });
      expect(proxied.status).toBe(404);
      const proxiedStatus = await fetch(`${base}/internal/snapshot-status`, { headers: { "X-Forwarded-For": "203.0.113.9" } });
      expect(proxiedStatus.status).toBe(404);

      const ok = await fetch(`${base}/internal/reload-snapshot`, { method: "POST" });
      expect(ok.status).toBe(200);
      expect((await ok.json()).status).toBe("unchanged");

      writeFileSync(livePath, fixture(unitsC));
      const bad = await fetch(`${base}/internal/reload-snapshot`, { method: "POST" });
      expect(bad.status).toBe(422);
      expect((await bad.json()).status).toBe("rejected");
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
