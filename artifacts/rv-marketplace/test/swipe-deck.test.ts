import { describe, expect, it } from "vitest";
import { sendDealerInquiry } from "@/lib/dealer-inquiry";
import {
  cardFacts, cardPlace, DECK_LIMIT, defaultInquiryMessage, emptyPrefs, inquiryFormValid, inquiryPayload, isComplete,
  pickNext, skipBroken, startDeck, swipe, updatePrefs, fitScore, type SwipeCard,
} from "@/lib/swipe-deck";

let n = 0;
function card(over: Partial<SwipeCard> = {}): SwipeCard {
  n++;
  return {
    id: `stk:test:${n}`, year: 2022, make: "Grand Design", model: "Imagine 2500RL", rvType: "travel_trailer",
    priceUsd: 39999, city: "Fife", state: "WA", photo: `https://dealer.example.com/p/${n}.jpg`,
    photos: [`https://dealer.example.com/p/${n}.jpg`], dealerKey: "d1", ...over,
  };
}

describe("swipe card fields", () => {
  it("omits unknown length, sleeps, condition and distance instead of guessing", () => {
    const c = card();
    expect(cardFacts(c)).toEqual(["Travel trailer"]);
    expect(cardPlace(c)).toBe("Fife, WA");
    const text = cardFacts(c).join(" ");
    expect(text).not.toMatch(/ft|Sleeps|New|Used|undefined|null|NaN|0 mi/);
  });
  it("shows known facts and distance + city/state, never a dealer name", () => {
    const c = card({ lengthFt: 28.4, sleeps: 4, condition: "used", distanceMiles: 23 });
    expect(cardFacts(c)).toEqual(["Travel trailer", "Used", "28 ft", "Sleeps 4"]);
    expect(cardPlace(c)).toBe("23 mi · Fife, WA");
    expect(Object.keys(c)).not.toContain("dealerName");
  });
});

describe("dealer diversity", () => {
  it("the first 10 cards have at most 2 from the same dealer, even when one dealer ranks highest", () => {
    // One big dealer with 30 close, well-ranked units; 8 smaller dealers with 3 each further away.
    const big = Array.from({ length: 30 }, () => card({ dealerKey: "big", distanceMiles: 2 }));
    const small = Array.from({ length: 24 }, (_, i) => card({ dealerKey: `small${i % 8}`, distanceMiles: 80 }));
    let s = startDeck([...big, ...small], 150);
    while (!isComplete(s)) s = swipe(s, false);
    const first10 = s.shown.slice(0, 10);
    const counts = new Map<string, number>();
    for (const c of first10) counts.set(c.dealerKey, (counts.get(c.dealerKey) ?? 0) + 1);
    expect(first10).toHaveLength(10);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });
  it("never ranks by dealer size: a single-unit dealer can lead the deck", () => {
    const big = Array.from({ length: 10 }, () => card({ dealerKey: "big", distanceMiles: 40 }));
    const tiny = card({ dealerKey: "tiny", distanceMiles: 3 });
    expect(pickNext([...big, tiny], [], emptyPrefs(), 150)?.id).toBe(tiny.id);
  });
});

describe("deck length and preference model", () => {
  it("stops after 20 cards and keeps only the liked units for the shortlist", () => {
    const pool = Array.from({ length: 60 }, (_, i) => card({ dealerKey: `d${i % 15}` }));
    let s = startDeck(pool, 150);
    let swipes = 0;
    while (!isComplete(s)) { s = swipe(s, swipes % 3 === 0); swipes++; }
    expect(swipes).toBe(DECK_LIMIT);
    expect(s.shown).toHaveLength(DECK_LIMIT);
    expect(s.liked).toHaveLength(7);
    expect(new Set(s.shown.map((c) => c.id)).size).toBe(DECK_LIMIT);
  });
  it("re-ranks toward what the shopper likes (type, length band, price band, condition)", () => {
    const fw = card({ rvType: "fifth_wheel", priceUsd: 80000, lengthFt: 38, condition: "new" });
    let prefs = emptyPrefs();
    prefs = updatePrefs(prefs, fw, true);
    prefs = updatePrefs(prefs, card({ rvType: "travel_trailer", priceUsd: 20000 }), false);
    const likeAgain = card({ rvType: "fifth_wheel", priceUsd: 82000, lengthFt: 37, condition: "new", dealerKey: "a" });
    const passed = card({ rvType: "travel_trailer", priceUsd: 21000, dealerKey: "b" });
    expect(fitScore(likeAgain, prefs)).toBeGreaterThan(fitScore(passed, prefs));
    expect(pickNext([passed, likeAgain], [], prefs, 150)?.id).toBe(likeAgain.id);
  });
  it("skips a card whose photo fails without counting it as a pass", () => {
    const pool = Array.from({ length: 5 }, (_, i) => card({ dealerKey: `d${i}` }));
    const s = startDeck(pool, 150);
    const broken = s.current!.id;
    const t = skipBroken(s);
    expect(t.current?.id).not.toBe(broken);
    expect(t.pool.some((c) => c.id === broken)).toBe(false);
    expect(t.prefs).toEqual(s.prefs);
    expect(t.shown).toHaveLength(1);
  });
});

describe("see it in person inquiry", () => {
  it("builds the /api/inquiries payload and posts it through the listing page's inquiry flow", async () => {
    const c = card({ id: "vin:1UJBJ0BN8M1TJ0001" });
    const form = { name: " Pat Shopper ", email: " pat@example.com ", phone: "", message: defaultInquiryMessage(c) };
    expect(inquiryFormValid(form)).toBe(true);
    expect(inquiryFormValid({ ...form, email: "", phone: "" })).toBe(false);
    const payload = inquiryPayload(c.id, form);
    expect(payload).toEqual({ unitId: c.id, name: "Pat Shopper", email: "pat@example.com", phone: null, message: "I'd like to see the 2022 Grand Design Imagine 2500RL in person. Is it still available, and when could I come by?" });

    const calls: { url: string; body: any }[] = [];
    const responses = [
      { status: 200, body: { preview: {}, confirmationToken: "dic_x.sig" } },
      { status: 201, body: { inquiry: { inquiryId: "inq_9", status: "dry_run", statusDetail: "Dry run" } } },
    ];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
      const r = responses.shift()!;
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
    };
    const r = await sendDealerInquiry(payload, "/", fetchImpl);
    expect(r).toMatchObject({ ok: true, inquiryId: "inq_9", status: "dry_run" });
    expect(calls.map((x) => x.url)).toEqual(["/api/inquiries", "/api/inquiries"]);
    expect(calls[0].body).toEqual({ unit_id: c.id, name: "Pat Shopper", email: "pat@example.com", phone: null, message: payload.message });
    expect(calls[1].body).toEqual({ confirmation_token: "dic_x.sig", confirmed: true });
  });
});
