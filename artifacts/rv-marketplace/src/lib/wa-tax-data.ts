export interface WaTaxInfo {
  county: string;
  combinedRate: number;
  isRta: boolean;
}

const WA_ZIP_PREFIX_MAP: Record<string, WaTaxInfo> = {
  "980": { county: "King", combinedRate: 10.25, isRta: true },
  "981": { county: "King", combinedRate: 10.25, isRta: true },
  "982": { county: "Snohomish", combinedRate: 10.5, isRta: true },
  "983": { county: "Pierce", combinedRate: 10.2, isRta: true },
  "984": { county: "Pierce", combinedRate: 10.2, isRta: true },
  "985": { county: "Thurston", combinedRate: 9.2, isRta: false },
  "986": { county: "Clark", combinedRate: 8.6, isRta: false },
  "988": { county: "Chelan", combinedRate: 8.5, isRta: false },
  "989": { county: "Yakima", combinedRate: 8.3, isRta: false },
  "990": { county: "Spokane", combinedRate: 8.9, isRta: false },
  "991": { county: "Stevens", combinedRate: 8.1, isRta: false },
  "992": { county: "Spokane", combinedRate: 8.9, isRta: false },
  "993": { county: "Benton", combinedRate: 8.6, isRta: false },
  "994": { county: "Asotin", combinedRate: 8.0, isRta: false },
};

const WA_FALLBACK: WaTaxInfo = {
  county: "Washington State",
  combinedRate: 8.7,
  isRta: false,
};

export function isWaZip(zip: string): boolean {
  const cleaned = zip.replace(/\s/g, "");
  if (cleaned.length < 5 || !/^\d{5}/.test(cleaned)) return false;
  const prefix = cleaned.substring(0, 3);
  const num = parseInt(prefix, 10);
  return num >= 980 && num <= 994;
}

export function lookupWaTax(zip: string): WaTaxInfo | null {
  if (!isWaZip(zip)) return null;
  const prefix = zip.replace(/\s/g, "").substring(0, 3);
  return WA_ZIP_PREFIX_MAP[prefix] ?? WA_FALLBACK;
}
