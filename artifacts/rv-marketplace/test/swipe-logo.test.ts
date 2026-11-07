import { describe, expect, it } from "vitest";
import { LIGHT_LOGO_ART, visibleLogoSource } from "@/lib/swipe-logo";

describe("swipe header logo", () => {
  it("shows the whole wordmark stroke, including the swoosh, with padding", () => {
    const view = visibleLogoSource();
    const pad = 8;
    expect(view.x).toBeLessThanOrEqual(LIGHT_LOGO_ART.x - pad);
    expect(view.y).toBeLessThanOrEqual(LIGHT_LOGO_ART.y - pad);
    expect(view.right).toBeGreaterThanOrEqual(LIGHT_LOGO_ART.right + pad);
    expect(view.bottom).toBeGreaterThanOrEqual(LIGHT_LOGO_ART.bottom + pad);
  });
});
