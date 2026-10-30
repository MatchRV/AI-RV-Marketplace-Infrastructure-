import { afterEach, describe, expect, it } from "vitest";
import { buildContext, ConstraintError, parseZip, placeFromText, registerZipCentroids, resolvePlace, resolveSearchPlace } from "../src/index.js";

// Stand-in for the server's Census ZCTA table (agent-core itself ships no ZIP data: browser-safe).
const ZIPS: Record<string, { lat: number; lng: number }> = { "98402": { lat: 47.2538, lng: -122.4443 }, "98444": { lat: 47.1523, lng: -122.4489 } };
const install = () => registerZipCentroids((z) => ZIPS[z] ?? null);

describe("US ZIP search locations", () => {
  afterEach(() => registerZipCentroids(null));

  it("parses 5-digit, ZIP+4 and cued ZIPs", () => {
    expect(parseZip("98402")).toBe("98402");
    expect(parseZip("98402-1234")).toBe("98402");
    expect(parseZip("Tacoma, WA 98402")).toBe("98402");
    expect(parseZip("ZIP 98444")).toBe("98444");
    expect(parseZip("zip code: 98444")).toBe("98444");
    expect(parseZip("near 98402")).toBe("98402");
    expect(parseZip("Tacoma")).toBeNull();
    expect(parseZip("9840")).toBeNull();
    expect(parseZip("984021")).toBeNull();
  });

  it("resolves a ZIP to its centroid, labelled with the nearest supported city", () => {
    install();
    const r = resolveSearchPlace("98402")!;
    expect(r).toMatchObject({ lat: 47.2538, lng: -122.4443, zip: "98402", canonical: "ZIP 98402 (near Tacoma)" });
    expect(r.state).toBeUndefined(); // a ZIP is a radius search, never state-wide
    expect(resolveSearchPlace("Tacoma, WA 98402")).toMatchObject({ zip: "98402" });
    expect(resolveSearchPlace("ZIP 98444")).toMatchObject({ zip: "98444", lat: 47.1523 });
    expect(resolveSearchPlace("98402-1234")).toMatchObject({ zip: "98402" });
    // A plain city still resolves as before; dealer geocoding (resolvePlace) never reads ZIPs.
    expect(resolveSearchPlace("Tacoma")).toEqual(resolvePlace("Tacoma"));
    expect(resolvePlace("98402")).toBeNull();
  });

  it("buildContext uses the ZIP centroid within the radius", () => {
    install();
    const ctx = buildContext({ location: { place: "98402", radiusMiles: 50 } });
    expect(ctx.location).toMatchObject({ lat: 47.2538, lng: -122.4443, radiusMiles: 50 });
    expect(ctx.location?.state).toBeUndefined();
  });

  it("an unknown ZIP is a clear error that suggests a city", () => {
    install();
    let err: unknown;
    try { buildContext({ location: { place: "99999", radiusMiles: 50 } }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ConstraintError);
    expect((err as Error).message).toMatch(/Unknown place "99999".*ZIP code 99999 is not in the offline US Census/);
    expect((err as ConstraintError).hint).toMatch(/city instead, e\.g\. "Tacoma, WA"/);
  });

  it("an unknown ZIP after a city falls back to the stated city", () => {
    install();
    expect(resolveSearchPlace("Tacoma, WA 98499")).toMatchObject({ canonical: "Tacoma" });
  });

  it("without a ZIP table, a ZIP is rejected with a city suggestion", () => {
    expect(() => buildContext({ location: { place: "98402", radiusMiles: 50 } })).toThrow(/ZIP codes are not available/);
  });

  it("finds ZIPs in shopper text only with an explicit cue, never a price", () => {
    install();
    expect(placeFromText("used trailer near 98402 under $40,000")).toBe("98402");
    expect(placeFromText("my zip is 98444")).toBe("98444");
    expect(placeFromText("ZIP 98444 please")).toBe("98444");
    expect(placeFromText("we live in Tacoma, WA 98402")).toBe("98402");
    expect(placeFromText("budget is 98402")).toBeNull();
    expect(placeFromText("max price 98444")).toBeNull();
    expect(placeFromText("around Tacoma")).toBe("Tacoma");
  });
});
