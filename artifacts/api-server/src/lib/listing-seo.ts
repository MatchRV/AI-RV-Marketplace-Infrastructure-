/**
 * Crawler-readable unit page injection (MAT-32 lite).
 * Same HTML for humans and bots — no UA sniffing / cloaking.
 */
import { publicListingId, type CanonicalUnit } from "@workspace/agent-core";
import { isBoilerplateDescription } from "./description-boilerplate";
import {
  advertisablePrice,
  bareTitle,
  buildUnitInsights,
  dealerDisplayName,
  type UnitInsights,
} from "./unit-insights";

const SITE = "https://matchrv.com";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** JSON-LD must not contain a literal `</script>` sequence. */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function isRealVin(vin: string | null | undefined): vin is string {
  return typeof vin === "string" && /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin.trim());
}

/**
 * schema.org availability for a unit, or `undefined` when MatchRV doesn't know.
 * Unknown stays unknown: an `unknown` status emits no availability at all
 * (never InStock). `pending` means a buyer has it on hold → Reserved.
 */
export function availability(unit: Pick<CanonicalUnit, "status">): string | undefined {
  if (unit.status === "available") return "https://schema.org/InStock";
  if (unit.status === "pending") return "https://schema.org/Reserved";
  if (unit.status === "sold") return "https://schema.org/SoldOut";
  if (unit.status === "removed") return "https://schema.org/OutOfStock";
  return undefined;
}

function condition(unit: CanonicalUnit): string {
  return unit.condition === "new"
    ? "https://schema.org/NewCondition"
    : "https://schema.org/UsedCondition";
}

export function listingCanonicalUrl(unitId: string): string {
  // Keep colon ids readable in paths (browsers + our SPA accept them).
  // publicListingId is a no-op except for ids that embed a dealer URL.
  return `${SITE}/listing/${publicListingId(unitId)}`;
}

export function buildUnitJsonLd(unit: CanonicalUnit): Record<string, unknown> {
  const url = listingCanonicalUrl(unit.id);
  // A price that fails the sanity checks (below the class floor, or
  // contradicted by the dealer's own text) is not advertised.
  const price = advertisablePrice(unit);
  const image = unit.images[0] ?? undefined;
  const seller: Record<string, unknown> = {
    "@type": "AutoDealer",
    name: dealerDisplayName(unit),
    address: {
      "@type": "PostalAddress",
      addressLocality: unit.dealer.city || undefined,
      addressRegion: unit.dealer.state || undefined,
      addressCountry: "US",
    },
  };
  if (unit.dealer.website) seller.url = unit.dealer.website;

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url,
    priceCurrency: "USD",
    itemCondition: condition(unit),
    seller,
  };
  const avail = availability(unit);
  if (avail) offer.availability = avail;
  if (typeof price === "number" && Number.isFinite(price)) {
    offer.price = price;
  }

  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["Product", "Vehicle"],
    name: unit.title,
    brand: { "@type": "Brand", name: unit.make },
    model: unit.model,
    vehicleModelDate: String(unit.year),
    url,
    offers: offer,
  };
  if (image) ld.image = image;
  if (isRealVin(unit.vin)) ld.vehicleIdentificationNumber = unit.vin.trim().toUpperCase();
  if (unit.description && !isBoilerplateDescription(unit.description)) ld.description = unit.description.slice(0, 500);
  return ld;
}

function breadcrumbJsonLd(unit: CanonicalUnit, insights: UnitInsights): Record<string, unknown> {
  const items: Array<{ name: string; item: string }> = [{ name: "MatchRV", item: `${SITE}/` }];
  if (insights.hub) items.push({ name: insights.hub.label, item: insights.hub.url });
  items.push({ name: unit.title, item: listingCanonicalUrl(unit.id) });
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((x, i) => ({ "@type": "ListItem", position: i + 1, name: x.name, item: x.item })),
  };
}

