import { useMemo, useState } from "react";
import type { Constraints, UnitMatch } from "@workspace/agent-core";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { agentApi, type SearchResponse } from "@/agent/api";

function parseQuestion(question: string): Constraints {
  const q = question.trim();
  const out: Constraints = {};
  const money = q.match(/(?:under|below|max(?:imum)?|up to)\s*\$?([\d,]+)\s*k?/i);
  if (money) {
    const raw = Number(money[1].replace(/,/g, ""));
    out.priceMaxUsd = /k\b/i.test(money[0]) && raw < 1000 ? raw * 1000 : raw;
  }
  const near = q.match(/(?:near|around|within\s+\d+\s+miles?\s+of)\s+([A-Za-z .'-]+?)(?=\s+(?:that|my|with|under|below|for|and)\b|$)/i);
  if (near) out.location = { place: near[1].trim(), radiusMiles: 150 };
  const radius = q.match(/within\s+(\d{1,4})\s+miles?/i);
  if (radius && out.location) out.location.radiusMiles = Number(radius[1]);
  const sleeps = q.match(/sleeps?\s+(?:at least\s+)?(\d{1,2})/i);
  if (sleeps) out.sleepsMin = Number(sleeps[1]);
  const length = q.match(/(?:under|max(?:imum)?|up to)\s+(\d{1,2}(?:\.\d)?)\s*(?:ft|feet|')/i);
  if (length) out.lengthMaxFt = Number(length[1]);

  if (/bunkhouse|bunk beds?/i.test(q)) out.mustHave = ["bunkhouse"];
  if (/toy hauler/i.test(q)) out.rvTypes = ["toy_hauler"];
  else if (/fifth[- ]?wheel/i.test(q)) out.rvTypes = ["fifth_wheel"];
  else if (/travel trailer/i.test(q)) out.rvTypes = ["travel_trailer"];
  else if (/class\s*a\b/i.test(q)) out.rvTypes = ["class_a"];
  else if (/class\s*b\b/i.test(q)) out.rvTypes = ["class_b"];
  else if (/class\s*c\b/i.test(q)) out.rvTypes = ["class_c"];
  else if (/truck camper/i.test(q)) out.rvTypes = ["truck_camper"];
  else if (/pop[- ]?up/i.test(q)) out.rvTypes = ["popup_camper"];

  const tow = q.match(/(?:my|a|an)\s+((?:\d{4}\s+)?(?:ford\s+)?f[- ]?150|(?:\d{4}\s+)?(?:ford\s+)?f[- ]?250|(?:\d{4}\s+)?(?:toyota\s+)?tundra|(?:\d{4}\s+)?(?:chevy|chevrolet)\s+(?:silverado\s+)?(?:1500|2500|3500)|(?:\d{4}\s+)?ram\s+(?:1500|2500|3500))/i);
  if (tow) out.towVehicle = tow[1];

  out.sort = "best_match";
  return out;
}

function money(value: number | null | undefined): string {
  return value == null ? "Unverified" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function PaymentEstimator({ price }: { price: number | null }) {
  const [down, setDown] = useState("3000");
  const [apr, setApr] = useState("8.49");
  const [months, setMonths] = useState("180");
  const monthly = useMemo(() => {
    if (!price) return null;
    const p = Math.max(0, price - Number(down || 0));
    const n = Math.max(1, Number(months || 1));
    const r = Number(apr || 0) / 1200;
    return r > 0 ? (p * r) / (1 - Math.pow(1 + r, -n)) : p / n;
  }, [price, down, apr, months]);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-bold">Monthly payment estimator</h3>
      <p className="mt-1 text-sm text-muted-foreground">Estimate only. Taxes, fees, lender terms, insurance, and credit profile are not included.</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <label className="text-xs font-semibold">Down<input className="mt-1 w-full rounded-lg border p-2 text-sm" value={down} onChange={(e) => setDown(e.target.value)} /></label>
        <label className="text-xs font-semibold">APR %<input className="mt-1 w-full rounded-lg border p-2 text-sm" value={apr} onChange={(e) => setApr(e.target.value)} /></label>
        <label className="text-xs font-semibold">Months<input className="mt-1 w-full rounded-lg border p-2 text-sm" value={months} onChange={(e) => setMonths(e.target.value)} /></label>
      </div>
      <p className="mt-4 text-2xl font-black">{monthly == null ? "—" : `~$${monthly.toFixed(0)}/mo`}</p>
    </div>
  );
}

function TradeEstimator() {
  const [retail, setRetail] = useState("50000");
  const [condition, setCondition] = useState("good");
  const factor = condition === "excellent" ? 0.78 : condition === "fair" ? 0.58 : 0.68;
  const estimate = Number(retail || 0) * factor;
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-display text-lg font-bold">Trade-in planning estimate</h3>
      <p className="mt-1 text-sm text-muted-foreground">Planning range only, not an appraisal. Enter a realistic current retail value for your RV.</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold">Estimated retail<input className="mt-1 w-full rounded-lg border p-2 text-sm" value={retail} onChange={(e) => setRetail(e.target.value)} /></label>
        <label className="text-xs font-semibold">Condition<select className="mt-1 w-full rounded-lg border p-2 text-sm" value={condition} onChange={(e) => setCondition(e.target.value)}><option value="excellent">Excellent</option><option value="good">Good</option><option value="fair">Fair</option></select></label>
      </div>
      <p className="mt-4 text-2xl font-black">{Number.isFinite(estimate) ? `~$${Math.round(estimate).toLocaleString()}` : "—"}</p>
    </div>
  );
}

export function AnswerEngine() {
  const [question, setQuestion] = useState("find me a bunkhouse under $40k near Tacoma that my F-150 can tow");
  const [data, setData] = useState<SearchResponse | null>(null);
  const [tow, setTow] = useState<Record<string, { verdict: string; detail: string; comparedWeightLbs: number | null; comparedWeightField: string | null }>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [comparison, setComparison] = useState<any>(null);
  const [status, setStatus] = useState("Ask a question in normal language.");
  const [loading, setLoading] = useState(false);

  const medianPrice = useMemo(() => {
    const values = (data?.results ?? []).map((r) => r.unit.priceUsd.value).filter((v): v is number => typeof v === "number").sort((a,b) => a-b);
    if (!values.length) return null;
    return values[Math.floor(values.length / 2)];
  }, [data]);

  const discounts = useMemo(() => (data?.results ?? [])
    .filter((r) => r.unit.msrpUsd.value != null && r.unit.priceUsd.value != null && r.unit.msrpUsd.value! > r.unit.priceUsd.value!)
    .sort((a,b) => (b.unit.msrpUsd.value! - b.unit.priceUsd.value!) - (a.unit.msrpUsd.value! - a.unit.priceUsd.value!))
    .slice(0,5), [data]);

  async function ask() {
    setLoading(true);
    setComparison(null);
    setSelected([]);
    const constraints = parseQuestion(question);
    setStatus("Searching live MatchRV-normalized inventory…");
    const res = await agentApi.search(constraints, 10);
    if (!res.ok) {
      setStatus(res.error.hint || res.error.guidance || res.error.error);
      setLoading(false);
      return;
    }
    setData(res.data);
    const nextTow: typeof tow = {};
    if (constraints.towVehicle && res.data.results.length) {
      const fit = await agentApi.towFit(constraints.towVehicle, res.data.results.slice(0,6).map((r) => r.unit.id));
      if (fit.ok) for (const f of fit.data.fits) nextTow[f.unitId] = f;
    }
    setTow(nextTow);
    setStatus(`${res.data.funnel.passedHard} verified matches; ${res.data.funnel.unverified} additional matches need one or more facts verified.`);
    setLoading(false);
  }

  async function compare() {
    if (selected.length < 2) return;
    const res = await agentApi.compare(selected.slice(0,4), data?.appliedConstraints ?? {});
    if (res.ok) setComparison(res.data);
  }

  return (
    <Layout>
      <SEO title="Ask MatchRV — Real RV Answers From Real Inventory" description="Ask an RV shopping question in plain language and get inventory-backed answers with tow-fit receipts and unknowns clearly labeled." canonical="/answers" />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <section className="rounded-3xl bg-[#0B1117] p-6 text-white sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#65E7DF]">MatchRV Answer Engine</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-black sm:text-5xl">What RV actually fits your life?</h1>
          <p className="mt-4 max-w-2xl text-white/75">Ask one question. MatchRV checks real inventory, shows what is verified, and keeps unknown specs unknown.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <input aria-label="RV question" className="min-h-14 flex-1 rounded-xl border border-white/20 bg-white px-4 text-[#0B1117]" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void ask()} />
            <button onClick={() => void ask()} disabled={loading} className="min-h-14 rounded-xl bg-[#65E7DF] px-6 font-black text-[#0B1117] disabled:opacity-60">{loading ? "Checking…" : "Answer this"}</button>
          </div>
          <p className="mt-3 text-sm text-white/70">{status}</p>
        </section>

        {data && (
          <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              {data.results.slice(0,10).map((match: UnitMatch) => {
                const u = match.unit;
                const fit = tow[u.id];
                const diff = medianPrice != null && u.priceUsd.value != null ? u.priceUsd.value - medianPrice : null;
                return (
                  <article key={u.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2 text-xs font-bold">
                          <span className={`rounded-full px-2.5 py-1 ${match.hardStatus === "pass" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{match.hardStatus === "pass" ? "Verified fit" : "Needs verification"}</span>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">{u.rvType.replaceAll("_"," ")}</span>
                        </div>
                        <h2 className="mt-3 font-display text-2xl font-black">{u.title}</h2>
                        <p className="mt-1 text-sm text-muted-foreground">{u.dealer.name} · {u.dealer.city}, {u.dealer.state}</p>
                      </div>
                      <div className="text-left sm:text-right"><p className="text-2xl font-black">{money(u.priceUsd.value)}</p><p className="text-xs text-muted-foreground">Asking price</p></div>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
                      <div className="rounded-xl bg-muted/50 p-3"><b>GVWR</b><br />{u.gvwrLbs.value ? `${u.gvwrLbs.value.toLocaleString()} lb` : "Unverified"}</div>
                      <div className="rounded-xl bg-muted/50 p-3"><b>Dry weight</b><br />{u.dryWeightLbs.value ? `${u.dryWeightLbs.value.toLocaleString()} lb` : "Unverified"}</div>
                      <div className="rounded-xl bg-muted/50 p-3"><b>Hitch / pin</b><br />{u.hitchWeightLbs.value ? `${u.hitchWeightLbs.value.toLocaleString()} lb` : "Unverified"}</div>
                      <div className="rounded-xl bg-muted/50 p-3"><b>Sleeps</b><br />{u.sleeps.value ?? "Unverified"}</div>
                    </div>

                    {fit && (
                      <div className="mt-4 rounded-xl border border-[#65E7DF]/40 bg-[#EFFFFD] p-4 text-sm">
                        <p className="font-black">Tow check: {fit.verdict.replaceAll("_"," ")}</p>
                        <p className="mt-1">{fit.detail}</p>
                        <p className="mt-2 text-xs text-muted-foreground">Payload check: loaded tongue/pin weight + hitch + passengers + cargo must stay under the truck's door-sticker payload. Model name alone cannot verify exact payload.</p>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                      <a className="font-bold text-primary underline" href={`/listing/${encodeURIComponent(u.id)}`}>MatchRV listing</a>
                      {u.dealer.website ? <a className="font-bold text-primary underline" href={u.dealer.website} target="_blank" rel="noreferrer">Dealer website</a> : <span className="text-muted-foreground">Dealer URL unverified</span>}
                      <span className="text-muted-foreground">Source listing URL: not published in current canonical feed</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={selected.includes(u.id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s,u.id].slice(-4) : s.filter((id) => id !== u.id))} /> Compare</label>
                      {diff != null && <span className="text-xs text-muted-foreground">vs. median of these live results: {diff === 0 ? "at median" : `${money(Math.abs(diff))} ${diff < 0 ? "below" : "above"}`}</span>}
                    </div>
                  </article>
                );
              })}
              {selected.length >= 2 && <button onClick={() => void compare()} className="rounded-xl bg-[#0B1117] px-5 py-3 font-bold text-white">Compare {selected.length} selected RVs</button>}
              {comparison && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="font-display text-xl font-black">Side-by-side comparison</h2>
                  <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-4 text-xs">{JSON.stringify(comparison.comparison, null, 2)}</pre>
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <PaymentEstimator price={data.results[0]?.unit.priceUsd.value ?? null} />
              <TradeEstimator />
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-display text-lg font-bold">Is this a good deal?</h3>
                <p className="mt-2 text-sm text-muted-foreground">MatchRV compares asking prices inside the returned live result set. It does not call a third-party appraisal API yet, so this is a market-listing comparison, not a valuation.</p>
                <p className="mt-4 text-2xl font-black">Median: {money(medianPrice)}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <h3 className="font-display text-lg font-bold">Price opportunities</h3>
                <p className="mt-1 text-xs text-muted-foreground">Ranked published discounts from MSRP where the feed exposes both values. This is not historical price-drop tracking yet.</p>
                <div className="mt-3 space-y-3">
                  {discounts.length ? discounts.map((m) => <div key={m.unit.id} className="border-t pt-3 first:border-t-0 first:pt-0"><p className="text-sm font-bold">{m.unit.title}</p><p className="text-xs text-muted-foreground">{money(m.unit.msrpUsd.value! - m.unit.priceUsd.value!)} below published MSRP · seen {m.unit.provenance.lastSeenAt.slice(0,10)}</p></div>) : <p className="text-sm text-muted-foreground">No verified MSRP discounts in this result set.</p>}
                </div>
              </div>
            </aside>
          </section>
        )}
      </main>
    </Layout>
  );
}
