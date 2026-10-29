/**
 * Manufacturer-published specs for exact model year + series + floorplan.
 *
 * Every record cites the manufacturer's own https page (or brochure PDF on its
 * domain) and the date it was read. Fields the manufacturer does not publish
 * are omitted — never computed (e.g. no GVWR = UVW + CCC). Add records only
 * from first-party sources; buildSpecIndex rejects anything else.
 *
 * TS module (not JSON) so it bundles in the browser client and API alike.
 */

import type { ManufacturerSpecRecord } from "./manufacturer-specs.js";
import { GRAND_DESIGN_SPEC_RECORDS } from "./spec-records/grand-design.js";
import { KEYSTONE_SPEC_RECORDS } from "./spec-records/keystone.js";

/** Hand-verified seed records (#56). Crawled records for the same year + make + series + floorplan replace them. */
export const SEED_SPEC_RECORDS: ManufacturerSpecRecord[] = [
  {
    "year": 2027,
    "make": "Keystone",
    "brandAliases": [
      "Coleman"
    ],
    "series": "Coleman",
    "floorplanCode": "17B",
    "sourceUrl": "https://www.keystonerv.com/product/coleman-travel-trailers/comfort-travel-trailers/floorplans/17B",
    "retrievedAt": "2026-10-26",
    "labels": {
      "dryWeightLbs": "Shipping Weight",
      "hitchWeightLbs": "Hitch",
      "lengthFt": "Length",
      "sleeps": "Sleeping Capacity",
      "blackWaterGal": "Waste Water"
    },
    "specs": {
      "lengthFt": 20.17,
      "sleeps": 5,
      "dryWeightLbs": 3071,
      "hitchWeightLbs": 398,
      "freshWaterGal": 21,
      "greyWaterGal": 34,
      "blackWaterGal": 34
    }
  },
  {
    "year": 2027,
    "make": "Jayco",
    "series": "Jay Flight",
    "note": "Fresh water omitted on purpose: Jayco says Western-built Jay Flights carry 76/80 gal and Eastern-built units list 52 gal, so the page's 76 gal is not exact for every 270BHSW VIN.",
    "floorplanCode": "270BHSW",
    "sourceUrl": "https://www.jayco.com/rvs/travel-trailers/2027-jay-flight/270bhsw/",
    "retrievedAt": "2026-10-26",
    "labels": {
      "lengthFt": "Exterior Length (overall)",
      "dryWeightLbs": "Unloaded Vehicle Weight (lbs)",
      "hitchWeightLbs": "Dry Hitch Weight (lbs)",
      "gvwrLbs": "Gross Vehicle Weight Rating (lbs)",
      "sleeps": "Sleeps (up to)"
    },
    "specs": {
      "lengthFt": 31.83,
      "sleeps": 10,
      "dryWeightLbs": 5380,
      "gvwrLbs": 7000,
      "hitchWeightLbs": 760,
      "greyWaterGal": 40,
      "blackWaterGal": 40
    }
  }
];

const keyOf = (r: ManufacturerSpecRecord) => `${r.year}|${r.make}|${r.series}|${r.floorplanCode}`.toUpperCase();
const crawled = [...GRAND_DESIGN_SPEC_RECORDS, ...KEYSTONE_SPEC_RECORDS];
const crawledKeys = new Set(crawled.map(keyOf));

export const MANUFACTURER_SPEC_RECORDS: ManufacturerSpecRecord[] = [
  ...SEED_SPEC_RECORDS.filter((r) => !crawledKeys.has(keyOf(r))),
  ...crawled,
];
