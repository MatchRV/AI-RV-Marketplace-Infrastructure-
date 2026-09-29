export type InventoryPage = { url: string; title: string; text: string };

const TYPES = [
  ["Travel Trailer", /travel[- ]?trailers?/i],
  ["Fifth Wheel", /fifth[- ]?wheels?/i],
  ["Class A Motorhome", /class[- ]?a(?:\s+motorhome)?/i],
  ["Class B Motorhome", /class[- ]?b(?:\s+motorhome)?/i],
  ["Class C Motorhome", /class[- ]?c(?:\s+motorhome)?/i],
  ["Toy Hauler", /toy[- ]?haulers?/i],
  ["Truck Camper", /truck[- ]?campers?/i],
] as const;

function hintedType(page: InventoryPage): string | null {
  const path = new URL(page.url).pathname.replaceAll("-", " ");
  const specific = TYPES.find(([, pattern]) => pattern.test(path)) || TYPES.find(([, pattern]) => pattern.test(page.title));
  return specific?.[0] ?? null;
}

function nearbyType(text: string, index: number): string | null {
  const context = text.slice(Math.max(0, index - 350), index + 60);
  let best: { type: string; index: number } | null = null;
  for (const [type, pattern] of TYPES) {
    const matches = [...context.matchAll(new RegExp(pattern.source, "gi"))];
    const last = matches.at(-1);
    if (last && (best === null || last.index > best.index)) best = { type, index: last.index };
  }
  return best?.type ?? null;
}

export function chooseDealerQuestion(pages: InventoryPage[], city: string, state: string): { question: string; type: string; priceMax: number; observed: number } | null {
  const observations: Array<{ type: string; price: number }> = [];
  const seen = new Set<string>();
  const detailPages = pages.filter(page => /\/(product\/|rvs\/20\d{2})/i.test(new URL(page.url).pathname));
  for (const page of detailPages.length ? detailPages : pages) {
    const hint = hintedType(page);
    if (detailPages.length && !hint) continue;
    const prices = page.text.matchAll(/(?:your|our|sale|internet|advertised)?\s*price\s*:\s*\$\s*(\d{2,3}(?:,\d{3})+)|\$\s*(\d{2,3}(?:,\d{3})+)/gi);
    let onPage = 0;
    for (const match of prices) {
      const price = Number((match[1] || match[2]).replaceAll(",", ""));
      if (price < 10_000 || price > 500_000) continue;
      const nearby = page.text.slice(Math.max(0, match.index - 55), match.index).toLowerCase();
      if (/msrp|save:|savings|retail|payment|under\s*$|over\s*$/.test(nearby)) continue;
      const type = hint || (detailPages.length ? null : nearbyType(page.text, match.index));
      if (!type) continue;
      const key = detailPages.length ? page.url : `${type}:${price}`;
      if (seen.has(key)) continue;
      seen.add(key);
      observations.push({ type, price });
      if (++onPage >= (detailPages.length ? 1 : 15)) break;
    }
  }
  const byType = new Map<string, number[]>();
  for (const observation of observations) byType.set(observation.type, [...(byType.get(observation.type) || []), observation.price]);
  const strongest = [...byType.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (!strongest || strongest[1].length < 2) return null;
  const [type, values] = strongest;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const priceMax = Math.ceil(median * 1.15 / 5_000) * 5_000;
  const host = new URL(pages[0].url).hostname.replace(/^www\./, "");
  const question = `I'm looking for a ${type.toLowerCase()} under $${priceMax.toLocaleString("en-US")} near ${city}, ${state}. What available options can you find from ${host}? Answer only from cited dealership inventory pages, include their URLs, and say if the evidence is insufficient.`;
  return { question, type, priceMax, observed: values.length };
}
