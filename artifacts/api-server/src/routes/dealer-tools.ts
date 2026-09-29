import { Router, type IRouter, type Request, type Response } from "express";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod/v4";

const router: IRouter = Router();

type Impact = "high" | "medium" | "low";
type Effort = "low" | "medium" | "high";

interface PageSnapshot {
  url: string;
  html: string;
  text: string;
  title: string;
  links: string[];
}

const sourceSchema = z.object({
  url: z.string().url().optional(),
  csv: z.string().max(1_000_000).optional(),
}).refine((v) => Boolean(v.url || v.csv), "Provide an inventory page URL or CSV text.");

const faqSchema = z.object({
  url: z.string().url(),
  location: z.string().min(2).max(100),
  inventoryFocus: z.string().max(120).optional(),
});

const contentCheckSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().int().min(1).max(8).optional(),
});

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

function extractLinks(base: URL, html: string): string[] {
  const out = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const u = new URL(m[1], base);
      if (u.origin === base.origin && /inventory|rv|listing|vehicle|unit/i.test(u.pathname)) out.add(u.toString());
    } catch {
      // ignore malformed links
    }
    if (out.size >= 24) break;
  }
  return [...out];
}

function isPrivateAddress(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) return true;
  const p = ip.split(".").map(Number);
  if (p.length === 4 && p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
  return ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd") || ip.toLowerCase().startsWith("fe80:");
}

async function assertPublicUrl(input: string): Promise<URL> {
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only http/https URLs are allowed.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || isIP(host)) throw new Error("Private/local hosts are not allowed.");
  const records = await lookup(host, { all: true });
  if (!records.length || records.some((r) => isPrivateAddress(r.address))) throw new Error("Host resolves to a private address.");
  return url;
}

