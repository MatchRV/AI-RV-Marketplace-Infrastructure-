import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { likedOutsideDeck, loadLikes, parseSwipeSearch, saveLikes } from "@/lib/swipe-session";
import { startDeck, type SwipeCard } from "@/lib/swipe-deck";

function mem() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

const card = (id: string, price = 200000): SwipeCard => ({
  id, year: 2020, make: "Tiffin", model: "Allegro", rvType: "class_a", priceUsd: price,
  city: "Tacoma", state: "WA", photo: "https://example.com/a.jpg", photos: ["https://example.com/a.jpg"], dealerKey: "d",
});

describe("swipe handoff query", () => {
  it("keeps a floor, a ceiling, a type, and a place, and ignores junk", () => {
    const q = parseSwipeSearch("?type=class_a&price_min=200000&place=Tacoma,%20WA&token=secret&account=9");
    expect(q).toMatchObject({ rvType: "class_a", priceMinUsd: 200000, priceMaxUsd: null, place: "Tacoma, WA" });
  });
  it("does not turn a rough target into a hard range, and drops a backwards range", () => {
    expect(parseSwipeSearch("?price_target=80000")).toMatchObject({ priceTargetUsd: 80000, priceMinUsd: null, priceMaxUsd: null });
    expect(parseSwipeSearch("?price_min=300000&price_max=150000")).toMatchObject({ priceMinUsd: null, priceMaxUsd: null });
    expect(parseSwipeSearch("?price_min=nope&type=spaceship&zip=9844")).toMatchObject({ priceMinUsd: null, rvType: "", zip: "" });
  });
  it("keeps likes when a new deck starts, without duplicating ids", () => {
    const storage = mem();
    saveLikes(storage, [card("a"), card("a"), card("b", 90000)]);
    const again = loadLikes(storage);
    expect(again.map((c) => c.id)).toEqual(["a", "b"]);
    const deck = startDeck([card("c", 220000), card("a", 210000)], 150, again);
    expect(deck.liked.map((c) => c.id)).toEqual(["a", "b"]);
    expect(deck.current?.id).toBe("c");
    expect(likedOutsideDeck(null, "a")).toBe(false);
    expect(likedOutsideDeck(new Set(deck.pool.map((c) => c.id)), "b")).toBe(true);
    expect(likedOutsideDeck(new Set(deck.pool.map((c) => c.id)), "c")).toBe(false);
  });
  it("the page has visible compare and filter controls and a skippable reduced-motion hint", () => {
    const page = readFileSync(resolve(__dirname, "../src/pages/swipe.tsx"), "utf8");
    const hint = readFileSync(resolve(__dirname, "../src/components/swipe/onboarding-hint.tsx"), "utf8");
    expect(page).toContain("Compare your likes");
    expect(page).toContain("Change filters");
    expect(hint).toContain("prefers-reduced-motion");
    expect(hint).toContain("Skip");
    expect(hint).toContain("Swipe right");
    expect(hint).toContain("Swipe left");
  });
});
