import { describe, it, expect } from "vitest";
import { gzipSync, gunzipSync } from "node:zlib";
import { parseSnapshotBuffer } from "../src/services/agent-inventory";

describe("snapshot loader (per-unit parse)", () => {
  it("matches JSON.parse, including escapes, brackets in strings and a later 'units' key", () => {
    const doc = {
      schemaVersion: 1, datasetNote: 'say "units":[ here', stats: { units: 2 },
      units: [{ id: "a", t: 'x]}\\"{[', n: [1, { y: [] }], s: "é ✓" }, { id: "b", nested: { units: [3] } }],
    };
    const text = JSON.stringify(doc);
    expect(parseSnapshotBuffer(Buffer.from(text, "utf8"))).toEqual(doc);
    expect(parseSnapshotBuffer(gunzipSync(gzipSync(Buffer.from(text))))).toEqual(doc);
  });
  it("shares repeated string values without changing them", () => {
    const doc = { units: [{ d: "Same Dealer" }, { d: "Same Dealer" }] };
    const out = parseSnapshotBuffer(Buffer.from(JSON.stringify(doc)));
    expect(out.units).toEqual(doc.units);
  });
});
