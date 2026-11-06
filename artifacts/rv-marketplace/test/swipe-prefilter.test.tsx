import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PreFilter, defaultFilter } from "../src/components/swipe/pre-filter";

describe("swipe pre-filter travel distance", () => {
  it("shows a 5-miles-to-nationwide slider under the location box, set to 150 miles by default", () => {
    const html = renderToStaticMarkup(<PreFilter initial={defaultFilter()} onStart={() => {}} busy={false} />);
    expect(html).toContain("How far will you travel?");
    expect(html).toMatch(/<input[^>]*id="swipe-radius"[^>]*type="range"/);
    expect(html).toContain(">150 miles<");
    expect(html.indexOf("Where are you shopping?")).toBeLessThan(html.indexOf("How far will you travel?"));
  });
  it("starts from the distance on the link", () => {
    const html = renderToStaticMarkup(<PreFilter initial={{ ...defaultFilter(), radiusMiles: 3000 }} onStart={() => {}} busy={false} />);
    expect(html).toContain(">Nationwide<");
  });
});
