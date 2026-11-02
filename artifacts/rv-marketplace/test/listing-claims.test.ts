import { describe, expect, it } from "vitest";
import { cleanDescription, daysOnMarketLabel, featureLabel, hasPriceAnalysis, isBoilerplateDescription } from "@/lib/listing-claims";
import { readFileSync } from "node:fs";
import path from "node:path";

describe("listing page claims are backed by data", () => {
  it("no price analysis / Fair Deal / struck Est. price when marketValue just equals the price or savings are 0", () => {
    expect(hasPriceAnalysis({ price: 42995, marketValue: 42995, dealSavings: 0 })).toBe(false);
    expect(hasPriceAnalysis({ price: 42995, marketValue: 45000, dealSavings: 0 })).toBe(false);
    expect(hasPriceAnalysis({ price: 42995, marketValue: null, dealSavings: 2005 })).toBe(false);
    expect(hasPriceAnalysis({ price: 0, marketValue: 45000, dealSavings: 45000 })).toBe(false);
    expect(hasPriceAnalysis({ price: 42995, marketValue: 45000, dealSavings: 2005 })).toBe(true);
  });

  it("days on market only from a real firstSeen", () => {
    expect(daysOnMarketLabel({ daysOnMarket: 0 })).toBeNull();
    expect(daysOnMarketLabel({ daysOnMarket: 37 })).toBeNull();
    expect(daysOnMarketLabel({ firstSeenAt: "not a date" })).toBeNull();
    const now = Date.parse("2026-11-02T16:00:00Z");
    expect(daysOnMarketLabel({ firstSeenAt: "2026-10-01T16:00:00Z" }, now)).toBe("32 days on market");
    expect(daysOnMarketLabel({ firstSeenAt: "2026-11-01T15:00:00Z" }, now)).toBe("1 day on market");
    expect(daysOnMarketLabel({ firstSeenAt: "2026-12-01T00:00:00Z" }, now)).toBeNull();
  });

  it("hides cookie-banner and boilerplate descriptions, keeps real ones", () => {
    expect(isBoilerplateDescription("This site uses cookies to improve your experience. By continuing you agree.")).toBe(true);
    expect(isBoilerplateDescription("We use cookies and similar technologies.")).toBe(true);
    expect(isBoilerplateDescription("Please enable JavaScript to view this page.")).toBe(true);
    expect(isBoilerplateDescription("   ")).toBe(true);
    expect(isBoilerplateDescription("Our website uses cookies to give you the best experience. Accept all cookies?")).toBe(true);
    const real = "2027 Bullet Classic 21BHCWE with double-over-double bunks, outdoor shower and a 15k BTU A/C.";
    expect(cleanDescription(real)).toBe(real);
    expect(cleanDescription("This site uses cookies.")).toBeNull();
  });

  it("unknown generator/solar shows Unknown, not No", () => {
    expect(featureLabel(null)).toBe("Unknown");
    expect(featureLabel(undefined)).toBe("Unknown");
    expect(featureLabel(false)).toBe("No");
    expect(featureLabel(true)).toBe("Yes");
  });

  it("the listing page no longer carries the unbacked copy", () => {
    const src = readFileSync(path.resolve(import.meta.dirname, "../src/pages/listing-detail.tsx"), "utf8");
    expect(src).not.toMatch(/We verify every listing is active/);
    expect(src).not.toMatch(/respond within hours/);
    expect(src).not.toMatch(/No Hidden Fees/);
    expect(src).not.toMatch(/\{listing\.daysOnMarket\} days on market/);
    expect(src).toMatch(/\{priceAnalysis && \(\s*<div className="flex items-center md:justify-end gap-2 mt-1">\s*<span className="text-sm text-\[#3b4949\] line-through">/);
    expect(src).toMatch(/\{\/\* Price analysis: only with an independent market value \*\/\}\s*\{priceAnalysis && \(/);
    expect(src).toMatch(/featureLabel\(facts\.generator\)/);
    expect(src).toMatch(/featureLabel\(facts\.solar\)/);
  });
});
