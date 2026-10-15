import { describe, expect, it } from "vitest";
import { chainStoreName, coordsMatchState, resolveDealerCoords } from "../src/enrich-snapshot.js";
import { haversineMiles } from "../src/geo.js";

const TACOMA = { lat: 47.2529, lng: -122.4443 };

describe("dealer geo guard", () => {
  it("never resolves Lakewood, CO to Lakewood, WA", () => {
    const co = resolveDealerCoords("Lakewood", "CO")!;
    expect(haversineMiles(co, TACOMA)).toBeGreaterThan(800);
    expect(haversineMiles(resolveDealerCoords("Lakewood", "WA")!, TACOMA)).toBeLessThan(15);
  });
  it("rejects coords that sit outside the dealer's state", () => {
    expect(coordsMatchState({ lat: 47.1718, lng: -122.5185 }, "CO")).toBe(false);
    expect(coordsMatchState({ lat: 47.1718, lng: -122.5185 }, "WA")).toBe(true);
  });
});

describe("chain store naming", () => {
  it("labels each Camping World store by its own city", () => {
    expect(chainStoreName("Camping World of Woodland", "Fife")).toBe("Camping World of Fife");
    expect(chainStoreName("Camping World of Woodland", "Woodland")).toBe("Camping World of Woodland");
    expect(chainStoreName("Tacoma RV", "Fife")).toBe("Tacoma RV");
  });
});
