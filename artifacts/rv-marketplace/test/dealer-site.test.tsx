import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import { DealerPricing } from "../src/components/dealer-pricing";
import { AiVisibilityComparison } from "../src/components/ai-visibility-comparison";
import { SnapshotProgress } from "../src/components/snapshot-progress";
import { Contact } from "../src/pages/contact";
import { Privacy } from "../src/pages/privacy";
import { Terms } from "../src/pages/terms";
import { McpSetup } from "../src/pages/mcp-setup";
import { MCP_ENDPOINT, MCP_JSON_CONFIG } from "../src/config/mcp";

function render(component: React.ReactNode, path = "/") {
  return renderToStaticMarkup(<HelmetProvider><Router hook={() => [path, () => {}]}>{component}</Router></HelmetProvider>);
}

describe("dealer website conversion and public routes", () => {
  it("shows all three offers, monthly units, credit, and working enrollment destinations", () => {
    const html = render(<DealerPricing/>);
    for (const price of ["$99", "$599", "$1,499"]) expect(html).toContain(price);
    expect(html).toContain("credited in full");
    expect(html).toContain("/ month per rooftop + ad spend");
    expect(html).toContain('href="/book"');
    expect(html).toContain('href="/advertising"');
    expect(html).toContain("before work or recurring billing begins");
    expect(html).not.toContain("Most Popular");
  });
  it("keeps the comparison source-backed and distinct from an actual AI recommendation", () => {
    const html = render(<AiVisibilityComparison/>);
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
    expect(html).toContain('class="matchrv-brand"');
    expect(html).toContain("Dealer Services");
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain("jonathan@matchrv.com");
    expect(html).not.toContain('href="/tow-match"');
    expect(html).not.toContain('href="/buyer-guides"');
  });
  it("keeps displayed and JSON MCP configuration on the same branded endpoint", () => {
    expect(JSON.parse(MCP_JSON_CONFIG).mcpServers.MatchRV.url).toBe(MCP_ENDPOINT);
    const html = render(<McpSetup/>, "/mcp-setup");
    expect(html).toContain("https://mcp.matchrv.com/mcp");
    expect(html).toContain("Copy JSON configuration");
    expect(html).not.toContain("onrender.com");
  });
});
