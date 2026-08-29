/**
 * Curated dealer registry: scraped dealer_location strings are wildly
 * inconsistent ("Map & Hours", "4309 East Valley Highway | Sumner",
 * "13000 Highway 99 • Everett"), so canonical dealer identity comes from
 * this table (derived from MatchRV's authorized WA dealer list,
 * wa-dealers.json) plus a city-name scan of the raw location string for
 * multi-location dealers.
 */

export interface DealerRegistryEntry {
  domain: string;
  name: string;
  /** Default city when the record's own location string can't be resolved. */
  city: string;
  state: string;
}

export const DEALER_REGISTRY: DealerRegistryEntry[] = [
  { domain: "apachecamping.com", name: "Apache Camping Center", city: "Everett", state: "WA" },
  { domain: "awesomerv.com", name: "Awesome RV", city: "Chehalis", state: "WA" },
  { domain: "baydos.com", name: "Baydo's RV Center", city: "Fife", state: "WA" },
  { domain: "baydosrvs.com", name: "Baydo's RV Sales", city: "Chehalis", state: "WA" },
  { domain: "bladerv.com", name: "Blade RV Center", city: "Mount Vernon", state: "WA" },
  { domain: "bluecompassrv.com", name: "Blue Compass RV", city: "Pasco", state: "WA" },
  { domain: "bretzrv.com", name: "Bretz RV & Marine", city: "Liberty Lake", state: "WA" },
  { domain: "broadmoorrv.com", name: "Broadmoor RV SuperStore", city: "Pasco", state: "WA" },
  { domain: "camperschoicerv.com", name: "Camper's Choice RV", city: "Chehalis", state: "WA" },
  { domain: "campstarsrv.com", name: "Campstars RV Sales", city: "Olympia", state: "WA" },
  { domain: "centralwashingtonrv.com", name: "Central Washington RV", city: "Yakima", state: "WA" },
  { domain: "clearviewrv.com", name: "Clearview RV", city: "Snohomish", state: "WA" },
  { domain: "clickitrv.com", name: "ClickIt RV", city: "Spokane", state: "WA" },
  { domain: "clickitrvmoseslake.com", name: "ClickIt RV Moses Lake", city: "Moses Lake", state: "WA" },
  { domain: "clickitrvuniongap.com", name: "ClickIt RV Union Gap", city: "Union Gap", state: "WA" },
  { domain: "coumbsrv.com", name: "Coumbs RV", city: "Olympia", state: "WA" },
  { domain: "countrymotorhomes.com", name: "Country Motorhomes", city: "Mount Vernon", state: "WA" },
  { domain: "fifervcenter.com", name: "Fife RV Center", city: "Fife", state: "WA" },
  { domain: "haltermansrv.com", name: "Halterman's RV", city: "Arlington", state: "WA" },
  { domain: "hornrapidsrv.com", name: "Horn Rapids RV", city: "Richland", state: "WA" },
  { domain: "johnsonrv.com", name: "Johnson RV", city: "Fife", state: "WA" },
  { domain: "kitsaprvs.com", name: "Kitsap RV", city: "Bremerton", state: "WA" },
  { domain: "lazydays.com", name: "Lazydays RV of Vancouver", city: "Vancouver", state: "WA" },
  { domain: "libertyrvcenter.com", name: "Liberty RV Center", city: "Liberty Lake", state: "WA" },
  { domain: "maplegroverv.com", name: "Maple Grove RV", city: "Everett", state: "WA" },
  { domain: "openroadrvcenter.com", name: "Open Road RV", city: "Monroe", state: "WA" },
  { domain: "poulsborv.com", name: "Poulsbo RV", city: "Sumner", state: "WA" },
  { domain: "puyalluprv.com", name: "Puyallup RV", city: "Puyallup", state: "WA" },
  { domain: "puyalluprvofvancouver.com", name: "Puyallup RV of Vancouver", city: "Vancouver", state: "WA" },
  { domain: "rnrrv.com", name: "RnR RV Center", city: "Liberty Lake", state: "WA" },
  { domain: "rodeocityrv.com", name: "Rodeo City RV", city: "Ellensburg", state: "WA" },
  { domain: "royrobinsonrv.com", name: "Roy Robinson RV Center", city: "Marysville", state: "WA" },
  { domain: "rv.campingworld.com", name: "Camping World", city: "Tacoma", state: "WA" },
  { domain: "rvcountry.com", name: "RV Country", city: "Mount Vernon", state: "WA" },
  { domain: "rvsnorthwest.com", name: "RV's Northwest", city: "Spokane Valley", state: "WA" },
  { domain: "scottsrvvancouver.com", name: "Scott's RV", city: "Vancouver", state: "WA" },
  { domain: "seattleairstream.com", name: "Airstream Adventures Seattle", city: "Milton", state: "WA" },
  { domain: "selkirkrv.com", name: "Selkirk RV", city: "Spokane", state: "WA" },
  { domain: "southhillrv.com", name: "South Hill RV Sales", city: "Puyallup", state: "WA" },
  { domain: "speedwayrvcenter.com", name: "Speedway RV Center", city: "Monroe", state: "WA" },
  { domain: "sumnerrv.com", name: "Sumner RV", city: "Sumner", state: "WA" },
  { domain: "sunriservs.com", name: "Sunrise RVs", city: "Omak", state: "WA" },
  { domain: "tacomarv.com", name: "Tacoma RV Center", city: "Tacoma", state: "WA" },
  { domain: "uneekrv.com", name: "U-Neek RV Center", city: "Kelso", state: "WA" },
  { domain: "valleyrvsupercenter.com", name: "Valley RV Supercenter", city: "Kent", state: "WA" },
  { domain: "vancouverrv.com", name: "McCord's Vancouver RV", city: "Battle Ground", state: "WA" },
  { domain: "warnerautorv.rocks", name: "Warner Auto & RV Center", city: "Kennewick", state: "WA" },
  { domain: "wilderrvs.com", name: "Wilder RV", city: "Port Angeles", state: "WA" },
];

const byDomain = new Map(DEALER_REGISTRY.map((d) => [d.domain, d]));

export function lookupDealer(domain: string): DealerRegistryEntry | null {
  return byDomain.get(domain.toLowerCase()) ?? null;
}
