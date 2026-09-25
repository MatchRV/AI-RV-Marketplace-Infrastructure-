import { useState } from "react";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";

const BASE = import.meta.env.BASE_URL || "/";

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}api/dealer-tools/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || data.error || "Request failed");
  return data as T;
}

export function DealerAeoToolkit() {
  const [url, setUrl] = useState("");
  const [csv, setCsv] = useState("");
  const [location, setLocation] = useState("Tacoma, WA");
  const [jsonLd, setJsonLd] = useState("");
  const [jsonValid, setJsonValid] = useState<boolean | null>(null);
  const [faq, setFaq] = useState<any[]>([]);
  const [check, setCheck] = useState<any>(null);
  const [status, setStatus] = useState("");

  async function generateJsonLd() {
    setStatus("Reading inventory source…");
    try {
      const data = await post<any>("json-ld", { url: url || undefined, csv: csv || undefined });
      setJsonLd(data.script);
      setJsonValid(data.valid);
      setStatus(data.note);
    } catch (e) { setStatus(e instanceof Error ? e.message : "Unable to generate schema."); }
  }

  async function generateFaq() {
    if (!url) return setStatus("Paste a dealer inventory URL first.");
    setStatus("Reading the dealer page…");
    try {
      const data = await post<any>("faqs", { url, location });
      setFaq(data.entries);
      setStatus(`Generated for ${data.dealer} using ${data.source}`);
    } catch (e) { setStatus(e instanceof Error ? e.message : "Unable to generate FAQs."); }
  }

  async function runCheck() {
    if (!url) return setStatus("Paste a dealer inventory URL first.");
    setStatus("Checking up to five inventory pages…");
    try {
      const data = await post<any>("content-check", { url, maxPages: 5 });
      setCheck(data);
      setStatus(data.rule);
    } catch (e) { setStatus(e instanceof Error ? e.message : "Unable to run content check."); }
  }

  async function readCsv(file: File | null) {
    if (!file) return;
    setCsv(await file.text());
    setStatus(`${file.name} loaded. Generate JSON-LD when ready.`);
  }

  return (
    <Layout>
      <SEO title="Dealer AI Visibility Tools — MatchRV" description="Generate machine-readable RV inventory markup, local-intent FAQs, and find inventory-page issues that keep AI assistants from citing your dealership." canonical="/dealer-tools" />
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <section className="rounded-3xl bg-[#0B1117] p-7 text-white sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#65E7DF]">Dealer AEO / GEO Toolkit</p>
          <h1 className="mt-3 font-display text-4xl font-black">Can AI actually read your inventory?</h1>
          <p className="mt-4 max-w-2xl text-white/75">Paste a rooftop inventory URL once. MatchRV turns the same source into structured data, local buyer FAQs, and a plain-English content-quality check.</p>
        </section>

        <section className="mt-7 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <label className="text-sm font-black">Dealer inventory page URL</label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input className="min-h-12 flex-1 rounded-xl border px-4" placeholder="https://dealer.com/inventory" value={url} onChange={(e) => setUrl(e.target.value)} />
            <input aria-label="Upload VIN CSV" type="file" accept=".csv,text/csv" onChange={(e) => void readCsv(e.target.files?.[0] ?? null)} className="rounded-xl border p-2 text-sm" />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <label className="text-sm font-bold">Local market</label>
            <input className="rounded-lg border px-3 py-2 text-sm" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          {status && <p className="mt-3 text-sm text-muted-foreground">{status}</p>}
        </section>

        <div className="mt-7 grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-black uppercase tracking-wider text-primary">1 · Structured data</p>
            <h2 className="mt-2 font-display text-xl font-black">Generate Vehicle JSON-LD</h2>
            <p className="mt-2 text-sm text-muted-foreground">Uses only fields found in the page or CSV. Missing values are omitted, never guessed.</p>
            <button onClick={() => void generateJsonLd()} className="mt-4 w-full rounded-xl bg-[#0B1117] px-4 py-3 font-bold text-white">Generate markup</button>
            {jsonValid !== null && <p className={`mt-3 text-sm font-bold ${jsonValid ? "text-emerald-700" : "text-red-700"}`}>{jsonValid ? "Schema shape validated" : "Validation issues found"}</p>}
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-black uppercase tracking-wider text-primary">2 · Local intent</p>
            <h2 className="mt-2 font-display text-xl font-black">Generate buyer FAQs</h2>
            <p className="mt-2 text-sm text-muted-foreground">Location-aware copy grounded in the scanned dealer page and RV-specific buying questions.</p>
            <button onClick={() => void generateFaq()} className="mt-4 w-full rounded-xl bg-[#0B1117] px-4 py-3 font-bold text-white">Generate FAQs</button>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <p className="text-xs font-black uppercase tracking-wider text-primary">3 · Content quality</p>
            <h2 className="mt-2 font-display text-xl font-black">Find why AI skips you</h2>
            <p className="mt-2 text-sm text-muted-foreground">Checks rendering, price, type, length, sleeps, call-for-price behavior, and Vehicle structured data.</p>
            <button onClick={() => void runCheck()} className="mt-4 w-full rounded-xl bg-[#0B1117] px-4 py-3 font-bold text-white">Run content check</button>
          </section>
        </div>

        {jsonLd && (
          <section className="mt-7 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-black">Copy-paste-ready schema.org/Vehicle</h2><button onClick={() => void navigator.clipboard.writeText(jsonLd)} className="rounded-lg border px-3 py-2 text-sm font-bold">Copy</button></div>
            <pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-[#0B1117] p-4 text-xs text-white">{jsonLd}</pre>
          </section>
        )}

        {faq.length > 0 && (
          <section className="mt-7 rounded-2xl border border-border bg-card p-5">
            <h2 className="font-display text-xl font-black">Local-intent FAQ copy</h2>
            <div className="mt-4 space-y-4">{faq.map((item, i) => <div key={i} className="rounded-xl bg-muted/50 p-4"><h3 className="font-bold">{item.question}</h3><p className="mt-2 text-sm text-muted-foreground">{item.answer}</p></div>)}</div>
          </section>
        )}

        {check && (
          <section className="mt-7 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><h2 className="font-display text-xl font-black">Content quality findings</h2><p className="text-sm text-muted-foreground">{check.counts.pagesScanned} pages scanned · {check.counts.findings} finding instances</p></div>
              <div className="text-left sm:text-right"><p className="text-xs font-bold uppercase text-muted-foreground">Summary score</p><p className="text-3xl font-black">{check.score}/100</p><p className="text-xs text-muted-foreground">Counts are the real findings.</p></div>
            </div>
            <div className="mt-5 space-y-3">
              {check.findings.map((f: any, i: number) => <div key={i} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto_auto]">
                <div><p className="font-bold">{f.finding}</p><p className="mt-1 text-sm text-muted-foreground">{f.evidence}</p><p className="mt-1 text-xs text-muted-foreground">{f.count} page(s)</p></div>
                <span className={`h-fit rounded-full px-3 py-1 text-xs font-black uppercase ${f.impact === "high" ? "bg-red-100 text-red-800" : f.impact === "medium" ? "bg-amber-100 text-amber-800" : "bg-slate-100"}`}>{f.impact} impact</span>
                <span className="h-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase">{f.effort} effort</span>
              </div>)}
            </div>
          </section>
        )}
      </main>
    </Layout>
  );
}