async function fetchPage(input: string): Promise<PageSnapshot> {
  let url = await assertPublicUrl(input);
  let response: globalThis.Response | undefined;
  for (let redirect = 0; redirect < 4; redirect++) {
    response = await fetch(url, {
      headers: { "user-agent": "MatchRV-AEO-Checker/1.0 (+https://matchrv.com/for-dealers)" },
      signal: AbortSignal.timeout(12_000),
      redirect: "manual",
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const next = response.headers.get("location");
    if (!next) throw new Error("Website redirect has no destination.");
    url = await assertPublicUrl(new URL(next, url).toString());
  }
  if (!response) throw new Error("Website did not respond.");
  if (!response.ok) throw new Error(`Fetch failed with HTTP ${response.status}`);
  const html = (await response.text()).slice(0, 2_000_000);
  return {
    url: response.url,
    html,
    text: stripTags(html),
    title: extractTitle(html),
    links: extractLinks(new URL(response.url), html),
  };
}

type GeminiSearchResponse = {
  interaction?: { steps?: GeminiSearchStep[] };
  steps?: GeminiSearchStep[];
};
type GeminiSearchStep = {
  type: string;
  content?: Array<{ type: string; text?: string; annotations?: Array<{ type: string; url?: string; title?: string }> }>;
};

const quickReportSchema = z.object({
  website: z.string().trim().min(4).max(300),
  city: z.string().trim().min(2).max(80).regex(/^[\p{L}][\p{L} .'-]*$/u),
  state: z.string().trim().min(2).max(80).regex(/^[\p{L}][\p{L} .'-]*$/u),
});

const quickReportWindows = new Map<string, { start: number; count: number }>();
let quickReportsActive = 0;

router.get("/dealer-tools/quick-report/status", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ready: Boolean(process.env.GEMINI_API_KEY) });
});

router.post("/dealer-tools/quick-report", async (req: Request, res: Response) => {
  const parsed = quickReportSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_request", message: "Enter a dealership website, city, and state." });
  if (!process.env.GEMINI_API_KEY) return void res.status(503).json({ error: "gemini_unavailable", message: "The AI search check is temporarily unavailable." });
  const now = Date.now();
  for (const [key, value] of quickReportWindows) if (now - value.start > 3_600_000) quickReportWindows.delete(key);
  const key = req.ip || "unknown";
  const window = quickReportWindows.get(key) || { start: now, count: 0 };
  if (window.count >= 3 || quickReportsActive >= 3) return void res.status(429).json({ error: "busy", message: "The free check is busy. Please try again later." });
  window.count++; quickReportWindows.set(key, window); quickReportsActive++;
  res.setHeader("Cache-Control", "no-store");
  try {
    const { website, city, state } = parsed.data;
    const source = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    const first = await fetchPage(source);
    const question = `I'm looking for a 30-foot bunkhouse travel trailer for less than $40,000 near ${city}, ${state}. What options can you find?`;
    const model = process.env.GEMINI_REPORT_MODEL || "gemini-3.1-flash-lite";
    const [pagesResult, aiResult] = await Promise.allSettled([
      Promise.all(first.links.slice(0, 2).map(url => fetchPage(url).catch(() => null))),
      fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
        body: JSON.stringify({ model, input: question, tools: [{ type: "google_search" }] }),
        signal: AbortSignal.timeout(55_000),
      }).then(async response => {
        if (!response.ok) throw new Error(`Gemini search failed (${response.status})`);
        return response.json() as Promise<GeminiSearchResponse>;
      }),
    ]);
    const pages = [first, ...(pagesResult.status === "fulfilled" ? pagesResult.value.filter((p): p is PageSnapshot => Boolean(p)) : [])];
    const checks = [
      { label: "numeric price", test: (p: PageSnapshot) => money(p.text) !== null },
      { label: "RV type", test: (p: PageSnapshot) => Boolean(rvType(p.text)) },
      { label: "length", test: (p: PageSnapshot) => /(length|overall length)\s*[:\-]?\s*\d{1,2}(?:\.\d)?\s*(?:ft|feet|')/i.test(p.text) },
      { label: "sleeping capacity", test: (p: PageSnapshot) => /(sleeps|sleeping capacity)\s*[:\-]?\s*\d{1,2}/i.test(p.text) },
      { label: "Vehicle structured data", test: (p: PageSnapshot) => /"@type"\s*:\s*"Vehicle"/i.test(p.html) },
    ];
    const findings = checks.map(check => ({ field: check.label, missing: pages.filter(p => !check.test(p)).length, checked: pages.length }));
    const interaction = aiResult.status === "fulfilled" ? (aiResult.value.interaction || aiResult.value) : null;
    const blocks = interaction?.steps?.filter(step => step.type === "model_output").flatMap(step => step.content || []) || [];
    const answer = blocks.filter(block => block.type === "text").map(block => block.text || "").join("\n").trim();
    const citations = blocks.flatMap(block => block.annotations || []).filter(a => a.type === "url_citation" && /^https?:\/\//i.test(a.url || ""));
    const sources = [...new Map(citations.map(a => [a.url!, { url: a.url!, title: a.title || new URL(a.url!).hostname }])).values()].slice(0, 10);
    const dealerHost = new URL(first.url).hostname.replace(/^www\./, "");
    const mentionsDealer = new RegExp(dealerHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(answer) || sources.some(s => new URL(s.url).hostname.replace(/^www\./, "") === dealerHost);
    res.json({ website: first.url, location: `${city}, ${state}`, checkedAt: new Date().toISOString(), pages: pages.map(p => ({ url: p.url, title: p.title })), findings, ai: { question, model, answer: answer || null, sources, mentionsDealer: answer ? mentionsDealer : null, status: answer ? "answered" : "unavailable" }, note: "One dated Gemini search sample. It does not measure rankings or guarantee future AI answers. Missing means absent from the sampled page text, not necessarily absent from every source." });
  } catch (error) {
    res.status(422).json({ error: "report_unavailable", message: error instanceof Error ? error.message : "We could not scan that website." });
  } finally { quickReportsActive--; }
});

function money(text: string): number | null {
  const raw = text.match(/(?:\$|USD\s*)(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,6}(?:\.\d{2})?)/i)?.[1];
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function vin(text: string): string | null {
  return text.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/)?.[0] ?? null;
}

function mileage(text: string): number | null {
  const raw = text.match(/(?:mileage|odometer)\s*[:\-]?\s*([\d,]+)\s*(?:mi|miles)?/i)?.[1];
  return raw ? Number(raw.replace(/,/g, "")) : null;
}

function year(text: string): number | null {
  const y = Number(text.match(/\b(20[0-3]\d|19[89]\d)\b/)?.[1]);
  return Number.isFinite(y) && y > 0 ? y : null;
}

function rvType(text: string): string | null {
  const pairs: [RegExp, string][] = [
    [/travel trailer/i, "Travel Trailer"],
    [/fifth[- ]?wheel/i, "Fifth Wheel"],
    [/toy hauler/i, "Toy Hauler"],
    [/class a/i, "Class A Motorhome"],
    [/class b/i, "Class B Motorhome"],
    [/class c/i, "Class C Motorhome"],
    [/truck camper/i, "Truck Camper"],
    [/pop[- ]?up/i, "Pop-Up Camper"],
  ];
  return pairs.find(([re]) => re.test(text))?.[1] ?? null;
}

function schemaVehicleFromText(text: string, url: string, title = ""): Record<string, unknown> {
  const price = money(text);
  const miles = mileage(text);
  const unitVin = vin(text);
  const type = rvType(text);
  const modelYear = year(title || text);
  const vehicle: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: title || [modelYear, type].filter(Boolean).join(" ") || "RV listing",
    url,
  };
  if (unitVin) vehicle.vehicleIdentificationNumber = unitVin;
  if (modelYear) vehicle.vehicleModelDate = String(modelYear);
  if (type) vehicle.bodyType = type;
  if (miles !== null) {
    vehicle.mileageFromOdometer = {
      "@type": "QuantitativeValue",
      value: miles,
      unitCode: "SMI",
    };
  }
  if (price !== null) {
    vehicle.offers = {
      "@type": "Offer",
      price,
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url,
    };
  }
  return vehicle;
}

function validateVehicleSchema(vehicle: Record<string, unknown>): string[] {
  const issues: string[] = [];
  if (vehicle["@context"] !== "https://schema.org") issues.push("@context must be https://schema.org");
  if (vehicle["@type"] !== "Vehicle") issues.push("@type must be Vehicle");
  if (typeof vehicle.name !== "string" || !vehicle.name) issues.push("name is required");
  if (vehicle.offers && typeof vehicle.offers === "object") {
    const offer = vehicle.offers as Record<string, unknown>;
    if (offer["@type"] !== "Offer") issues.push("offers.@type must be Offer");
    if (offer.price !== undefined && typeof offer.price !== "number") issues.push("offers.price must be numeric");
  }
  return issues;
}

function parseCsv(csv: string): Record<string, unknown>[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1, 101).map((line, i) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row = Object.fromEntries(headers.map((h, idx) => [h, cells[idx] ?? ""]));
    const name = [row.year, row.make, row.model, row.trim].filter(Boolean).join(" ") || `RV ${i + 1}`;
    const price = Number(String(row.price ?? row.sale_price ?? "").replace(/[$,]/g, ""));
    const miles = Number(String(row.mileage ?? row.odometer ?? "").replace(/,/g, ""));
    const vehicle: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Vehicle",
      name,
    };
    const rowVin = row.vin || row.vehicleidentificationnumber;
    if (rowVin) vehicle.vehicleIdentificationNumber = rowVin;
    if (row.type || row.body_type || row.rv_type) vehicle.bodyType = row.type || row.body_type || row.rv_type;
    if (Number.isFinite(miles) && miles >= 0) {
      vehicle.mileageFromOdometer = { "@type": "QuantitativeValue", value: miles, unitCode: "SMI" };
    }
    if (Number.isFinite(price) && price > 0) {
      vehicle.offers = { "@type": "Offer", price, priceCurrency: "USD", availability: "https://schema.org/InStock" };
    }
    return vehicle;
  });
}

