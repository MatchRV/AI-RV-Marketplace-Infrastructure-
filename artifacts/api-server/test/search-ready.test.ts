import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSearchReady, readyUnits, searchReadyInventory, usablePhotoUrl, SEARCHABLE_UNITS_NOTE } from "../src/services/search-ready";
import { getInventory } from "../src/services/agent-inventory";

describe("search readiness gate", () => {
  it("requires actual identity, photos and published key specifications", () => {
    const unit=readyUnits()[0];
    expect(isSearchReady(unit)).toBe(true);
    expect(isSearchReady({...unit,images:[]})).toBe(false);
    expect(isSearchReady({...unit,model:"Unknown"})).toBe(false);
    expect(isSearchReady({...unit,sleeps:{value:4,source:"computed",confidence:"low"}})).toBe(false);
    expect(isSearchReady({...unit,status:"removed"})).toBe(false);
    expect(isSearchReady({...unit,priceUsd:{value:null,source:null,confidence:null}})).toBe(false);
    const noWeight = { value: null, source: null, confidence: null } as const;
    const motorhome = { ...unit, rvType: "class_a" as const, gvwrLbs: noWeight, dryWeightLbs: noWeight };
    expect(isSearchReady(motorhome)).toBe(true);
    expect(motorhome.gvwrLbs.value).toBeNull();
    expect(motorhome.dryWeightLbs.value).toBeNull();
    expect(isSearchReady({ ...unit, rvType: "class_b" as const, gvwrLbs: noWeight, dryWeightLbs: noWeight })).toBe(true);
    expect(isSearchReady({ ...unit, rvType: "class_c" as const, gvwrLbs: noWeight, dryWeightLbs: noWeight })).toBe(true);
    expect(isSearchReady({ ...unit, rvType: "travel_trailer" as const, gvwrLbs: noWeight, dryWeightLbs: noWeight })).toBe(false);
    expect(isSearchReady({ ...unit, rvType: "fifth_wheel" as const, gvwrLbs: noWeight, dryWeightLbs: noWeight })).toBe(false);
    expect(SEARCHABLE_UNITS_NOTE).toMatch(/towables/i);
    expect(SEARCHABLE_UNITS_NOTE).toMatch(/not the ChatGPT/i);
    const llms = readFileSync(new URL("../../rv-marketplace/public/llms.txt", import.meta.url), "utf8");
    expect(llms).toContain("{{LIVE_RV_COUNT}}");
    expect(llms).toContain("517 dealers, 841 stores, 49 states, as of October 19, 2026");
    expect(llms).toContain("https://matchrv.com/visibility-solution");
    expect(llms).not.toContain("150,000");
    expect(llms).not.toContain("/advertising");
    expect(llms).not.toContain("84,000");
    expect(llms).toContain("not the ChatGPT corpus");
  });
  it("shows a Class A near Tacoma when its weight was never published", async () => {
    const base = readyUnits()[0];
    const noWeight = { value: null, source: null, confidence: null } as const;
    const coach = {
      ...base,
      id: "vin:TESTCLASSA",
      rvType: "class_a" as const,
      gvwrLbs: noWeight,
      dryWeightLbs: noWeight,
      dealer: { ...base.dealer, name: "Poulsbo RV of Kent", city: "Kent", state: "WA", lat: 47.388, lng: -122.2127, id: "poulsborv.com:kent" },
    };
    const hidden = { ...coach, id: "vin:NOWHERE", dealer: { ...coach.dealer, city: "Not A Real Place", state: "WA", lat: null, lng: null, id: "mystery.example:wa" } };
    const outcome = await searchReadyInventory(
      { rvTypes: ["class_a"], location: { place: "Tacoma, WA", radiusMiles: 150 } },
      5,
      [coach, hidden],
      async () => true,
    );
    expect(outcome.results.map((m) => m.unit.id)).toEqual(["vin:TESTCLASSA"]);
    expect(outcome.results[0].unit.gvwrLbs.value).toBeNull();
    expect(outcome.results[0].unit.dryWeightLbs.value).toBeNull();
    expect(outcome.results[0].distanceMiles).toBeLessThan(20);
    expect(usablePhotoUrl("https://dealer.com/SOLD-photo.jpg")).toBe(false);
    expect(usablePhotoUrl("https://dealer.com/wm_stockphoto/example.jpg")).toBe(false);
    expect(usablePhotoUrl("https://127.0.0.1/image.jpg")).toBe(false);
  });
  it("excludes broken photos without relaxing requirements", async () => {
    const units=readyUnits().slice(0,20);
    const outcome=await searchReadyInventory({},3,units,async()=>false);
    expect(outcome.results).toEqual([]);
    expect(outcome.readiness.totalInventory).toBe(getInventory().units.length);
    expect(outcome.readiness.eligibleInventory).toBe(units.length);
  });
  it("shows only confirmed hard matches with photos, retaining full unit data", async () => {
    const outcome=await searchReadyInventory({priceMaxUsd:45000,lengthMaxFt:30},3,readyUnits(),async()=>true);
    expect(outcome.results).toHaveLength(3);
    for(const match of outcome.results){
      expect(match.hardStatus).toBe("pass");
      expect(match.unit.images.length).toBeGreaterThan(0);
      expect(match.unit.priceUsd.value).toBeLessThanOrEqual(45000);
      expect(match.unit.lengthFt.value).toBeLessThanOrEqual(30);
      expect(match.unit.sleeps.source).not.toBe("computed");
    }
  });
});
