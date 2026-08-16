/**
 * MatchRV Scraper - Adapter Registry
 *
 * Maps dealer domains to specific adapter classes. When a domain has
 * a custom adapter, it's used instead of the generic BaseAdapter.
 *
 * To add a new dealer-specific adapter:
 *   1. Create a new file in adapters/ (e.g., camping-world.js)
 *   2. Export a class that extends BaseAdapter
 *   3. Register it here with the dealer's domain(s)
 *
 * Example:
 *   import { CampingWorldAdapter } from './camping-world.js';
 *   registry.set('campingworld.com', CampingWorldAdapter);
 *   registry.set('grantmeadowsrv.com', CampingWorldAdapter); // same platform
 */

import { BaseAdapter } from './base.js';
import { extractDomain } from '../utils.js';

/** Map of domain → adapter class */
const registry = new Map();

// ── Register dealer-specific adapters below ──────────────────────────────
import { PoulsboRvAdapter } from './poulsbo-rv.js';
registry.set('poulsborv.com', PoulsboRvAdapter);

import { CampingWorldAdapter } from './camping-world.js';
registry.set('rv.campingworld.com', CampingWorldAdapter);
registry.set('campingworld.com', CampingWorldAdapter);

import { InteractRvAdapter } from './interactrv.js';
registry.set('fifervcenter.com', InteractRvAdapter);
registry.set('www.fifervcenter.com', InteractRvAdapter);
// Add other InteractRV dealers here as discovered:
// registry.set('otherdealersite.com', InteractRvAdapter);

import { CoastStealthAdapter } from './coast-stealth.js';
registry.set('tacomarv.com', CoastStealthAdapter);
// Add other Coast Technology / Stealth Suite dealers here:
// registry.set('otherstealthdealer.com', CoastStealthAdapter);

import { SmallDealerAdapter } from './small-dealer.js';
// Small independent dealers with JS-rendered inventory and non-standard selectors
registry.set('centralwashingtonrv.com', SmallDealerAdapter);
registry.set('www.centralwashingtonrv.com', SmallDealerAdapter);
registry.set('rodeocityrv.com', SmallDealerAdapter);
registry.set('www.rodeocityrv.com', SmallDealerAdapter);
registry.set('awesomerv.com', SmallDealerAdapter);
registry.set('www.awesomerv.com', SmallDealerAdapter);
registry.set('johnsonrv.com', SmallDealerAdapter);
registry.set('www.johnsonrv.com', SmallDealerAdapter);

/**
 * Get the appropriate adapter for a given inventory URL.
 * Falls back to BaseAdapter if no domain-specific adapter exists.
 *
 * @param {string} inventoryUrl
 * @returns {BaseAdapter}
 */
export function getAdapter(inventoryUrl) {
  const domain = extractDomain(inventoryUrl);
  const AdapterClass = registry.get(domain) || BaseAdapter;

  if (AdapterClass !== BaseAdapter) {
    console.log(`[ADAPTER] Using custom adapter for ${domain}`);
  } else {
    console.log(`[ADAPTER] Using generic adapter for ${domain}`);
  }

  return new AdapterClass(inventoryUrl);
}

/**
 * Register a custom adapter for one or more domains.
 * @param {string|string[]} domains
 * @param {typeof BaseAdapter} adapterClass
 */
export function registerAdapter(domains, adapterClass) {
  const domainList = Array.isArray(domains) ? domains : [domains];
  for (const d of domainList) {
    registry.set(d.replace(/^www\./, ''), adapterClass);
  }
}