router.post("/dealer-tools/json-ld", async (req: Request, res: Response) => {
  const parsed = sourceSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_arguments", issues: parsed.error.issues.map((i) => i.message) });
  try {
    let vehicles: Record<string, unknown>[];
    let source = "csv";
    if (parsed.data.url) {
      const page = await fetchPage(parsed.data.url);
      vehicles = [schemaVehicleFromText(page.text, page.url, page.title)];
      source = page.url;
    } else {
      vehicles = parseCsv(parsed.data.csv ?? "");
    }
    if (!vehicles.length) return void res.status(422).json({ error: "no_vehicle_rows", detail: "No usable vehicle rows were found." });
    const validation = vehicles.map((vehicle, index) => ({ index, issues: validateVehicleSchema(vehicle) }));
    const valid = validation.every((v) => v.issues.length === 0);
    const payload = vehicles.length === 1 ? vehicles[0] : vehicles;
    res.json({
      valid,
      source,
      validation,
      jsonLd: payload,
      script: `<script type="application/ld+json">\n${JSON.stringify(payload, null, 2)}\n</script>`,
      note: "Only fields observed in the supplied page/CSV are emitted. Missing specs are omitted rather than guessed.",
    });
  } catch (err) {
    res.status(422).json({ error: "source_unavailable", detail: err instanceof Error ? err.message : "Unable to process source." });
  }
});

