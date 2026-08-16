const CANONICAL_TYPES = new Set([
  "toy_hauler", "fifth_wheel", "travel_trailer",
  "class_a", "class_b", "class_c",
  "popup_camper", "truck_camper",
]);

export function normalizeType(t: unknown): string | null {
  if (!t) return null;
  const x = String(t).toLowerCase().trim();
  if (x === "unknown" || x === "other" || x === "rv" || x === "park model") return null;
  // Pass through values that are already in canonical underscore form.
  if (CANONICAL_TYPES.has(x)) return x;
  if (x.includes("toy hauler")) return "toy_hauler";
  if (x.includes("fifth wheel") || x.includes("destination trailer")) return "fifth_wheel";
  if (x.includes("travel trailer") || x === "destination") return "travel_trailer";
  if (x.includes("class a") || x.includes("motor home class a")) return "class_a";
  if (x.includes("class b") || x.includes("motor home class b")) return "class_b";
  if (x.includes("class c") || x.includes("super c") || x.includes("motor home class c")) return "class_c";
  if (x.includes("popup") || x.includes("pop-up") || x.includes("pop up") || x.includes("folding")) return "popup_camper";
  if (x.includes("truck camper")) return "truck_camper";
  return null;
}

export function parseLocation(loc: unknown, fallback: string): { city: string; state: string } {
  if (!loc) return { city: fallback, state: "WA" };
  const m = String(loc).match(/([A-Za-z .'-]+),\s*(WA|Washington)/i);
  if (m) return { city: m[1].trim(), state: "WA" };
  return { city: fallback, state: "WA" };
}

export function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/[,$]/g, "").match(/-?\d+(\.\d+)?/);
  if (!s) return null;
  const n = parseFloat(s[0]);
  return Number.isFinite(n) ? n : null;
}

export function toInt(v: unknown): number | null {
  const n = toNum(v);
  return n === null ? null : Math.round(n);
}

export function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" || v === "yes" || v === "1";
  if (typeof v === "number") return v > 0;
  return false;
}
