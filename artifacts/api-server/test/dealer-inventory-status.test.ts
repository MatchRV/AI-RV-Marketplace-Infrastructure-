import { describe, expect, it } from "vitest";
import type { CanonicalUnit } from "@workspace/agent-core";
import { dealerInventoryStatus, heldDealerDomains, liveDealerInventoryStatus, normalizeDealerDomain } from "../src/services/dealer-inventory-status";

const unit = (domain: string, ready: boolean) => ({ id: `${domain}:${ready}`, ready, provenance: { dealerDomain: domain } }) as unknown as CanonicalUnit;
const isReady = (u: CanonicalUnit) => (u as unknown as { ready: boolean }).ready;

describe("dealer inventory status (no counts)", () => {
  it("normalizes dealer website hosts", () => {
    expect(normalizeDealerDomain("https://www.TacomaRV.com/inventory")).toBe("tacomarv.com");
    expect(normalizeDealerDomain("www.sumnerrv.com")).toBe("sumnerrv.com");
    expect(normalizeDealerDomain("rv.campingworld.com")).toBe("rv.campingworld.com");
    expect(normalizeDealerDomain("")).toBeNull();
    expect(normalizeDealerDomain("not a host")).toBeNull();
  });
  it("is 'updating' when every unit is held, 'listed' with one searchable unit, 'not_listed' for unknown dealers", () => {
    const units = [unit("a.com", false), unit("a.com", false), unit("b.com", false), unit("b.com", true)];
    expect(dealerInventoryStatus("a.com", units, new Set(), isReady)).toBe("updating");
    expect(dealerInventoryStatus("b.com", units, new Set(), isReady)).toBe("listed");
    expect(dealerInventoryStatus("held.com", units, new Set(["held.com"]), isReady)).toBe("updating");
    expect(dealerInventoryStatus("c.com", units, new Set(), isReady)).toBe("not_listed");
  });
  it("shows Tacoma RV Center as updating while all its units are held price_unverified", () => {
    expect(heldDealerDomains().has("tacomarv.com")).toBe(true);
    expect(liveDealerInventoryStatus("tacomarv.com")).toBe("updating");
    expect(liveDealerInventoryStatus("sumnerrv.com")).toBe("listed");
  });
});
