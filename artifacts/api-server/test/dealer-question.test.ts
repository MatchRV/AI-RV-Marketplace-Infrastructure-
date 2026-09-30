import { describe, expect, it } from "vitest";
import { chooseDealerQuestion, formatDealerLocation } from "../src/services/dealer-question";
import { renderSampleReportPdf } from "../src/lib/quick-report-pdf";

describe("dealer sample question", () => {
  it("formats dealer locations supplied in lowercase", () => {
    expect(formatDealerLocation("sumner", "washington")).toBe("Sumner, Washington");
    expect(formatDealerLocation("mt. vernon", "wa")).toBe("Mt. Vernon, WA");
  });
  it("uses the most represented priced type in sampled detail pages", () => {
    const pages = [
      { url: "https://dealer.example/product/eagle", title: "2026 Eagle Fifth Wheel", text: "Your Price: $64,880 MSRP: $93,235" },
      { url: "https://dealer.example/product/montana", title: "2026 Montana Fifth Wheel", text: "Your Price: $69,880 MSRP: $99,235" },
      { url: "https://dealer.example/product/jay-flight", title: "2026 Jay Flight Travel Trailer", text: "Your Price: $22,880 MSRP: $33,235" },
    ];
    const result = chooseDealerQuestion(pages, "chehalis", "washington");
    expect(result?.type).toBe("Fifth Wheel");
    expect(result?.priceMax).toBe(85_000);
    expect(result?.question).toContain("near Chehalis, Washington");
    expect(result?.question).toContain("a Fifth Wheel");
    expect(result?.question).toContain("cited dealership inventory pages");
  });

  it("declines to ask when only unpriced navigation is available", () => {
    expect(chooseDealerQuestion([{ url: "https://dealer.example/inventory", title: "Inventory", text: "Travel Trailers Fifth Wheels Loading inventory..." }], "Tacoma", "Washington")).toBeNull();
  });

  it("creates an attachable PDF containing the report question and sources", () => {
    const pdf = renderSampleReportPdf({ name: "Jonathan Kitchel", website: "https://dealer.example", location: "Chehalis, Washington", checkedAt: "2026-09-29T12:00:00Z", findings: [{ field: "length", missing: 1, checked: 2 }], ai: { question: "Which fifth wheel?", answer: "One cited option.", sources: [{ url: "https://dealer.example/product/eagle" }] }, note: "Dated sample." });
    expect(pdf.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf.toString()).toContain("Which fifth wheel?");
    expect(pdf.toString()).toContain("Prepared for: Jonathan Kitchel");
    expect(pdf.toString()).toContain("https://dealer.example/product/eagle");
  });
});
