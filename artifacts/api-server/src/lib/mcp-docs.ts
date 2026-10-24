// Public, server-rendered MCP documentation page (/mcp-docs).
// Static HTML, no JavaScript, so crawlers and connector reviewers (Meta Muse,
// OpenAI) get real content instead of the SPA shell. Tool names, titles,
// descriptions and input schemas are read from the live MCP registry so the
// page can never drift from what /mcp actually serves; the curated text below
// adds purpose, outputs, read/write class and consent notes per tool.
import { matchRvMcpHandler, MCP_VERSION } from "../mcp";

export type ToolClass = "Read" | "Write" | "Sensitive write";
interface ToolDoc { purpose: string; outputs: string; cls: ToolClass; classNote: string }

export const MCP_TOOL_DOCS: Record<string, ToolDoc> = {
  outfitter_discovery: {
    purpose: "Runs MatchRV's guided RV-fit interview. Returns the one next question to ask (with a short reason for asking) and, once enough fit facts are known, the search constraints for search_rvs.",
    outputs: "status (needs_discovery, ready_for_products, or answer_directly for general questions); nextQuestion (exactly one, with its step and reason; the trade question includes a followUp); knownSummary (what is already known, so nothing is asked twice); searchConstraints when readyForProducts is true.",
    cls: "Read", classNote: "Read-only and stateless. Takes RV-fit facts only; stores nothing and contacts no one.",
  },
  outfitter_guide: {
    purpose: "Answers general RV questions (for example \"motorhome or fifth wheel?\", how-to, costs) from MatchRV's buyer guides, with no interview first.",
    outputs: "Guide content for the topic: explanation, considerations and tradeoffs.",
    cls: "Read", classNote: "Read-only reference content.",
  },
  search_rvs: {
    purpose: "Searches US MatchRV dealer inventory and returns a short, explained shortlist that fits the shopper's RV-fit facts (type, make/model, use, features, party size, tow vehicle, length limit, area and budget).",
    outputs: "Until the interview is complete: status=needs_discovery, results=[] and one nextQuestion. When ready (or when the shopper explicitly asks to skip): a shortlist of 3 best fits by default (different model lines; up to 10 only if asked), each with unit_id, title, price, dealer and distance, fit checks, plus points, explicit unknowns and a preliminary tow-fit note.",
    cls: "Read", classNote: "Read-only. Stores nothing and contacts no one.",
  },
  get_rv: {
    purpose: "Returns the full MatchRV record for one unit from search_rvs.",
    outputs: "Dealer, specs, price, features, source and freshness, and explicit unknowns. Motorhomes include a powertrain and towing section with the status of each value.",
    cls: "Read", classNote: "Read-only.",
  },
  compare_rvs: {
    purpose: "Compares 2 to 4 units side by side against the shopper's constraints.",
    outputs: "A deterministic comparison with each value's evidence; unknown values stay explicitly unknown.",
    cls: "Read", classNote: "Read-only.",
  },
  evaluate_tow_fit: {
    purpose: "Screens weight fit between a shopper-stated tow vehicle and 1 to 6 RVs, or whether motorhomes can tow a loaded trailer.",
    outputs: "Per-unit fit against each limit (GVWR, tow rating, GCWR, tongue and axle loads where known), with what is still unconfirmed. Screening guidance only, never a towing-safety guarantee.",
    cls: "Read", classNote: "Read-only.",
  },
  teach_outfitter: {
    purpose: "Remembers a fact the shopper confirmed, for that shopper only: their vehicle's exact tow rating or door-sticker payload, or a confirmed spec for one unit.",
    outputs: "Confirmation of what was remembered, and a session_key when the host does not identify the conversation.",
    cls: "Write", classNote: "Writes shopper-scoped memory (vehicle ratings and unit specs only, never personal details). Never shown to other shoppers; expires after 30 days of inactivity.",
  },
  outfitter_memory: {
    purpose: "Reads what MatchRV remembers for this shopper (facts taught with teach_outfitter) plus MatchRV-curated reference facts.",
    outputs: "Remembered facts with confirmation counts and sources.",
    cls: "Read", classNote: "Read-only.",
  },
  prepare_dealer_inquiry: {
    purpose: "Step 1 of contacting a dealership about one RV, used only when the shopper asks to contact the dealer. Validates the shopper-provided name, email and/or phone and message.",
    outputs: "The exact preview (dealership, RV title, VIN, stock number, price, the shopper's contact details, the message and how it will be delivered) and a confirmation_token valid for 30 minutes.",
    cls: "Read", classNote: "Sends nothing. The preview must be shown to the shopper for approval.",
  },
  send_dealer_inquiry: {
    purpose: "Step 2: sends the inquiry the shopper approved in the preview. The content is locked to the preview and cannot be changed here.",
    outputs: "inquiry_id, a private status_token and an honest status: delivered, queued_for_matchrv or failed.",
    cls: "Sensitive write", classNote: "Shares the shopper's name, contact details and message with a dealership. Requires the shopper's explicit approval of the exact preview (confirmed=true). Never retried automatically.",
  },
  get_dealer_inquiry_status: {
    purpose: "Checks the status of an inquiry this shopper sent.",
    outputs: "delivered, queued_for_matchrv, failed or dry_run, plus the dealership's reply only if MatchRV has recorded one.",
    cls: "Read", classNote: "Read-only. Requires the inquiry_id and private status_token; other shoppers' inquiries are never visible.",
  },
};

