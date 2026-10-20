import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, extractTitle } from "../src/routes/dealer-tools";

describe("sampled page titles", () => {
  it("shows text rather than raw HTML entities", () => {
    expect(extractTitle('<title>RVs &amp; Trailers &quot;For Sale&quot; &#39;Today&#39; &lt;New&gt;</title>'))
      .toBe('RVs & Trailers "For Sale" \'Today\' <New>');
    expect(decodeHtmlEntities("Sumner &#x2014; Washington &nbsp; RVs")).toBe("Sumner — Washington   RVs");
  });
});