export function buildListingHeadInjection(unit: CanonicalUnit, insights: UnitInsights = buildUnitInsights(unit)): string {
  const url = listingCanonicalUrl(unit.id);
  const title = insights.seo.title;
  const desc = insights.seo.description;
  const image = unit.images[0] ?? `${SITE}/opengraph.jpg`;
  const ld = safeJsonLd(buildUnitJsonLd(unit));
  const crumbs = safeJsonLd(breadcrumbJsonLd(unit, insights));

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(desc)}" />`,
    // Pages that add nothing over the dealer's listing, or whose data failed a
    // check, stay out of the index but still pass link equity.
    ...(insights.indexable ? [] : [`<meta name="robots" content="noindex, follow" />`]),
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="product" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(desc)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image)}" />`,
    `<meta property="og:site_name" content="MatchRV" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(desc)}" />`,
    `<script type="application/ld+json" id="matchrv-unit-jsonld">${ld}</script>`,
    `<script type="application/ld+json" id="matchrv-unit-breadcrumbs">${crumbs}</script>`,
  ].join("\n    ");
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Crawler-readable unit page. Everything MatchRV adds over the dealer's
 * listing is here: specs with their source, the tow check, price context
 * against similar listings, similar units and the shopping hub. React
 * replaces it on mount and shows the same sections (ListingInsights).
 */
export function buildListingBodySummary(unit: CanonicalUnit, insights: UnitInsights = buildUnitInsights(unit)): string {
  const dealer = dealerDisplayName(unit);
  const advertised = advertisablePrice(unit);
  const price = advertised != null ? usd(advertised) : "Price on request";
  const cond = unit.condition === "new" ? "New" : unit.condition === "used" ? "Used" : "";
  const parts: string[] = [];
  if (insights.hub) {
    parts.push(`<nav aria-label="Breadcrumb"><a href="/">MatchRV</a> › <a href="${escapeHtml(insights.hub.url)}">${escapeHtml(insights.hub.label)}</a></nav>`);
  }
  parts.push(
    `<h1>${escapeHtml(unit.title)}</h1>`,
    `<p>${escapeHtml([cond, `${unit.year} ${unit.make} ${unit.model}`.replace(/\s+/g, " ").trim(), insights.typeLabel].filter(Boolean).join(" "))}</p>`,
    `<p>Price: ${escapeHtml(price)}</p>`,
    `<p>Dealer: ${escapeHtml(dealer)}${insights.location ? ` — ${escapeHtml(insights.location)}` : ""}</p>`,
  );
  // Freshness, stated plainly: what the dealer's site showed and when MatchRV
  // last saw it. Unknown status prints nothing (never "available").
  const statusText = unit.status === "available" ? "Listed as available" : unit.status === "pending" ? "Listed as sale pending" : unit.status === "sold" ? "Listed as sold" : unit.status === "removed" ? "No longer listed" : null;
  const seenOn = /^\d{4}-\d{2}-\d{2}/.test(unit.provenance.lastSeenAt ?? "") ? unit.provenance.lastSeenAt.slice(0, 10) : null;
  if (statusText && seenOn) parts.push(`<p>Availability: ${escapeHtml(statusText)} on the dealer's site when MatchRV last saw it on <time datetime="${escapeHtml(seenOn)}">${escapeHtml(seenOn)}</time>. Confirm with the dealership.</p>`);
  else if (seenOn) parts.push(`<p>Last seen on the dealer's site: <time datetime="${escapeHtml(seenOn)}">${escapeHtml(seenOn)}</time>. Confirm availability with the dealership.</p>`);

  if (insights.priceContext) {
    parts.push(`<section id="price-context"><h2>How this price compares</h2><p>${escapeHtml(insights.priceContext.summary)}</p></section>`);
  }
  if (insights.tow) {
    const t = insights.tow;
    const list = (label: string, names: string[]) =>
      names.length ? `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(names.join(", "))}</p>` : "";
    parts.push(
      `<section id="tow-check"><h2>What can tow it</h2><p>${escapeHtml(t.summary)}</p>${list("Rated with margin in any configuration", t.comfortable)}${list("Some configurations only", t.dependsOnConfig)}${list("Not rated for it", t.tooHeavy)}<p>Planning guidance from MatchRV's tow reference table, not a safety determination. Check your vehicle's door-jamb sticker and owner's manual. <a href="/tow-guide">How tow ratings work</a>.</p></section>`,
    );
  }
  if (insights.specs.length) {
    const rows = insights.specs.map((r) => `<tr><th scope="row">${escapeHtml(r.label)}</th><td>${escapeHtml(r.value)}</td><td>${escapeHtml(r.source)}</td></tr>`).join("");
    parts.push(`<section id="specs"><h2>Specs</h2><table><thead><tr><th>Spec</th><th>Value</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></section>`);
  }
  if (insights.offGrid) {
    const o = insights.offGrid;
    parts.push(`<section id="off-grid"><h2>Off-grid readiness</h2><p>MatchRV off-grid score: ${escapeHtml(String(o.score))} out of 100, from ${escapeHtml(o.knownInputs.join("; "))}.${o.missingInputs.length ? ` Not stated by the dealer: ${escapeHtml(o.missingInputs.join(", "))}.` : ""}</p></section>`);
  }
  if (insights.dealerDescription) {
    parts.push(`<section id="dealer-description"><h2>From ${escapeHtml(dealer)}'s listing</h2><blockquote>${escapeHtml(insights.dealerDescription)}</blockquote></section>`);
  }
  if (insights.similar.length) {
    const items = insights.similar.map((s) => `<li><a href="${escapeHtml(s.url)}">${escapeHtml(s.title)}</a>${s.priceUsd != null ? ` — ${escapeHtml(usd(s.priceUsd))}` : ""}${s.location ? `, ${escapeHtml(s.location)}` : ""}</li>`).join("");
    parts.push(`<section id="similar"><h2>Similar ${escapeHtml(bareTitle(unit).replace(/^\d{4}\s+/, ""))} listings</h2><ul>${items}</ul></section>`);
  }
  if (insights.hub) parts.push(`<p><a href="${escapeHtml(insights.hub.url)}">See all ${escapeHtml(insights.hub.label.replace(/ for Sale in /, " in "))}</a></p>`);
  parts.push(`<p><a href="${escapeHtml(listingCanonicalUrl(unit.id))}">View on MatchRV</a></p>`);
  return `<div id="matchrv-crawler-summary" data-unit-id="${escapeHtml(unit.id)}">${parts.join("")}</div>`;
}

