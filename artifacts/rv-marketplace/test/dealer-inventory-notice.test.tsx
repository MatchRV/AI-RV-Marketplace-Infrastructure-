import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DealerInventoryNotice,
  dealerDomainFromReport,
  inventoryUpdatingCopy,
} from "../src/components/dealer-inventory-notice";

describe("dealer page inventory-updating state", () => {
  it("shows a calm updating state, with no count and no unbacked wording, when every unit is held", () => {
    const html = renderToStaticMarkup(<DealerInventoryNotice dealer="Tacoma RV Center" status="updating" />);
    expect(html).toContain("Inventory updating");
    expect(html).toContain("Tacoma RV Center&#x27;s listings are being refreshed.");
    expect(html).toContain('role="status"');
    expect(html.replace(/<[^>]+>/g, "").replace(/&[^;]+;/g, "")).not.toMatch(/\d/);
    expect(html.toLowerCase()).not.toContain("invisible");
  });
  it("is generic for any dealer", () => {
    expect(inventoryUpdatingCopy("Sumner RV").body).toMatch(/^Sumner RV's listings are being refreshed\./);
    expect(inventoryUpdatingCopy("Bretz RV & Marine").body).toMatch(/^Bretz RV & Marine's listings/);
    expect(inventoryUpdatingCopy("").body).toMatch(/^This dealership's listings/);
  });
  it("renders nothing when the dealer has searchable units, is unknown, or status has not loaded", () => {
    for (const status of ["listed", "not_listed", null] as const) {
      expect(renderToStaticMarkup(<DealerInventoryNotice dealer="Tacoma RV" status={status} />)).toBe("");
    }
  });
  it("asks about the dealer's own website host", () => {
    expect(dealerDomainFromReport({ website: "https://www.tacomarv.com" })).toBe("tacomarv.com");
    expect(dealerDomainFromReport({ inventory_url: "https://www.baydos.com/rv-search" })).toBe("baydos.com");
    expect(dealerDomainFromReport({})).toBeNull();
  });
});
