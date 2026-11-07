import { describe, expect, it } from "vitest";
import { chainStoreName, coordsMatchState, lotDisplayName, resolveDealerCoords, resolveDealerLocation } from "../src/enrich-snapshot.js";
import { cityFromDealerName } from "../src/listing-reconcile.js";
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
  it("labels each Poulsbo lot by that lot's city, not the chain default", () => {
    expect(lotDisplayName("Poulsbo Rv Mt. Vernon", "Kent", "poulsborv.com")).toBe("Poulsbo RV of Kent");
    expect(lotDisplayName("Poulsbo Rv Mt. Vernon", "Sumner", "poulsborv.com")).toBe("Poulsbo RV of Sumner");
    expect(lotDisplayName("Poulsbo Rv Mt. Vernon", "Everett", "poulsborv.com")).toBe("Poulsbo RV of Everett");
    expect(lotDisplayName("Poulsbo Rv Mt. Vernon", "Mount Vernon", "poulsborv.com")).toBe("Poulsbo RV of Mount Vernon");
    expect(lotDisplayName("Poulsbo Rv Mt. Vernon", "", "poulsborv.com")).toBe("Poulsbo Rv Mt. Vernon");
  });
});

describe("dealer location from the unit's own evidence", () => {
  it("reads a lot city out of a dealer name and drops a repeated state abbreviation", () => {
    expect(cityFromDealerName("Meyers Rv Superstore - Bath Ny")).toBe("Bath");
    expect(cityFromDealerName("Meyers Rv Superstore - Ripley Wv")).toBe("Ripley");
    expect(cityFromDealerName("ClickIt RV - Union Gap")).toBe("Union Gap");
    expect(cityFromDealerName("RV Country - Mt. Vernon")).toBe("Mt. Vernon");
    expect(cityFromDealerName("Poulsbo Rv Mt. Vernon")).toBeNull();
  });
  it("geocodes published city spellings that already exist in the gazetteer", () => {
    expect(resolveDealerLocation("Schereville", "IN", "Camper Liquidators", "camperliquidators.com")?.city).toBe("Schererville");
    const battleGround = resolveDealerLocation("Battleground", "WA", "Independent Lot", "not-in-registry.example");
    expect(battleGround?.city).toBe("Battle Ground");
    expect(haversineMiles(battleGround!.coords, { lat: 45.781, lng: -122.5337 })).toBeLessThan(1);
    expect(resolveDealerLocation("Battleground", "OR", "Some Dealer", "example-or.test")).toBeNull();
    expect(resolveDealerLocation("Winston Salem", "NC", "Blue Compass RV", "bluecompassrv.com")).not.toBeNull();
    expect(resolveDealerLocation("North Charlestion", "SC", "Charleston Paradise", "charlestonparadise.com")).not.toBeNull();
    expect(resolveDealerLocation("Salt Lake", "UT", "Bish's RV", "bishs.com")?.city).toBe("Salt Lake City");
  });
  it("uses a blank-city dealer's own store name, and does not drop a multi-lot chain onto its default city", () => {
    expect(resolveDealerLocation("", "NY", "Meyers Rv Superstore - Bath Ny", "meyersrvsuperstores.com")?.city).toBe("Bath");
    expect(resolveDealerLocation("", "WA", "ClickIt RV - Union Gap", "clickitrv.com")?.city).toBe("Union Gap");
    expect(resolveDealerLocation("", "WA", "Poulsbo Rv Mt. Vernon", "poulsborv.com")).toBeNull();
    expect(resolveDealerLocation("", "WA", "RV Country - Mt. Vernon", "rvcountry.com")).toBeNull();
    expect(resolveDealerLocation("", "WA", "Fife RV Center", "fifervcenter.com")).toBeNull();
    expect(resolveDealerLocation("", "WA", "Apache Camping Center (3 WA locations)", "apachecamping.com")).toBeNull();
    expect(resolveDealerLocation("unknown", "WA", "RV Country - Mt. Vernon", "rvcountry.com")).toBeNull();
    expect(resolveDealerLocation("WA", "WA", "RV Country - Mt. Vernon", "rvcountry.com")).toBeNull();
    expect(resolveDealerLocation("Not A Real Place", "WA", "RV Country - Mt. Vernon", "rvcountry.com")).toBeNull();
    expect(resolveDealerLocation("Fife", "WA", "RV Country - Mt. Vernon", "rvcountry.com")?.city).toBe("Fife");
    expect(resolveDealerLocation("Not A Real Place", "WA", "Mystery Dealer", "mystery.example")).toBeNull();
  });
  it("keeps a stated lot city for Poulsbo, Fife RV, and RV Country Fife", () => {
    const poulsbo = resolveDealerLocation("Kent", "WA", "Poulsbo Rv Mt. Vernon", "poulsborv.com")!;
    const fifeRv = resolveDealerLocation("Fife", "WA", "Fife RV Center", "fifervcenter.com")!;
    const rvCountry = resolveDealerLocation("Fife", "WA", "RV Country", "rvcountry.com")!;
    expect(haversineMiles(poulsbo.coords, TACOMA)).toBeLessThan(20);
    expect(haversineMiles(fifeRv.coords, TACOMA)).toBeLessThan(10);
    expect(haversineMiles(rvCountry.coords, TACOMA)).toBeLessThan(10);
    expect(poulsbo.city).toBe("Kent");
    expect(fifeRv.city).toBe("Fife");
    expect(rvCountry.city).toBe("Fife");
  });
});
