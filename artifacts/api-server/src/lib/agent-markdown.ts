/**
 * Markdown for agents: clean Markdown versions of the unit pages
 * (/listing/:id) and the inventory hub pages (/rvs/...).
 *
 * Served when the request's Accept header prefers text/markdown over
 * text/html, or at the same URL with a ".md" suffix. Browsers never send
 * text/markdown, so they keep getting the unchanged HTML.
 *
 * Same facts as the HTML page, same rules: what the listing doesn't state is
 * left out, and availability is "what the dealer's site showed when MatchRV
 * last saw it", never a live stock claim.
 */
import type { CanonicalUnit } from "@workspace/agent-core";
import { listingCanonicalUrl } from "./listing-seo";
import { advertisablePrice, bareTitle, buildUnitInsights, dealerDisplayName, unitLocation, unitUrl } from "./unit-insights";
import type { HubPageData } from "./inventory-hubs";

export const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";

/**
 * True when the Accept header asks for text/markdown at least as strongly as
 * for HTML. Only an explicit text/markdown (or text/x-markdown) entry with
 * q > 0 counts; wildcards alone never select Markdown.
 */
export function prefersMarkdown(accept: string | undefined | null): boolean {
  if (!accept) return false;
  let md = -1;
  let html = -1;
  let textAny = -1;
  let any = -1;
  for (const part of accept.split(",")) {
    const [rawType = "", ...params] = part.split(";");
    const type = rawType.trim().toLowerCase();
    if (!type) continue;
    let q = 1;
    for (const p of params) {
      const m = /^\s*q\s*=\s*([0-9.]+)\s*$/i.exec(p);
      if (m) {
        const n = Number(m[1]);
        q = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
      }
    }
    if (type === "text/markdown" || type === "text/x-markdown") md = Math.max(md, q);
    else if (type === "text/html" || type === "application/xhtml+xml") html = Math.max(html, q);
    else if (type === "text/*") textAny = Math.max(textAny, q);
    else if (type === "*/*") any = Math.max(any, q);
  }
  if (md <= 0) return false;
  const htmlQ = html >= 0 ? html : textAny >= 0 ? textAny : any >= 0 ? any : 0;
  return md >= htmlQ;
}