/** Order tools are presented in: shopping flow first, then memory, then dealer contact. */
export const MCP_DOCS_ORDER = ["outfitter_discovery", "outfitter_guide", "search_rvs", "get_rv", "compare_rvs", "evaluate_tow_fit", "teach_outfitter", "outfitter_memory", "prepare_dealer_inquiry", "send_dealer_inquiry", "get_dealer_inquiry_status"];

interface LiveTool { name: string; title?: string; description: string; inputSchema?: { properties?: Record<string, any>; required?: string[] }; annotations?: Record<string, boolean> }

async function listLiveTools(): Promise<LiveTool[]> {
  const res = await matchRvMcpHandler.fetch(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  }));
  const raw = await res.text();
  const line = raw.split("\n").find((l) => l.startsWith("data:"));
  const msg = JSON.parse(line ? line.slice(5) : raw);
  if (msg.error) throw new Error(`tools/list failed: ${JSON.stringify(msg.error)}`);
  return msg.result.tools as LiveTool[];
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function typeOf(p: any): string {
  if (!p) return "";
  if (p.enum) return `one of: ${p.enum.join(", ")}`;
  if (p.type === "array") {
    const it = p.items ?? {};
    return it.enum ? `list of: ${it.enum.join(", ")}` : `list of ${it.type ?? "values"}`;
  }
  if (p.anyOf) return p.anyOf.map(typeOf).filter(Boolean).join(" or ");
  return p.type ?? "object";
}

