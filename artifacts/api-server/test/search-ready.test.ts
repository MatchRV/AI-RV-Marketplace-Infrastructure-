import { describe, expect, it } from "vitest";
import { isSearchReady, readyUnits, searchReadyInventory, usablePhotoUrl } from "../src/services/search-ready";

describe("search readiness gate", () => {
  it("requires actual identity, photos and published key specifications", () => {
    const unit=readyUnits()[0];
    expect(isSearchReady(unit)).toBe(true);
    expect(isSearchReady({...unit,images:[]})).toBe(false);
    expect(isSearchReady({...unit,model:"Unknown"})).toBe(false);
    expect(isSearchReady({...unit,sleeps:{value:4,source:"computed",confidence:"low"}})).toBe(false);
    expect(isSearchReady({...unit,status:"removed"})).toBe(false);
    expect(isSearchReady({...unit,priceUsd:{value:null,source:null,confidence:null}})).toBe(false);
    expect(usablePhotoUrl("https://dealer.com/SOLD-photo.jpg")).toBe(false);
    expect(usablePhotoUrl("https://dealer.com/wm_stockphoto/example.jpg")).toBe(false);
    expect(usablePhotoUrl("https://127.0.0.1/image.jpg")).toBe(false);
  });
  it("excludes broken photos without relaxing requirements", async () => {
    const units=readyUnits().slice(0,20);
    const outcome=await searchReadyInventory({},3,units,async()=>false);
    expect(outcome.results).toEqual([]);
    expect(outcome.readiness.totalInventory).toBe(20775);
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
