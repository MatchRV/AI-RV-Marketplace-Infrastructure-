import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { executeShopSearch, shopChatSchema } from "../src/services/shop-outfitter";

describe("RV Outfitter shop search", () => {
  beforeEach(()=>vi.stubGlobal("fetch",vi.fn(async()=>new Response(null,{status:200,headers:{"content-type":"image/jpeg"}}))));
  afterEach(()=>vi.unstubAllGlobals());
  it("preserves previous requirements on a follow-up and returns at most three real matches", async () => {
    const result = await executeShopSearch({constraints:{lengthMaxFt:30},mode:"refine",summary:"Shorter options"},{priceMaxUsd:45000});
    expect(result.search.appliedConstraints.priceMaxUsd).toBe(45000);
    expect(result.search.appliedConstraints.lengthMaxFt).toBe(30);
    expect(result.search.results).toHaveLength(3);
    for (const match of result.search.results) {
      expect(match.hardStatus).not.toBe("fail");
      if (match.unit.priceUsd.value !== null) expect(match.unit.priceUsd.value).toBeLessThanOrEqual(45000);
      if (match.unit.lengthFt.value !== null) expect(match.unit.lengthFt.value).toBeLessThanOrEqual(30);
    }
  });
  it("clears only the requirement the shopper removes", async () => {
    const result = await executeShopSearch({constraints:{priceMaxUsd:null},mode:"refine",summary:"Remove budget"},{priceMaxUsd:45000,lengthMaxFt:30});
    expect(result.search.appliedConstraints.priceMaxUsd).toBeFalsy();
    expect(result.search.appliedConstraints.lengthMaxFt).toBe(30);
  });
  it("rejects empty and assistant-ended requests", () => {
    expect(shopChatSchema.safeParse({messages:[]}).success).toBe(false);
    expect(shopChatSchema.safeParse({messages:[{role:"assistant",content:"search"}]}).success).toBe(false);
    expect(shopChatSchema.safeParse({messages:[{role:"user",content:"Find a camper"}]}).success).toBe(true);
  });
});
