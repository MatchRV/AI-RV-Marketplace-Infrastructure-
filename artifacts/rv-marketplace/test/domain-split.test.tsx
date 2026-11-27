import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../src/contexts/auth-context";
import { Home } from "../src/pages/home";
import { Shop } from "../src/pages/shop";
import { migrationTarget } from "../src/lib/site-host";

function render(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <HelmetProvider>
          <Router hook={() => ["/", () => {}]}>{node}</Router>
        </HelmetProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("consumer and dealer host routing", () => {
  it("matches the server redirect rules for production hostnames", () => {
    expect(migrationTarget("matchrv.com", "/book", "?when=today")).toBe("https://dealer.matchrv.com/book?when=today");
    expect(migrationTarget("dealer.matchrv.com", "/listing/abc", "")).toBe("https://matchrv.com/listing/abc");
    expect(migrationTarget("matchrv.com", "/mcp", "")).toBeNull();
    expect(migrationTarget("dealer.matchrv.com", "/api/out", "?unit=1")).toBeNull();
    expect(migrationTarget("localhost", "/lotai", "")).toBeNull();
    expect(migrationTarget("dealer.matchrv.local", "/", "")).toBeNull();
  });

  it("renders a shopper homepage with a live-count placeholder and no dealer snapshot pitch", () => {
    const html = render(<Home />);
    expect(html).toContain("Search in your own words");
    expect(html).toContain("Ask the dealer");
    expect(html).toContain('data-rv-count="total"');
    expect(html).toContain("https://matchrv.com/");
    expect(html).toContain("https://dealer.matchrv.com/");
    expect(html).not.toContain("Get my free snapshot");
    expect(html).not.toContain("129,000");
    expect(html).not.toContain("$599");
    expect(html).not.toContain("$1,499");
  });

  it("keeps /shop on shopping, not dealer-infrastructure marketing", () => {
    const html = render(<Shop />);
    expect(html).toContain("Swipe to find");
    expect(html).toContain('href="/swipe"');
    expect(html).toContain('data-rv-count="travel_trailer"');
    expect(html).not.toContain("inventory infrastructure");
    expect(html).not.toContain("129,000");
    expect(html).not.toMatch(/tinder|dating/i);
  });
});
