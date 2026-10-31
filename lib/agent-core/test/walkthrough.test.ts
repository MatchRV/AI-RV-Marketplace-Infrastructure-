import { describe, expect, it } from "vitest";
import {
  DEALER_VIDEO_NOTE,
  dealerVideoUrl,
  getGuide,
  MODEL_WALKTHROUGH_LABEL,
  REFINE_OPTIONS,
  refineHint,
  walkthroughFor,
  walkthroughQuery,
  youtubeVideoId,
} from "../src/index.js";

const base = { year: 2026, make: "Keystone", model: "Springdale", floorplanCode: "2880BRS", images: [] as string[], description: null as string | null };

describe("walkthrough videos (facts only)", () => {
  it("recognizes YouTube watch, youtu.be, shorts and embed links", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=xthMGXTWYic")).toBe("xthMGXTWYic");
    expect(youtubeVideoId("https://www.youtube.com/watch?feature=share&v=xthMGXTWYic")).toBe("xthMGXTWYic");
    expect(youtubeVideoId("TAKE A VIDEO TOUR! https://youtu.be/lXPHoDmBkcU KZ Durango")).toBe("lXPHoDmBkcU");
    expect(youtubeVideoId("https://www.youtube.com/shorts/5XTElQYspbA?feature=share")).toBe("5XTElQYspbA");
    expect(youtubeVideoId("https://www.youtube.com/embed/5XTElQYspbA")).toBe("5XTElQYspbA");
    expect(youtubeVideoId("https://images.scout-rv.com/trailer-source/videos/poster-rv.jpg")).toBeNull();
    expect(youtubeVideoId("Video camera system")).toBeNull();
    expect(youtubeVideoId(null)).toBeNull();
  });

  it("uses the dealer's own stored video for the unit when the listing has one", () => {
    const fromImages = walkthroughFor({ ...base, images: ["https://cdn.example.com/a.jpg", "https://www.youtube.com/watch?v=xthMGXTWYic"] });
    expect(fromImages).toEqual({ kind: "dealer_video", url: "https://www.youtube.com/watch?v=xthMGXTWYic", label: "Video linked in this unit's dealer listing", source: "dealer_listing_images", note: DEALER_VIDEO_NOTE });
    const fromDescription = walkthroughFor({ ...base, description: "TAKE A VIDEO TOUR! https://youtu.be/lXPHoDmBkcU highlights" });
    expect(fromDescription?.kind).toBe("dealer_video");
    expect(fromDescription?.url).toBe("https://www.youtube.com/watch?v=lXPHoDmBkcU");
    expect(dealerVideoUrl({ images: [], description: "Ask about our video walkthroughs" })).toBeNull();
  });

  it("otherwise builds a same-model YouTube search from year + make + model + floorplan", () => {
    const w = walkthroughFor(base);
    expect(w).toEqual({
      kind: "model_search",
      url: "https://www.youtube.com/results?search_query=2026+Keystone+Springdale+2880BRS+walkthrough",
      label: MODEL_WALKTHROUGH_LABEL,
      query: "2026 Keystone Springdale 2880BRS walkthrough",
      sameUnit: false,
    });
    expect(MODEL_WALKTHROUGH_LABEL).toBe("Same model — this unit may differ");
  });

  it("never repeats words already in the model and skips missing fields", () => {
    expect(walkthroughQuery({ year: 2016, make: "Newmar", model: "Canyon Star 3911", floorplanCode: "3911" })).toBe("2016 Newmar Canyon Star 3911 walkthrough");
    expect(walkthroughQuery({ year: 2025, make: "Forest River", model: "Flagstaff MAC Series", floorplanCode: null })).toBe("2025 Forest River Flagstaff MAC Series walkthrough");
    expect(walkthroughQuery({ year: 2024, make: "", model: "", floorplanCode: null })).toBeNull();
    expect(walkthroughFor({ ...base, make: "", model: "", floorplanCode: null })).toBeNull();
  });

  it("URL-encodes special characters in the search", () => {
    const w = walkthroughFor({ ...base, make: "Grand Design", model: "Reflection 150", floorplanCode: "260RD" });
    expect(w?.url).toBe("https://www.youtube.com/results?search_query=2026+Grand+Design+Reflection+150+260RD+walkthrough");
  });
});

describe("refining a search", () => {
  it("lists the six things a shopper can change", () => {
    expect([...REFINE_OPTIONS]).toEqual(["price", "length", "floorplan", "distance", "rv_type", "new_vs_used"]);
  });

  it("suggests a refinement when results are thin, and says change one thing at a time", () => {
    expect(refineHint({ shown: 3, requested: 3, verified: 2, noLocalMatches: false })).toMatchObject({ suggested: false, reason: null });
    expect(refineHint({ shown: 0, requested: 3, verified: 0, noLocalMatches: true }).reason).toBe("no_local_matches");
    expect(refineHint({ shown: 0, requested: 3, verified: 0, noLocalMatches: false }).reason).toBe("no_results");
    expect(refineHint({ shown: 3, requested: 3, verified: 0, noLocalMatches: false }).reason).toBe("no_fully_verified_matches");
    expect(refineHint({ shown: 1, requested: 3, verified: 1, noLocalMatches: false }).reason).toBe("fewer_than_requested");
    const h = refineHint({ shown: 3, requested: 3, verified: 3, noLocalMatches: false });
    expect(h.ask).toMatch(/price.*length.*floorplan.*how far.*type of RV.*new vs\. used/);
    expect(h.rule).toMatch(/ONE thing at a time/);
    expect(h.rule).toMatch(/Never loosen a hard limit/);
  });

  it("the Road to the Sale guide teaches one-change-at-a-time refinement", () => {
    const pts = getGuide("road_to_sale")!.points.join(" ");
    expect(pts).toMatch(/changes one thing at a time and searches again/);
    expect(pts).toMatch(/price, the length, the floorplan, how far you'd drive, the type of RV, or new vs\. used/);
  });
});
