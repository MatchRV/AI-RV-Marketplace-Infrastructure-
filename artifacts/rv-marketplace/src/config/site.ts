import { BOOKING_URL } from "@/config/booking";
import { MCP_ENDPOINT } from "@/config/mcp";

/** Contact details and labels shared by the marketing pages. */
export const SITE = {
  email: "jonathan@matchrv.com",
  phone: "(253) 330-8317",
  phoneHref: "tel:+12533308317",
  booking: BOOKING_URL,
  mcpEndpoint: MCP_ENDPOINT,
  // How the sample report's dealership is described. No dealership is named.
  sampleDealer: "Fife, WA dealer",
} as const;

/**
 * RV type slugs accepted by GET /api/listings?type=.
 * Counts for these types are never stored here — they come from that API.
 */
export const INVENTORY_TYPES = [
  "travel_trailer",
  "fifth_wheel",
  "class_c",
  "toy_hauler",
  "class_a",
  "class_b",
  "truck_camper",
  "popup_camper",
] as const;

export type InventoryType = (typeof INVENTORY_TYPES)[number];

/**
 * Dealer, store, and state coverage. These are not the live RV total and
 * have no listings-API source, so they stay dated. RV unit counts are read
 * live from GET /api/listings (see hooks/use-inventory-total.ts).
 */
export const INVENTORY = {
  dealers: 517,
  stores: 841,
  states: 49,
  networkAsOf: "October 19, 2026",
} as const;

/** Shown until the live listings total arrives, and when that request fails. */
export const RV_COUNT_PLACEHOLDER = "\u2014";
export const RV_COUNT_LIVE_STATUS = "RV count is live from MatchRV inventory.";
export const RV_COUNT_UNAVAILABLE_STATUS = "Live RV count is unavailable right now.";

const numberFormat = new Intl.NumberFormat("en-US");
export const formatCount = (value: number) => numberFormat.format(value);
