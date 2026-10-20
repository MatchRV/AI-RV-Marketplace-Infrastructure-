import { describe, expect, it } from "vitest";
import { buildVisibilitySnapshot } from "../src/lib/visibility-snapshot";
import { renderSampleReportPdf } from "../src/lib/quick-report-pdf";

describe("approved free snapshot", () => {
  it("leaves readiness unknown when no listing pages were assessed", () => {
    const snapshot = buildVisibilitySnapshot([{ field: "length", checked: 0, missing: 0 }], "Tacoma, WA");
    expect(snapshot.score).toBeNull();
    expect(snapshot.questions.every(row => row.result.startsWith("Not assessed"))).toBe(true);
    expect(snapshot.findings.join(" ")).not.toContain("all 0");
  });
  it("derives each dealer's score from assessed checks and leaves input order intact", () => {
    const fields = [{ field: "numeric price", checked: 2, missing: 0 }, { field: "length", checked: 2, missing: 1 }, { field: "sleeping capacity", checked: 2, missing: 2 }];
    const snapshot = buildVisibilitySnapshot(fields, "Fife, WA");
    expect(snapshot.score).toBe(50);
    expect(snapshot.findings[0]).toContain("sleeping capacity");
    expect(fields[0].field).toBe("numeric price");
    expect(snapshot.findings).toHaveLength(3);
    expect(snapshot.questions).toHaveLength(3);
  });
  it("always produces a single page for a long AI answer and source URL", () => {
    const pdf = renderSampleReportPdf({ website: "https://dealer.example", location: "Fife, WA", checkedAt: "2026-10-09T12:00:00Z", findings: [], ai: { question: "Where are the available RVs? ".repeat(50), answer: "Long AI answer. ".repeat(1000), sources: [{ url: "https://dealer.example/" + "long-path/".repeat(100) }] }, note: "Dated sample." });
    const text = pdf.toString();
    expect(text).toContain("/Count 1");
    expect(text).toContain("Free Visibility Snapshot");
    expect(text).toContain("Want the fix list?");
    expect(text).not.toContain("AI answer unavailable");
  });
});