router.post("/dealer-tools/faqs", async (req: Request, res: Response) => {
  const parsed = faqSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_arguments", issues: parsed.error.issues.map((i) => i.message) });
  try {
    const page = await fetchPage(parsed.data.url);
    const domain = new URL(page.url).hostname.replace(/^www\./, "");
    const dealer = page.title.split(/[|\-–—]/)[0]?.trim() || domain;
    const inferredType = rvType(page.text);
    const focus = parsed.data.inventoryFocus || inferredType || "RVs";
    const price = money(page.text);
    const entries = [
      {
        question: `What ${focus.toLowerCase()} does ${dealer} have near ${parsed.data.location}?`,
        answer: `${dealer} publishes current ${focus.toLowerCase()} inventory on its website. Availability changes, so shoppers should confirm the exact unit and price on the listing before visiting.`,
      },
      {
        question: `Can I find ${focus.toLowerCase()} by budget near ${parsed.data.location}?`,
        answer: price
          ? `Yes. Published inventory currently includes pricing signals around ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price)} on the scanned page. Add explicit prices to each unit page so AI assistants can filter reliably.`
          : `Yes, if each unit page publishes a numeric price. The scanned page did not expose a reliable price signal, so adding machine-readable offers should be a priority.`,
      },
      {
        question: `What should I verify before towing an RV from ${dealer}?`,
        answer: "Verify the trailer GVWR against the tow vehicle's exact tow rating and verify payload against loaded tongue or pin weight, passengers, cargo, and hitch equipment. Do not rely on dry weight alone.",
      },
      {
        question: `What should Pacific Northwest buyers inspect on a used RV?`,
        answer: "Check roof and window seals, soft spots, delamination, slide seals, plumbing, underbelly, and signs of moisture or mold. Ask for winterization history and verify appliances and water systems before purchase.",
      },
    ];
    res.json({ dealer, location: parsed.data.location, inventoryFocus: focus, entries, source: page.url });
  } catch (err) {
    res.status(422).json({ error: "source_unavailable", detail: err instanceof Error ? err.message : "Unable to process source." });
  }
});

router.post("/dealer-tools/content-check", async (req: Request, res: Response) => {
  const parsed = contentCheckSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_arguments", issues: parsed.error.issues.map((i) => i.message) });
  try {
    const first = await fetchPage(parsed.data.url);
    const maxPages = parsed.data.maxPages ?? 5;
    const targets = [first.url, ...first.links.filter((u) => u !== first.url)].slice(0, maxPages);
    const pages: PageSnapshot[] = [first];
    for (const target of targets.slice(1)) {
      try { pages.push(await fetchPage(target)); } catch { /* keep partial crawl */ }
    }

    const findings: { finding: string; impact: Impact; effort: Effort; count: number; evidence: string }[] = [];
    const add = (finding: string, impact: Impact, effort: Effort, matches: PageSnapshot[], evidence: string) => {
      if (matches.length) findings.push({ finding, impact, effort, count: matches.length, evidence });
    };

    add("Pages appear dependent on JavaScript for core inventory text", "high", "medium",
      pages.filter((p) => (p.html.match(/<script\b/gi)?.length ?? 0) > 12 && p.text.length < 1200),
      "High script count with little server-rendered text can leave crawlers with an empty-looking page.");
    add("Numeric price is missing", "high", "low",
      pages.filter((p) => money(p.text) === null),
      "AI cannot confidently answer budget questions without a published numeric price.");
    add("RV type is not explicit", "high", "low",
      pages.filter((p) => !rvType(p.text)),
      "Publish type labels such as Travel Trailer, Fifth Wheel, Toy Hauler, Class A/B/C, Truck Camper, or Pop-Up.");
    add("Length is not machine-readable in visible text", "medium", "low",
      pages.filter((p) => !/(length|overall length)\s*[:\-]?\s*\d{1,2}(?:\.\d)?\s*(?:ft|feet|')/i.test(p.text)),
      "Length is a common buyer constraint and should be explicit on every unit page.");
    add("Sleeping capacity is missing", "medium", "low",
      pages.filter((p) => !/(sleeps|sleeping capacity)\s*[:\-]?\s*\d{1,2}/i.test(p.text)),
      "Sleeping capacity is one of the most common family-shopping constraints.");
    add("\"Call for price\" appears without a reliable numeric offer", "high", "low",
      pages.filter((p) => /call for price|contact for price/i.test(p.text) && money(p.text) === null),
      "A machine-readable Offer with price lets AI assistants compare the unit instead of skipping it.");
    add("No Vehicle JSON-LD detected", "high", "medium",
      pages.filter((p) => !/\"@type\"\s*:\s*\"Vehicle\"/i.test(p.html)),
      "schema.org/Vehicle gives crawlers a stable vehicle identity and offer/spec fields.");

    const counts = {
      pagesScanned: pages.length,
      highImpact: findings.filter((f) => f.impact === "high").reduce((n, f) => n + f.count, 0),
      mediumImpact: findings.filter((f) => f.impact === "medium").reduce((n, f) => n + f.count, 0),
      findings: findings.reduce((n, f) => n + f.count, 0),
    };
    res.json({
      source: first.url,
      counts,
      score: Math.max(0, 100 - counts.highImpact * 12 - counts.mediumImpact * 6),
      findings,
      pages: pages.map((p) => ({ url: p.url, title: p.title, textChars: p.text.length })),
      rule: "The score summarizes the findings; the counts and evidence are the actual diagnostic.",
    });
  } catch (err) {
    res.status(422).json({ error: "source_unavailable", detail: err instanceof Error ? err.message : "Unable to crawl source." });
  }
});

export default router;
