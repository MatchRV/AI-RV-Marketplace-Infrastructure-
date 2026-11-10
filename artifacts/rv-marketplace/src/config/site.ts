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
 * Inventory numbers shown on the marketing pages.
 *
 * The RV counts are fallbacks: pages show them until the live total arrives
 * from GET /api/listings?limit=1 (see hooks/use-inventory-total.ts), and keep
 * them when that request fails. Dealer, store, and state counts have no live
 * source, so update them and `networkAsOf` here.
 */
export const INVENTORY = {
  rvs: 131_718,
  rvsAsOf: "November 9, 2026",
  dealers: 517,
  stores: 841,
  states: 49,
  networkAsOf: "October 19, 2026",
  byType: {
    travel_trailer: 79_198,
    fifth_wheel: 21_383,
    class_c: 10_084,
    toy_hauler: 7_871,
    class_a: 6_325,
    class_b: 4_732,
    truck_camper: 1_376,
    popup_camper: 749,
  },
} as const;

export type InventoryType = keyof typeof INVENTORY.byType;

const numberFormat = new Intl.NumberFormat("en-US");
export const formatCount = (value: number) => numberFormat.format(value);
