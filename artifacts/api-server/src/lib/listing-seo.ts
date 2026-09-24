/**
 * Crawler-readable unit page injection (MAT-32 lite).
 * Same HTML for humans and bots — no UA sniffing / cloaking.
 */
import type { CanonicalUnit } from "@workspace/agent-core";

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

function dealerDisplayName(unit: CanonicalUnit): string {
  const n = (unit.dealer.name || "").trim();
  if (n && !/^[a-z0-9.-]+$/i.test(n.replace(/\s/g, ""))) return n;
  // Slug-like names → title-case the slug words
  if (n.includes("-") || n.includes(".")) {
    return n
      .replace(/\.(com|net|org)$/i, "")
      .split(/[-_.]/)
      .filter(Boolean)
      .map((w) => {
        const lower = w.toLowerCase();
        if (lower === "rv" || lower === "rvs") return w.toUpperCase();
        return w.charAt(0).toUpperCase() + w.slice(1);
      })
      .join(" ");
  }
  return n || "RV Dealer";
}

function availability(unit: CanonicalUnit): string {
  if (unit.status === "available") return "https://schema.org/InStock";
  if (unit.status === "pending") return "https://schema.org/PreOrder";
  if (unit.status === "removed") return "https://schema.org/OutOfStock";
  return "https://schema.org/InStock";
}

function condition(unit: CanonicalUnit): string {
  return unit.condition === "new"
    ? "https://schema.org/NewCondition"
    : "https://schema.org/UsedCondition";
}

export function listingCanonicalUrl(unitId: string): string {
  // Keep colon ids readable in paths (browsers + our SPA accept them).
  return `${SITE}/listing/${unitId}`;
}

export function buildUnitJsonLd(unit: CanonicalUnit): Record<string, unknown> {
  const url = listingCanonicalUrl(unit.id);
  const price = unit.priceUsd.value;
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
    availability: availability(unit),
    itemCondition: condition(unit),
    seller,
  };
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
  if (unit.description) ld.description = unit.description.slice(0, 500);
  return ld;
}

export function buildListingHeadInjection(unit: CanonicalUnit): string {
  const url = listingCanonicalUrl(unit.id);
  const title = `${unit.title} for Sale | MatchRV`;
  const priceStr =
    typeof unit.priceUsd.value === "number"
      ? `$${unit.priceUsd.value.toLocaleString("en-US")}`
      : "Price on request";
  const dealer = dealerDisplayName(unit);
  const loc = [unit.dealer.city, unit.dealer.state].filter(Boolean).join(", ");
  const desc = [
    `${unit.year} ${unit.make} ${unit.model}`.replace(/\s+/g, " ").trim(),
    priceStr,
    loc ? `at ${dealer} in ${loc}` : `at ${dealer}`,
    "— see details on MatchRV.",
  ].join(" ");
  const image = unit.images[0] ?? `${SITE}/opengraph.jpg`;
  const ld = safeJsonLd(buildUnitJsonLd(unit));

  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(desc)}" />`,
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
    `<script type="application/ld+json">${ld}</script>`,
  ].join("\n    ");
}

export function buildListingBodySummary(unit: CanonicalUnit): string {
  const dealer = dealerDisplayName(unit);
  const price =
    typeof unit.priceUsd.value === "number"
      ? `$${unit.priceUsd.value.toLocaleString("en-US")}`
      : "Price on request";
  const parts = [
    `<h1>${escapeHtml(unit.title)}</h1>`,
    `<p>${escapeHtml(`${unit.year} ${unit.make} ${unit.model}`.replace(/\s+/g, " ").trim())}</p>`,
    `<p>Price: ${escapeHtml(price)}</p>`,
    `<p>Dealer: ${escapeHtml(dealer)}${unit.dealer.city || unit.dealer.state ? ` — ${escapeHtml([unit.dealer.city, unit.dealer.state].filter(Boolean).join(", "))}` : ""}</p>`,
  ];
  if (unit.sleeps.value != null) parts.push(`<p>Sleeps: ${escapeHtml(String(unit.sleeps.value))}</p>`);
  if (unit.lengthFt.value != null) parts.push(`<p>Length: ${escapeHtml(String(unit.lengthFt.value))} ft</p>`);
  parts.push(`<p><a href="${escapeHtml(listingCanonicalUrl(unit.id))}">View on MatchRV</a></p>`);
  return `<div id="matchrv-crawler-summary" data-unit-id="${escapeHtml(unit.id)}">${parts.join("")}</div>`;
}

export function buildUnknownListingHead(unitId: string): string {
  const url = listingCanonicalUrl(unitId);
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
  const headExtra = unit ? buildListingHeadInjection(unit) : buildUnknownListingHead(unitId);
  const bodySummary = unit
    ? buildListingBodySummary(unit)
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
