import { useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type MetricKey = "visibility" | "mentions" | "citations" | "top3";
type FixStatus = "open" | "fixed" | "re-testing";

const HISTORY = [
  { month: "Apr", visibility: 14, mentions: 9, citations: 4, top3: 2 },
  { month: "May", visibility: 18, mentions: 12, citations: 6, top3: 3 },
  { month: "Jun", visibility: 23, mentions: 16, citations: 9, top3: 5 },
  { month: "Jul", visibility: 31, mentions: 21, citations: 13, top3: 7 },
  { month: "Aug", visibility: 37, mentions: 26, citations: 17, top3: 10 },
  { month: "Sep", visibility: 44, mentions: 31, citations: 22, top3: 14 },
];

const EVIDENCE: Record<MetricKey, { prompt: string; model: string; date: string; result: string }[]> = {
  visibility: [
    { prompt: "travel trailers under $30k near Tacoma", model: "ChatGPT", date: "2026-09-18", result: "Dealer cited in answer" },
    { prompt: "best bunkhouse RV dealer near Fife WA", model: "Claude", date: "2026-09-18", result: "Dealer mentioned, inventory not cited" },
    { prompt: "used fifth wheel under $50k south of Seattle", model: "Gemini", date: "2026-09-19", result: "No dealer citation" },
  ],
  mentions: [
    { prompt: "RV dealers near Tacoma with travel trailers", model: "ChatGPT", date: "2026-09-18", result: "Dealer mentioned" },
    { prompt: "where can I buy a bunkhouse near Puyallup", model: "Gemini", date: "2026-09-19", result: "Dealer mentioned" },
  ],
  citations: [
    { prompt: "travel trailers under $30k near Tacoma", model: "ChatGPT", date: "2026-09-18", result: "Specific inventory page cited" },
    { prompt: "new toy haulers near Fife", model: "Claude", date: "2026-09-20", result: "Specific unit page cited" },
  ],
  top3: [
    { prompt: "RV dealer with bunkhouse trailers near Tacoma", model: "ChatGPT", date: "2026-09-18", result: "Position 2" },
    { prompt: "travel trailers under $35k near Fife", model: "Gemini", date: "2026-09-19", result: "Position 3" },
  ],
};

const INITIAL_FIXES = [
  { id: 1, title: "Add numeric Offer price to unit pages", impact: "High", effort: "Low", status: "open" as FixStatus },
  { id: 2, title: "Render RV type, length, sleeps, and GVWR in crawlable HTML", impact: "High", effort: "Medium", status: "open" as FixStatus },
  { id: 3, title: "Add schema.org/Vehicle JSON-LD to every unit", impact: "High", effort: "Medium", status: "re-testing" as FixStatus },
  { id: 4, title: "Remove stale sold units from indexable inventory", impact: "Medium", effort: "Low", status: "fixed" as FixStatus },
  { id: 5, title: "Publish local-intent FAQ copy for Tacoma/Fife searches", impact: "Medium", effort: "Low", status: "open" as FixStatus },
];

const LABELS: Record<MetricKey, string> = {
  visibility: "Observed AI Visibility",
  mentions: "Dealer mentions",
  citations: "Inventory citations",
  top3: "Top-3 placement",
};

export function DealerVisibilityDashboard() {
  const [metric, setMetric] = useState<MetricKey>("visibility");
  const [fixes, setFixes] = useState(INITIAL_FIXES);
  const billingUrl = import.meta.env.VITE_BILLING_PORTAL_URL as string | undefined;

  const cards = useMemo(() => (Object.keys(LABELS) as MetricKey[]).map((key) => {
    const now = HISTORY[HISTORY.length - 1][key];
    const prev = HISTORY[HISTORY.length - 2][key];
    return { key, value: now, delta: now - prev };
  }), []);

  function cycle(id: number) {
    setFixes((all) => all.map((f) => f.id !== id ? f : {
      ...f,
      status: f.status === "open" ? "fixed" : f.status === "fixed" ? "re-testing" : "open",
    }));
  }

  return (
    <Layout>
      <SEO title="AI Visibility Dashboard — MatchRV Dealers" description="Track observed AI visibility, dealer mentions, inventory citations, top-3 placement, evidence, and remediation work over time." canonical="https://matchrv.com/dealer-visibility" />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <section className="flex flex-col gap-5 rounded-3xl bg-[#0B1117] p-7 text-white sm:flex-row sm:items-end sm:justify-between sm:p-9">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#65E7DF]">Monitoring subscriber home</p>
            <h1 className="mt-3 font-display text-4xl font-black">Is your inventory becoming more visible to AI?</h1>
            <p className="mt-3 max-w-2xl text-sm text-white/70">Sample dashboard data is shown below until a rooftop is connected to the audit pipeline. Every displayed metric remains traceable to prompt-level evidence.</p>
          </div>
          {billingUrl ? <a href={billingUrl} className="rounded-xl bg-white px-5 py-3 text-center text-sm font-black text-[#0B1117]">Manage $199/mo billing</a> : <span className="rounded-xl border border-white/20 px-5 py-3 text-sm text-white/70">Billing portal hook ready · URL not configured</span>}
        </section>

        <div className="mt-7 grid gap-4 md:grid-cols-4">
          {cards.map((card) => <button key={card.key} onClick={() => setMetric(card.key)} className={`rounded-2xl border p-5 text-left transition ${metric === card.key ? "border-[#00CED1] bg-[#EFFFFD]" : "border-border bg-card"}`}>
            <p className="text-sm font-bold text-muted-foreground">{LABELS[card.key]}</p>
            <div className="mt-2 flex items-end justify-between"><p className="text-3xl font-black">{card.value}{card.key === "visibility" ? "%" : ""}</p><p className="text-sm font-bold text-emerald-700">+{card.delta} MoM</p></div>
            <p className="mt-2 text-xs text-muted-foreground">Click for prompt evidence</p>
          </button>)}
        </div>

        <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_420px]">
          <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex items-end justify-between"><div><h2 className="font-display text-xl font-black">{LABELS[metric]} over time</h2><p className="text-sm text-muted-foreground">Seeded sample history · replace with audit-pipeline runs when connected.</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">SAMPLE</span></div>
            <div className="mt-5 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={HISTORY}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey={metric} stroke="currentColor" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between"><h2 className="font-display text-xl font-black">Evidence behind this number</h2><span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-800">SAMPLE</span></div>
            <div className="mt-4 space-y-3">
              {EVIDENCE[metric].map((row, i) => <div key={i} className="rounded-xl bg-muted/50 p-4">
                <p className="text-sm font-bold">“{row.prompt}”</p>
                <p className="mt-2 text-xs text-muted-foreground">{row.model} · {row.date}</p>
                <p className="mt-1 text-sm">{row.result}</p>
              </div>)}
            </div>
          </section>
        </div>

        <section className="mt-7 rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-display text-xl font-black">Top fixes</h2><p className="text-sm text-muted-foreground">Status belongs to the dealer workflow; impact and effort come from the audit.</p></div><p className="text-xs text-muted-foreground">Click status to advance: open → fixed → re-testing</p></div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b"><th className="pb-3">Fix</th><th className="pb-3">Impact</th><th className="pb-3">Effort</th><th className="pb-3">Status</th></tr></thead><tbody>{fixes.map((f) => <tr key={f.id} className="border-b last:border-b-0"><td className="py-4 font-bold">{f.title}</td><td className="py-4">{f.impact}</td><td className="py-4">{f.effort}</td><td className="py-4"><button onClick={() => cycle(f.id)} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase">{f.status}</button></td></tr>)}</tbody></table>
          </div>
        </section>
      </main>
    </Layout>
  );
}
