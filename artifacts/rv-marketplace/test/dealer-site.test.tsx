import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { Router } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import { PricingNote } from "../src/components/site/blocks";
import { DealerHome } from "../src/pages/dealer-home";
import { VisibilityReport } from "../src/pages/visibility-report";
import { VisibilitySolution } from "../src/pages/visibility-solution";
import { LotAI } from "../src/pages/lotai";
import { Shop } from "../src/pages/shop";
import { BookReportCall } from "../src/pages/book";
import { SnapshotProgress } from "../src/components/snapshot-progress";
import { Contact } from "../src/pages/contact";
import { Privacy } from "../src/pages/privacy";
import { Terms } from "../src/pages/terms";
import { McpSetup } from "../src/pages/mcp-setup";
import { MCP_ENDPOINT, MCP_JSON_CONFIG } from "../src/config/mcp";
import { RV_COUNT_PLACEHOLDER, RV_COUNT_UNAVAILABLE_STATUS } from "../src/config/site";

function render(component: React.ReactNode, path = "/") {
  return renderToStaticMarkup(<HelmetProvider><Router hook={() => [path, () => {}]}>{component}</Router></HelmetProvider>);
}

describe("dealer website conversion and public routes", () => {
  it("quotes no price: pricing depends on dealership size, with an appointment link and a phone link", () => {
    const html = render(<PricingNote/>);
    expect(html).toContain("Pricing is based on");
    expect(html).toContain("dealership size");
    expect(html).toContain('href="/book"');
    expect(html).toContain('href="tel:+12533308317"');
    expect(html).toContain("(253) 330-8317");
  });
  it.each([["/", <DealerHome/>], ["/visibility-solution", <VisibilitySolution/>], ["/lotai", <LotAI/>], ["/visibility-report", <VisibilityReport/>]])("shows the pricing call-out and no dollar price on dealer page %s", (path, component) => {
    const html = render(component, path);
    expect(html).toContain("Pricing is based on");
    expect(html).toContain('href="tel:+12533308317"');
    for (const price of ["$99", "$599", "$1,499", "/ month per rooftop"]) expect(html).not.toContain(price);
  });
  it("sends the booking page to the calendar and offers the phone number", () => {
    const html = render(<BookReportCall/>, "/book");
    expect(html).toContain("https://calendar.app.google/");
    expect(html).toContain('href="tel:+12533308317"');
    expect(html).not.toContain("$99");
  });
  it("has no Pricing or ChatGPT advertising entry in the navigation, and links LotAI and Visibility Solution", () => {
    const html = render(<DealerHome/>);
    expect(html).toContain('href="/visibility-solution"');
    expect(html).toContain('href="/lotai"');
    expect(html).not.toContain("Plans &amp; Pricing");
    expect(html).not.toContain("ChatGPT Advertising");
    expect(html).not.toContain('href="/advertising"');
    expect(html).not.toContain('href="/#plans"');
  });
  it("states where MatchRV is available in the required words", () => {
    for (const [path, component] of [["/", <DealerHome/>], ["/shop", <Shop/>]] as const) {
      const html = render(component, path);
      expect(html).toContain("Live in ChatGPT plugins");
      expect(html).toContain("In final approval on Muse");
    }
  });
  it("links the RVBusiness article from the home page", () => {
    const html = render(<DealerHome/>);
    expect(html).toContain("As featured in");
    expect(html).toContain("https://rvbusiness.com/startup-matchrv-looking-to-make-ai-a-better-salesman/");
  });
  it("describes the sample audit without naming a dealership or linking its PDFs", () => {
    for (const [path, component] of [["/", <DealerHome/>], ["/visibility-report", <VisibilityReport/>], ["/visibility-solution", <VisibilitySolution/>]] as const) {
      const html = render(component, path);
      expect(html).toContain("Fife, WA dealer");
      expect(html).not.toMatch(/tacoma\s*rv/i);
      expect(html).not.toContain(".pdf");
    }
  });
  it("describes the swipe preview without dating-app wording", () => {
    const html = render(<Shop/>, "/shop");
    expect(html).toContain('href="/swipe"');
    expect(html).toContain("Swipe to find");
    expect(html).not.toMatch(/tinder|dating/i);
  });
  it("leaves RV counts blank until the live listings total arrives", () => {
    const placeholder = `<dd data-rv-count="total">${RV_COUNT_PLACEHOLDER}</dd>`;
    const status = `<span data-rv-count-status="total">${RV_COUNT_UNAVAILABLE_STATUS}</span>`;
    for (const [path, component] of [["/", <DealerHome/>], ["/shop", <Shop/>], ["/mcp-setup", <McpSetup/>]] as const) {
      const html = renderToString(<HelmetProvider><Router hook={() => [path, () => {}]}>{component}</Router></HelmetProvider>);
      expect(html).toContain(placeholder);
      expect(html).toContain(status);
      expect(html).not.toMatch(/131[,_]?718/);
      expect(html).not.toMatch(/79[,_]?198/);
      expect(html).not.toContain("150,000");
      expect(html).not.toContain("128,174");
      expect(html).not.toContain("129,000");
    }
    const shop = render(<Shop/>, "/shop");
    expect(shop).toContain(`<strong data-rv-count="travel_trailer">${RV_COUNT_PLACEHOLDER}</strong>`);
    expect(shop).toContain(`<strong data-rv-count="popup_camper">${RV_COUNT_PLACEHOLDER}</strong>`);
  });
  it("keeps the comparison source-backed and distinct from an actual AI recommendation", () => {
    const html = render(<VisibilitySolution/>, "/visibility-solution");
    expect(html).toContain("Illustrative comparison");
    expect(html).toContain("57/100");
    expect(html).toContain("2025 Heartland Pioneer 17BH");
    expect(html).toContain("3,064 lbs");
    expect(html).toContain("Dry weight is not loaded towing weight");
    expect(html).toContain("2747898-fife-wa");
    expect(html).not.toContain("Recommended First");
  });
  it("confirms a pending scan and exposes booking before a report exists", () => {
    const html = render(<SnapshotProgress website="https://dealer.example/inventory"/>);
    expect(html).toContain("Your website check has started");
    expect(html).toContain("dealer.example/inventory");
    expect(html).toContain("client-side JavaScript");
    expect(html).toContain('href="/book"');
    expect(html).toContain("Skip the wait");
    expect(html).not.toContain("Your snapshot is ready");
  });
  it("replaces scan claims with the readout action after completion", () => {
    const html = render(<SnapshotProgress website="https://dealer.example" complete/>);
    expect(html).toContain("Your snapshot is ready");
    expect(html).toContain("Book my one-on-one readout");
    expect(html).not.toContain("Your website check has started");
  });
  it.each([["/contact", <Contact/>], ["/privacy", <Privacy/>], ["/terms", <Terms/>]])("renders %s with shared B2B navigation and legal footer", (path, component) => {
    const html = render(component, path);
    expect(html).toContain('class="mrv-site"');
    expect(html).toContain("Dealer Services");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain("jonathan@matchrv.com");
    expect(html).not.toContain('href="/tow-match"');
    expect(html).not.toContain('href="/buyer-guides"');
  });
  it("keeps /contact on the dealer-only shell, never the consumer header or footer", () => {
    const html = render(<Contact/>, "/contact");
    expect(html).toContain('data-page="dealer-contact"');
    expect(html).toContain('class="mrv-site"');
    expect(html).toContain("Dealer Services");
    expect(html).toContain("Book a Call");
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain("Send message");
    for (const oldLabel of ["Agent Shop", "Tow Match", "Saved Items", "Sign In", "Browse by Type", "Buyer Resources", "Campgrounds", "Sell Your RV"]) {
      expect(html).not.toContain(oldLabel);
    }
  });
  it("keeps displayed and JSON MCP configuration on the same branded endpoint", () => {
    expect(JSON.parse(MCP_JSON_CONFIG).mcpServers.MatchRV.url).toBe(MCP_ENDPOINT);
    const html = render(<McpSetup/>, "/mcp-setup");
    expect(html).toContain("https://matchrv.com/mcp");
    expect(html).not.toContain("mcp.matchrv.com");
    expect(html).not.toContain("Copy alternative public address");
    expect(html).toContain("Copy JSON configuration");
    expect(html).not.toContain("onrender.com");
  });
});
