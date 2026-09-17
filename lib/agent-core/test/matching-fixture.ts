import { normalizeRecord } from "../src/index.js";

// Synthetic, fixed examples for matching/formatting tests. Never served as inventory.
export const matchingUnits = ["Springdale 262BH", "Hideout 26BHS", "Passport 240BH", "Bullet 250BHS", "Springdale 260BHC"].map((model, i) => {
  const result = normalizeRecord(`fixture:${i}`, {
    dealer_name: "Poulsbo RV",
    dealer_domain: "poulsborv.com",
    dealer_location: "Sumner",
    _first_seen: "2026-04-21T00:00:00Z",
    _last_seen: "2026-05-12T00:00:00Z",
    inventory_status: "available",
    condition: "new",
    year: 2025,
    make: "Keystone",
    model,
    title: `2025 Keystone ${model}`,
    stock_number: `FIXTURE-${i}`,
    rv_type: "Travel Trailer",
    price: 34995 + i * 100,
    length: "29",
    dry_weight: 5800,
    sleeps: 8,
    bunkhouse: true,
    image_urls: ["https://example.invalid/rv.jpg"],
  });
  if ("reject" in result) throw new Error(`Invalid matching fixture: ${result.reject.reason}`);
  return result.unit;
});
