import { describe, expect, it } from "vitest";
import { outfitterGuidance } from "../src/services/outfitter-guidance";

describe("MCP Outfitter clarification", () => {
  it("keeps explicit length ranges and minimums", () => {
    const range = outfitterGuidance("I want a 25–30 ft travel trailer");
    expect(range.constraints.lengthMinFt).toBe(25);
    expect(range.constraints.lengthMaxFt).toBe(30);
    const plus = outfitterGuidance("I need a 40+ ft motorhome");
    expect(plus.constraints.lengthMinFt).toBe(40);
    expect(plus.constraints.lengthMaxFt).toBeUndefined();
  });

  it("keeps a nervous shopper's limit while asking one question", () => {
    const result = outfitterGuidance("I am nervous towing anything over 30 feet");
    expect(result.constraints.lengthMaxFt).toBe(30);
    expect(result.nextQuestion).toMatch(/30 feet or less/);
  });

  it("does not fabricate a total price cap from monthly payment", () => {
    const result = outfitterGuidance("I have $5,000 down and can pay $450 per month");
    expect(result.constraints.priceMaxUsd).toBeUndefined();
    expect(result.nextQuestion).toMatch(/total purchase price/);
  });

  it("searches on request while preserving existing type and length", () => {
    const result = outfitterGuidance(
      "Show me matches under 30 feet, around $450 per month",
      { rvTypes: ["travel_trailer"] },
    );
    expect(result.nextQuestion).toBeNull();
    expect(result.constraints.lengthMaxFt).toBe(30);
    expect(result.constraints.priceMaxUsd).toBeUndefined();
    expect(result.constraints.rvTypes).toEqual(["travel_trailer"]);
  });

  it("does not widen a limit on vague flexibility", () => {
    const result = outfitterGuidance("36 feet might be okay", { lengthMaxFt: 30 }, true);
    expect(result.constraints.lengthMaxFt).toBe(30);
  });
});
