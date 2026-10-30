import { describe, expect, it } from "vitest";
import { haversineMiles, resolvePlace, resolveSearchPlace } from "@workspace/agent-core";
import { lookupZipCentroid, parseZipTable, zipTableLoaded } from "../src/services/zip-centroids";

describe("Census ZCTA ZIP table (lazy)", () => {
  it("is not read until the first ZIP lookup", () => {
    expect(zipTableLoaded()).toBe(false);
    lookupZipCentroid("98402");
    expect(zipTableLoaded()).toBe(true);
  });

  it("98402 resolves to downtown Tacoma, ZIP 98444 to Parkland", () => {
    const tacoma = resolvePlace("Tacoma")!;
    const z = lookupZipCentroid("98402")!;
    expect(haversineMiles(z, tacoma)).toBeLessThan(1);
    expect(haversineMiles(lookupZipCentroid("98444")!, tacoma)).toBeLessThan(10);
    expect(resolveSearchPlace("Tacoma, WA 98402")).toMatchObject({ zip: "98402", canonical: "ZIP 98402 (near Tacoma)" });
    expect(resolveSearchPlace("ZIP 98444")).toMatchObject({ zip: "98444" });
  });

  it("covers the country and rejects unknown ZIPs", () => {
    expect(lookupZipCentroid("10001")).not.toBeNull(); // New York, NY
    expect(lookupZipCentroid("90210")).not.toBeNull();
    expect(lookupZipCentroid("00601")).not.toBeNull(); // first row
    expect(lookupZipCentroid("99999")).toBeNull();
    expect(lookupZipCentroid("00000")).toBeNull();
    expect(lookupZipCentroid("9840")).toBeNull();
  });

  it("parses the compact format", () => {
    const t = parseZipTable("00601\t181806\t-667500\n98402\t472538\t-1224443\n");
    expect(Array.from(t.zips)).toEqual([601, 98402]);
    expect(t.lat[1] / 1e4).toBe(47.2538);
  });
});
