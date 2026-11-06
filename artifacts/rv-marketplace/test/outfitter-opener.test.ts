import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(__dirname, rel), "utf8");

describe("website Outfitter offers the existing swipe page", () => {
  it("the first chat message and the page chrome name https://matchrv.com/swipe and do not offer to build a deck", () => {
    const opener = read("../src/hooks/use-chat-session.ts");
    const page = read("../src/pages/outfitter.tsx");
    for (const src of [opener, page]) {
      expect(src).toContain("https://matchrv.com/swipe");
      expect(src).toMatch(/already exists/);
    }
    expect(opener).toMatch(/won't build a deck|do not offer to build|never offer to build/i);
    expect(opener).toMatch(/swipe or chat/i);
  });
});
