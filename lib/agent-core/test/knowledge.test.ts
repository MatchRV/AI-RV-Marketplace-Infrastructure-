import { describe, expect, it } from "vitest";
import { GUIDE_TOPICS, getGuide, searchGuides } from "../src/index.js";

describe("outfitter guide knowledge (mined from the knowledge pack)", () => {
  it("answers payload/tongue questions from the towing guides, payload-first", () => {
    const hits = searchGuides("how much payload and tongue weight can my truck handle?");
    expect(hits[0]?.id).toBe("tow_basics");
    expect(hits[0]?.points.join(" ")).toContain("Payload is usually the real bottleneck");
    expect(hits[0]?.points.join(" ")).toContain("never dry weight");
  });

  it("routes family questions to family guidance, type comparisons to comparisons", () => {
    expect(searchGuides("best setup for kids and grandkids")[0]?.id).toBe("families");
    expect(searchGuides("fifth wheel vs travel trailer")[0]?.id).toBe("trailer_vs_fifth_wheel");
    expect(searchGuides("should I get a motorhome or a trailer?")[0]?.id).toBe("motorhome_vs_trailer");
  });

  it("every topic is sourced and no topic reproduces a model-level tow table", () => {
    for (const g of GUIDE_TOPICS) {
      expect(g.source).toContain("buyer-guides");
      expect(g.points.length).toBeGreaterThanOrEqual(4);
      expect(g.points.join(" ")).not.toMatch(/F-150 \| 13,000|Tow Capacity \(lbs\)/);
    }
    expect(getGuide("tow_basics")?.points.join(" ")).toContain("80%");
    expect(getGuide("nope")).toBeNull();
  });
});
