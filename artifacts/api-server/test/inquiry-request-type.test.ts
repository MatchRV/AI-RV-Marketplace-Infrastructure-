import { describe, expect, it } from "vitest";
import type { CanonicalUnit } from "@workspace/agent-core";
import { getInventory } from "../src/services/agent-inventory";
import { buildPreview, classifyInquiryRequest, formatInquiryForwardText, type DealerInquiry } from "../src/services/dealer-inquiries";

const unit = () => (getInventory().units as CanonicalUnit[])[0];
const contact = { name: "Test Shopper", email: "shopper@example.com", phone: null };

describe("inquiry request type, read from the shopper's own message", () => {
  it("recognises a hold request", () => {
    for (const m of ["Can you hold this one for me until Saturday?", "I'd like to reserve it.", "Please set it aside, I can put down a deposit today.", "Is it available? If so please hold it."]) {
      expect(classifyInquiryRequest(m)).toBe("hold_request");
    }
  });

  it("recognises an availability check", () => {
    for (const m of ["Is this still available?", "Do you still have this on your lot?", "Has it been sold?", "Is it in stock?"]) {
      expect(classifyInquiryRequest(m)).toBe("availability_check");
    }
  });

  it("does not mistake ordinary words for a hold", () => {
    for (const m of ["How many gallons does the holding tank take?", "What does the fresh tank hold... sorry, holds?", "Is this good for a household of five?", "What is your best out-the-door price?"]) {
      expect(classifyInquiryRequest(m)).not.toBe("hold_request");
    }
    expect(classifyInquiryRequest("What is your best out-the-door price?")).toBe("general");
  });
});

describe("hold requests through the existing inquiry flow", () => {
  it("the preview says it is only a request and that MatchRV cannot place a hold", () => {
    const p = buildPreview(unit(), contact, "Please hold this RV for me until Friday.");
    expect(p.request).toMatchObject({ type: "hold_request", label: "Hold request" });
    expect(p.request!.note).toContain("MatchRV cannot place, confirm or guarantee a hold");
    expect(p.request!.note).toContain("can still sell to someone else");
  });

  it("the text sent to the dealer is flagged as a hold request and promises nothing", () => {
    const p = buildPreview(unit(), contact, "Please hold this RV for me until Friday.");
    const text = formatInquiryForwardText({ id: "inq_test", preview: p } as DealerInquiry);
    expect(text).toContain("Subject: MatchRV shopper hold request:");
    expect(text).toContain("MatchRV has not promised a hold");
  });

  it("an availability check is flagged, and a general inquiry keeps its wording", () => {
    const a = buildPreview(unit(), contact, "Is this still available?");
    expect(a.request!.type).toBe("availability_check");
    expect(formatInquiryForwardText({ id: "inq_test", preview: a } as DealerInquiry)).toContain("Subject: MatchRV shopper availability check:");
    const g = buildPreview(unit(), contact, "What is your best price?");
    expect(g.request!.type).toBe("general");
    expect(formatInquiryForwardText({ id: "inq_test", preview: g } as DealerInquiry)).toContain("Subject: MatchRV shopper inquiry:");
  });

  it("an inquiry stored before the field existed is still classified from its message", () => {
    const p = buildPreview(unit(), contact, "Please reserve it for me.");
    delete p.request;
    expect(formatInquiryForwardText({ id: "inq_old", preview: p } as DealerInquiry)).toContain("hold request");
  });
});