/** Plain text safe to drop into Markdown: one line, control characters removed, Markdown/HTML punctuation escaped. */
export function mdText(value: unknown): string {
  return String(value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/([\\`*_{}[\]()<>#+!|~&])/g, "\\$1");
}

/** An http(s) URL usable inside a Markdown link, or null. */
export function mdUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return u.href.replace(/[()<> ]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function availabilityLine(unit: CanonicalUnit): string | null {
  const seenOn = /^\d{4}-\d{2}-\d{2}/.test(unit.provenance?.lastSeenAt ?? "") ? unit.provenance.lastSeenAt.slice(0, 10) : null;
  const statusText =
    unit.status === "available" ? "Listed as available" :
    unit.status === "pending" ? "Listed as sale pending" :
    unit.status === "sold" ? "Listed as sold" :
    unit.status === "removed" ? "No longer listed" : null;
  if (statusText && seenOn) return `${statusText} on the dealer's site when MatchRV last saw it on ${seenOn}. Confirm with the dealership.`;
  if (seenOn) return `Last seen on the dealer's site on ${seenOn}. Confirm availability with the dealership.`;
  return null;
}

/** Markdown for one unit page. */
export function renderListingMarkdown(unit: CanonicalUnit): string {
  const insights = buildUnitInsights(unit);
  const canonical = listingCanonicalUrl(unit.id);
  const price = advertisablePrice(unit);
  const cond = unit.condition === "new" ? "New" : unit.condition === "used" ? "Used" : "";
  const subtitle = [cond, `${unit.year ?? ""} ${unit.make ?? ""} ${unit.model ?? ""}`.replace(/\s+/g, " ").trim(), insights.typeLabel].filter(Boolean).join(" ");
  const lines: string[] = [`# ${mdText(unit.title)}`, ""];
  if (subtitle) lines.push(mdText(subtitle), "");
  lines.push(`- **Price:** ${price != null ? mdText(usd(price)) : "Price on request"}`);
  const location = insights.location || unitLocation(unit);
  lines.push(`- **Dealer:** ${mdText(dealerDisplayName(unit))}${location ? ` — ${mdText(location)}` : ""}`);
  const avail = availabilityLine(unit);
  if (avail) lines.push(`- **Availability:** ${mdText(avail)}`);
  lines.push(`- **Listing:** <${mdUrl(canonical) ?? canonical}>`);
  if (insights.specs.length) {
    lines.push("", "## Key specs", "");
    for (const r of insights.specs) lines.push(`- **${mdText(r.label)}:** ${mdText(r.value)}${r.source ? ` (${mdText(r.source)})` : ""}`);
  }
  if (insights.priceContext) lines.push("", "## How this price compares", "", mdText(insights.priceContext.summary));
  if (insights.tow) lines.push("", "## What can tow it", "", `${mdText(insights.tow.summary)} Planning guidance from MatchRV's tow reference table, not a safety determination.`);
  if (insights.dealerDescription) lines.push("", `## From ${mdText(dealerDisplayName(unit))}'s listing`, "", `> ${mdText(insights.dealerDescription)}`);
  lines.push("", "---", "", `Canonical: <${mdUrl(canonical) ?? canonical}>`);
  if (insights.hub) {
    const hub = mdUrl(insights.hub.url);
    if (hub) lines.push(`More like this: [${mdText(insights.hub.label)}](${hub})`);
  }
  lines.push("Source: MatchRV inventory snapshot of dealer websites. Specs and prices can change; confirm with the dealership.", "");
  return lines.join("\n");
}

/** Markdown for one inventory hub page. */
export function renderHubMarkdown(data: HubPageData): string {
  const lines: string[] = [`# ${mdText(data.label)}${data.page > 1 ? ` (page ${data.page} of ${data.pages})` : ""}`, ""];
  lines.push(mdText(`${data.total.toLocaleString("en-US")} listings at ${data.dealers} ${data.dealers === 1 ? "dealership" : "dealerships"} in ${data.stateName}, as MatchRV last saw them on each dealer's website. Confirm price and availability with the dealership.`), "");
  for (const u of data.units) {
    const url = mdUrl(unitUrl(u.id));
    const price = advertisablePrice(u);
    const cond = u.condition === "new" ? "New " : u.condition === "used" ? "Used " : "";
    const facts = [
      price != null ? usd(price) : "Price on request",
      [dealerDisplayName(u), unitLocation(u)].filter(Boolean).join(", "),
      u.sleeps?.value != null ? `sleeps ${u.sleeps.value}` : null,
      u.lengthFt?.value != null ? `${u.lengthFt.value} ft` : null,
      u.dryWeightLbs?.value != null ? `${Math.round(u.dryWeightLbs.value).toLocaleString("en-US")} lbs dry` : null,
    ].filter(Boolean).join(" · ");
    const title = mdText(`${cond}${bareTitle(u)}`);
    lines.push(`- ${url ? `[${title}](${url})` : title} — ${mdText(facts)}`);
  }
  lines.push("");
  const prev = mdUrl(data.prevUrl);
  const next = mdUrl(data.nextUrl);
  if (prev || next) {
    lines.push([prev ? `[Previous page](${prev})` : null, next ? `[Next page](${next})` : null].filter(Boolean).join(" · "), "");
  }
  lines.push("---", "", `Canonical: <${mdUrl(data.url) ?? data.url}>`, "");
  return lines.join("\n");
}

export function renderNotFoundMarkdown(what: "listing" | "page"): string {
  return what === "listing"
    ? "# Listing not found\n\nThis RV listing was not found on MatchRV. It may have sold or been removed by the dealer.\n\nSearch current inventory: <https://matchrv.com/shop>\n"
    : "# Not found\n\nNo MatchRV inventory page here.\n\nSearch current inventory: <https://matchrv.com/shop>\n";
}