export function buildUnknownListingHead(unitId: string): string {
  // Unknown ids stay on the URL that was requested. Do not mint a slug for
  // a unit MatchRV does not have.
  const url = `${SITE}/listing/${unitId}`;
  return [
    `<title>Listing not found | MatchRV</title>`,
    `<meta name="robots" content="noindex" />`,
    `<meta name="description" content="This RV listing was not found on MatchRV." />`,
    `<link rel="canonical" href="${escapeHtml(url)}" />`,
  ].join("\n    ");
}

/**
 * Inject unit-specific head tags + crawler summary into the SPA shell.
 * Replaces the default <title> and description; appends OG/JSON-LD before </head>.
 * Puts a noscript-visible summary inside #root (React replaces on mount).
 */
export function injectListingIntoShell(
  shellHtml: string,
  unit: CanonicalUnit | null,
  unitId: string,
): string {
  const insights = unit ? buildUnitInsights(unit) : null;
  const headExtra = unit && insights ? buildListingHeadInjection(unit, insights) : buildUnknownListingHead(unitId);
  const bodySummary = unit && insights
    ? buildListingBodySummary(unit, insights)
    : `<div id="matchrv-crawler-summary"><p>Listing not found.</p></div>`;

  let html = shellHtml;
  // Drop the default title/description so crawlers see unit-specific ones.
  html = html.replace(/<title>[^<]*<\/title>/i, "");
  html = html.replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, "");
  html = html.replace(/<\/head>/i, `    ${headExtra}\n  </head>`);
  html = html.replace(
    /<div id="root"><\/div>/i,
    `<div id="root">${bodySummary}</div>`,
  );
  return html;
}
