/**
 * Deterministic, fully-offline geography for the Pacific Northwest demo
 * footprint. No external geocoding calls: an unknown place returns null and
 * callers surface a descriptive error listing supported places so an agent
 * can self-correct.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** City name (lowercase) → coordinates. WA + nearby OR/ID/MT dealer cities. */
export const CITY_COORDS: Record<string, LatLng> = {
  // Washington
  seattle: { lat: 47.6062, lng: -122.3321 },
  tacoma: { lat: 47.2529, lng: -122.4443 },
  kent: { lat: 47.3809, lng: -122.2348 },
  auburn: { lat: 47.3073, lng: -122.2285 },
  everett: { lat: 47.979, lng: -122.2021 },
  spokane: { lat: 47.6588, lng: -117.426 },
  "spokane valley": { lat: 47.6733, lng: -117.2394 },
  vancouver: { lat: 45.6387, lng: -122.6615 },
  olympia: { lat: 47.0379, lng: -122.9007 },
  bellingham: { lat: 48.7519, lng: -122.4787 },
  ferndale: { lat: 48.8465, lng: -122.5910 },
  yakima: { lat: 46.6021, lng: -120.5059 },
  "union gap": { lat: 46.5573, lng: -120.4756 },
  "mount vernon": { lat: 48.4213, lng: -122.3341 },
  marysville: { lat: 48.0518, lng: -122.1771 },
  puyallup: { lat: 47.1854, lng: -122.2929 },
  poulsbo: { lat: 47.7354, lng: -122.6468 },
  bremerton: { lat: 47.5673, lng: -122.6326 },
  silverdale: { lat: 47.6479, lng: -122.6943 },
  "port orchard": { lat: 47.5401, lng: -122.6329 },
  "gig harbor": { lat: 47.3318, lng: -122.5793 },
  "federal way": { lat: 47.3223, lng: -122.3126 },
  renton: { lat: 47.4829, lng: -122.2171 },
  bellevue: { lat: 47.6101, lng: -122.2015 },
  kirkland: { lat: 47.6815, lng: -122.2087 },
  redmond: { lat: 47.674, lng: -122.1215 },
  issaquah: { lat: 47.5301, lng: -122.0326 },
  lynnwood: { lat: 47.8209, lng: -122.3151 },
  edmonds: { lat: 47.8107, lng: -122.3779 },
  shoreline: { lat: 47.7543, lng: -122.3429 },
  burien: { lat: 47.4704, lng: -122.3468 },
  "des moines": { lat: 47.4018, lng: -122.3243 },
  tukwila: { lat: 47.4742, lng: -122.2612 },
  lakewood: { lat: 47.1718, lng: -122.5185 },
  pasco: { lat: 46.2396, lng: -119.1006 },
  kennewick: { lat: 46.2113, lng: -119.1372 },
  richland: { lat: 46.2804, lng: -119.2752 },
  wenatchee: { lat: 47.4235, lng: -120.3103 },
  "east wenatchee": { lat: 47.4157, lng: -120.2812 },
  "walla walla": { lat: 46.0646, lng: -118.343 },
  "moses lake": { lat: 47.1301, lng: -119.2779 },
  ellensburg: { lat: 46.9965, lng: -120.5487 },
  aberdeen: { lat: 46.9754, lng: -123.8154 },
  centralia: { lat: 46.7162, lng: -122.9543 },
  chehalis: { lat: 46.6621, lng: -122.9640 },
  longview: { lat: 46.1382, lng: -122.9382 },
  kelso: { lat: 46.1468, lng: -122.9085 },
  "port angeles": { lat: 48.1181, lng: -123.4307 },
  sequim: { lat: 48.0793, lng: -123.1007 },
  "oak harbor": { lat: 48.2929, lng: -122.6429 },
  anacortes: { lat: 48.5126, lng: -122.6126 },
  burlington: { lat: 48.4754, lng: -122.3279 },
  monroe: { lat: 47.8554, lng: -121.9715 },
  snohomish: { lat: 47.9126, lng: -122.0987 },
  arlington: { lat: 48.1654, lng: -122.1251 },
  stanwood: { lat: 48.2415, lng: -122.3743 },
  "bonney lake": { lat: 47.1779, lng: -122.1762 },
  "maple valley": { lat: 47.369, lng: -122.0479 },
  enumclaw: { lat: 47.2021, lng: -121.9921 },
  yelm: { lat: 46.9429, lng: -122.6093 },
  lacey: { lat: 47.034, lng: -122.8232 },
  tumwater: { lat: 47.0076, lng: -122.9085 },
  shelton: { lat: 47.2151, lng: -123.1007 },
  covington: { lat: 47.3601, lng: -122.1029 },
  sumner: { lat: 47.2032, lng: -122.2404 },
  fife: { lat: 47.2393, lng: -122.3571 },
  "liberty lake": { lat: 47.6732, lng: -117.0977 },
  "airway heights": { lat: 47.6446, lng: -117.5933 },
  "south hill": { lat: 47.1418, lng: -122.2871 },
  "rodeo city": { lat: 46.9965, lng: -120.5487 }, // Ellensburg-area alias
  okanogan: { lat: 48.3610, lng: -119.5834 },
  omak: { lat: 48.4110, lng: -119.5276 },
  chelan: { lat: 47.8410, lng: -120.0166 },
  "lake stevens": { lat: 48.0154, lng: -122.0638 },
  woodinville: { lat: 47.7543, lng: -122.1635 },
  // Oregon (border-shopping distance from SW Washington)
  portland: { lat: 45.5152, lng: -122.6784 },
  "wood village": { lat: 45.5343, lng: -122.4187 },
  hillsboro: { lat: 45.5229, lng: -122.9898 },
  salem: { lat: 44.9429, lng: -123.0351 },
  eugene: { lat: 44.0521, lng: -123.0868 },
  "coburg": { lat: 44.1371, lng: -123.0662 },
  redmond_or: { lat: 44.2726, lng: -121.1739 },
  bend: { lat: 44.0582, lng: -121.3153 },
  medford: { lat: 42.3265, lng: -122.8756 },
  // Idaho / Montana (regional dealers present in the dataset)
  boise: { lat: 43.615, lng: -116.2023 },
  "post falls": { lat: 47.718, lng: -116.9516 },
  "coeur d'alene": { lat: 47.6777, lng: -116.7805 },
  missoula: { lat: 46.8721, lng: -113.994 },
  billings: { lat: 45.7833, lng: -108.5007 },
  // Additional WA dealer cities
  milton: { lat: 47.2481, lng: -122.3129 },
  "battle ground": { lat: 45.781, lng: -122.5337 },
  woodland: { lat: 45.9046, lng: -122.744 },
  "tri-cities": { lat: 46.2113, lng: -119.1372 }, // Kennewick-centered metro alias
};