function inputsTable(t: LiveTool): string {
  const props = t.inputSchema?.properties ?? {};
  const req = new Set(t.inputSchema?.required ?? []);
  const names = Object.keys(props);
  if (!names.length) return "<p>No inputs.</p>";
  const rows = names.map((n) => `<tr><td><code>${esc(n)}</code>${req.has(n) ? ' <span class="req">required</span>' : ""}</td><td>${esc(typeOf(props[n]))}</td><td>${esc(props[n]?.description ?? "")}</td></tr>`).join("");
  const table = `<table><thead><tr><th>Input</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
  const summary = req.size ? `${names.length} inputs (${req.size} required)` : `${names.length} inputs, all optional`;
  return names.length > 8 ? `<details><summary>${esc(summary)}</summary>${table}</details>` : `<p class="muted">${esc(summary)}</p>${table}`;
}

function annotationText(a: Record<string, boolean> | undefined): string {
  if (!a) return "";
  const k = (x: string) => (a[x] ? "true" : "false");
  return `readOnlyHint=${k("readOnlyHint")}, destructiveHint=${k("destructiveHint")}, idempotentHint=${k("idempotentHint")}, openWorldHint=${k("openWorldHint")}`;
}

const CSS = `
:root{--slate:#465267;--teal:#2f9fb0;--ink:#1f2633;--muted:#5b6575;--line:#e3e7ee;--bg:#f7f9fb}
*{box-sizing:border-box}body{margin:0;font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
header{background:var(--slate);color:#fff}header .wrap{display:flex;align-items:center;gap:20px;padding:14px 24px}
header .logo{display:block;position:relative;width:190px;height:58px;overflow:hidden}header .logo img{position:absolute;width:236px;height:auto;left:-22px;top:-60px;max-width:none}header nav{margin-left:auto;font-size:15px}header nav a{color:#dff4f7;margin-left:16px;text-decoration:none}
.wrap{max-width:960px;margin:0 auto;padding:0 24px}main{padding:32px 0 48px}
h1{font-size:2rem;line-height:1.2;margin:0 0 8px}h2{font-size:1.45rem;margin:40px 0 12px;padding-top:8px;border-top:1px solid var(--line)}
h3{font-size:1.2rem;margin:0}a{color:var(--teal)}code{font:0.88em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:#eef2f6;padding:1px 5px;border-radius:4px}
.lead{font-size:1.1rem;color:var(--muted);margin:0 0 20px}.muted{color:var(--muted);font-size:.92rem}
.card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:20px 22px;margin:16px 0}
.endpoint{font-size:1.05rem}.endpoint code{font-size:1rem}
.cls{display:inline-block;white-space:nowrap;font-size:.8rem;font-weight:600;padding:2px 10px;border-radius:999px;margin-left:8px;vertical-align:middle}
.cls-read{background:#e3f4ea;color:#1d6b3c}.cls-write{background:#fff3d6;color:#7a5200}.cls-sensitive{background:#fde4e1;color:#9b2416}
.tool-head{display:flex;align-items:center;flex-wrap:wrap;gap:4px}.tool-title{color:var(--muted);font-size:.95rem;margin:2px 0 10px}
dl{margin:8px 0}dt{font-weight:600;margin-top:10px}dd{margin:2px 0 0}
table{width:100%;border-collapse:collapse;font-size:.88rem;margin:8px 0}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:6px 8px}th{background:#f1f4f8}
.req{color:#9b2416;font-size:.75rem;font-weight:600}details summary{cursor:pointer;color:var(--teal);font-weight:600;margin:6px 0}
.summary-table td:first-child{white-space:nowrap}
footer{border-top:1px solid var(--line);padding:24px 0;color:var(--muted);font-size:.92rem}footer a{margin-right:14px}
@media(max-width:640px){header nav{display:none}}
`;

const clsBadge = (c: ToolClass) => `<span class="cls ${c === "Read" ? "cls-read" : c === "Write" ? "cls-write" : "cls-sensitive"}">${esc(c)}</span>`;

export function renderMcpDocs(tools: LiveTool[]): string {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const ordered = [...MCP_DOCS_ORDER.filter((n) => byName.has(n)), ...tools.map((t) => t.name).filter((n) => !MCP_DOCS_ORDER.includes(n))].map((n) => byName.get(n)!);
  const summaryRows = ordered.map((t) => {
    const d = MCP_TOOL_DOCS[t.name];
    return `<tr><td><a href="#${esc(t.name)}"><code>${esc(t.name)}</code></a></td><td>${d ? clsBadge(d.cls) : ""}</td><td>${esc(d?.purpose ?? t.title ?? "")}</td></tr>`;
  }).join("");
  const toolSections = ordered.map((t) => {
    const d = MCP_TOOL_DOCS[t.name];
    return `<section class="card" id="${esc(t.name)}">
<div class="tool-head"><h3><code>${esc(t.name)}</code></h3>${d ? clsBadge(d.cls) : ""}</div>
${t.title ? `<p class="tool-title">${esc(t.title)}</p>` : ""}
<dl>
${d ? `<dt>Purpose</dt><dd>${esc(d.purpose)}</dd>` : ""}
<dt>Tool description (as served)</dt><dd>${esc(t.description)}</dd>
${d ? `<dt>Outputs</dt><dd>${esc(d.outputs)}</dd>` : ""}
${d ? `<dt>Read/write class</dt><dd>${esc(d.cls)}. ${esc(d.classNote)}</dd>` : ""}
<dt>MCP annotations</dt><dd><code>${esc(annotationText(t.annotations))}</code></dd>
<dt>Inputs</dt><dd>${inputsTable(t)}</dd>
</dl>
</section>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MatchRV MCP server documentation</title>
<meta name="description" content="Documentation for the MatchRV MCP server at https://matchrv.com/mcp: endpoint, tools, inputs, outputs, read/write classes, dealer-inquiry consent and data handling.">
<link rel="canonical" href="https://matchrv.com/mcp-docs">
<link rel="icon" href="/favicon.ico">
<meta property="og:title" content="MatchRV MCP server documentation">
<meta property="og:url" content="https://matchrv.com/mcp-docs">
<style>${CSS}</style>
</head>
<body>
<header><div class="wrap"><a class="logo" href="/" aria-label="MatchRV home"><img src="/matchrv-logo.png" alt="MatchRV" width="236" height="176"></a><nav><a href="#endpoint">Endpoint</a><a href="#tools">Tools</a><a href="#consent">Consent</a><a href="#data">Data handling</a></nav></div></header>
<main class="wrap">
<h1>MatchRV MCP server</h1>
<p class="lead">MatchRV helps AI assistants find RVs that actually fit a shopper: it asks a short RV-fit interview, searches US dealer inventory, explains a shortlist of real units, checks tow fit, and, only with the shopper's explicit approval, sends an inquiry to the dealership.</p>

<h2 id="overview">Overview</h2>
<ul>
<li><strong>What it does:</strong> guided RV-fit interview (one question at a time, each with its reason), inventory search with a 3-unit shortlist, unit details, side-by-side comparison, tow-fit screening, RV buyer guides, and approval-gated dealer inquiries.</li>
<li><strong>Coverage:</strong> US dealer inventory from a periodically refreshed snapshot. Price and availability should be confirmed with the dealer.</li>
<li><strong>Server version:</strong> ${esc(MCP_VERSION)}, ${ordered.length} tools.</li>
</ul>

<h2 id="endpoint">Endpoint and connection</h2>
<div class="card endpoint">
<p><strong>URL:</strong> <code>https://matchrv.com/mcp</code></p>
<p><strong>Transport:</strong> Streamable HTTP (MCP protocol 2025-06-18).</p>
<p><strong>Authentication:</strong> none. No account or API key is needed; add the URL as a connector.</p>
<p><strong>Errors:</strong> invalid input returns a JSON-RPC error. <code>search_rvs</code> returns <code>status=needs_discovery</code> with <code>results=[]</code> until the RV-fit interview is complete, or until the shopper explicitly asks to skip it.</p>
</div>

<h2 id="tools">Tools</h2>
<table class="summary-table"><thead><tr><th>Tool</th><th>Class</th><th>Purpose</th></tr></thead><tbody>${summaryRows}</tbody></table>
<p class="muted"><strong>Read</strong>: returns information only. <strong>Write</strong>: saves shopper-scoped memory inside MatchRV. <strong>Sensitive write</strong>: shares data outside MatchRV and requires the shopper's explicit approval.</p>
${toolSections}

<h2 id="consent">Dealer inquiries and consent</h2>
<div class="card">
<ol>
<li>Dealer contact happens only when the shopper asks to contact a dealership about a specific RV.</li>
<li><code>prepare_dealer_inquiry</code> validates the shopper-provided details and returns the exact preview: dealership, RV, the shopper's name and contact details, the message, and how it will be delivered. <strong>Nothing is sent.</strong></li>
<li>The assistant shows the whole preview and asks the shopper to approve it.</li>
<li><code>send_dealer_inquiry</code> is a <strong>sensitive write</strong>. It is called only after explicit approval, with <code>confirmed=true</code> and the preview's confirmation token (valid 30 minutes). The content is locked to the approved preview.</li>
<li>It reports an honest status (delivered, queued_for_matchrv or failed), is never retried automatically, and never claims the dealer has replied. <code>get_dealer_inquiry_status</code> checks status with a private token.</li>
</ol>
</div>

<h2 id="data">Data handling</h2>
<div class="card">
<ul>
<li><strong>Discovery and search take RV-fit facts only:</strong> RV type, make/model, use category, desired features, party size, tow vehicle, length limit, shopping area and radius, and budget with payment method. They never ask for names, contact details, income or credit, store nothing, and contact no one.</li>
<li><strong>Rapport answers stay in the conversation.</strong> Conversation-only questions (time off, who's buying, a trade-in, planned trips) are tracked by step name only; their answers are never sent to MatchRV.</li>
<li>Every question is optional; the shopper may decline any of them.</li>
<li><strong>Memory:</strong> <code>teach_outfitter</code> stores only facts the shopper confirmed (vehicle tow rating or payload, unit specs), scoped to that shopper, never shown to others, and expiring after 30 days of inactivity.</li>
<li><strong>Contact details</strong> are used only in the dealer-inquiry flow, as the shopper provides them, and are shared with a dealership only after the shopper approves the exact preview.</li>
<li>Full policy: <a href="/privacy">matchrv.com/privacy</a>.</li>
</ul>
</div>

<h2 id="support">Support and policies</h2>
<p><a href="/privacy">Privacy policy</a> · <a href="/terms">Terms of service</a> · <a href="/contact">Contact</a> · <a href="mailto:jonathan@matchrv.com">jonathan@matchrv.com</a></p>
</main>
<footer><div class="wrap"><a href="/">MatchRV</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/contact">Contact</a><a href="/mcp-setup">Connect MatchRV</a></div></footer>
</body>
</html>`;
}

let cached: Promise<string> | null = null;
/** Built once from the live registry, then served from memory. */
export function getMcpDocsHtml(): Promise<string> {
  cached ??= listLiveTools().then(renderMcpDocs).catch((err) => { cached = null; throw err; });
  return cached;
}