/** Common alternate spellings → canonical CITY_COORDS keys. */
const CITY_ALIASES: Record<string, string> = {
  "mt. vernon": "mount vernon",
  "mt vernon": "mount vernon",
  "couer d'alene": "coeur d'alene",
  cda: "coeur d'alene",
};

const STATE_SUFFIX = /,\s*(wa|washington|or|oregon|id|idaho|mt|montana)\.?$/i;

/** Resolve a free-text place ("Tacoma", "Tacoma, WA", "Mt. Vernon") to coordinates. */
export function resolvePlace(place: string): (LatLng & { canonical: string }) | null {
  let cleaned = place.trim().toLowerCase().replace(STATE_SUFFIX, "").trim();
  if (!cleaned) return null;
  cleaned = CITY_ALIASES[cleaned] ?? cleaned;
  const hit = CITY_COORDS[cleaned];
  if (!hit) return null;
  return { ...hit, canonical: titleCase(cleaned) };
}

/**
 * Scan a messy location string ("4309 East Valley Highway | Sumner",
 * "13000 Highway 99 • Everett") for any known city name. Longest match wins
 * so "east wenatchee" beats "wenatchee".
 */
export function scanForCity(text: string): (LatLng & { canonical: string }) | null {
  const t = ` ${text.toLowerCase().replace(/[|•,.]/g, " ").replace(/\s+/g, " ")} `;
  let best: string | null = null;
  const candidates = [...Object.keys(CITY_COORDS), ...Object.keys(CITY_ALIASES)];
  for (const name of candidates) {
    if (t.includes(` ${name} `) && (!best || name.length > best.length)) best = name;
  }
  if (!best) return null;
  const canonical = CITY_ALIASES[best] ?? best;
  return { ...CITY_COORDS[canonical], canonical: titleCase(canonical) };
}

export function knownPlaces(): string[] {
  return Object.keys(CITY_COORDS)
    .filter((k) => k !== "redmond_or")
    .map(titleCase)
    .sort();
}

function titleCase(s: string): string {
  return s.replace(/(^|[\s'-])\w/g, (c) => c.toUpperCase());
}

/** Great-circle distance in statute miles. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const R = 3959;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
