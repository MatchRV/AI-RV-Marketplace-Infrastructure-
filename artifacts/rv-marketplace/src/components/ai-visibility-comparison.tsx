import { Link } from "wouter";
import { FileSearch, CheckCircle2, ArrowUpRight } from "lucide-react";

// Dealer-published example: a data-format illustration, not an AI result or customer claim.
const example = {
  title: "2025 Heartland Pioneer 17BH", stock: "2747898", location: "Fife, WA",
  url: "https://rv.campingworld.com/rv/2025-heartland-pioneer-17bh-2747898-fife-wa",
};

export function AiVisibilityComparison() {
  return <section className="brand-soft-section"><div className="brand-container brand-section" aria-labelledby="ai-comparison-heading">
    <div className="section-heading"><div><p className="brand-eyebrow">The local buyer’s next step</p><h2 id="ai-comparison-heading">What happens when a local buyer asks AI what RV to buy?</h2></div><p>AI needs readable unit details before it can make a useful comparison. Here is the difference the data can make.</p></div>
    <blockquote className="buyer-question">“Best bunkhouse travel trailer under 6,500 lbs within 50 miles of Fife, WA.”</blockquote>
    <p className="brand-fine">Illustrative comparison, not a recorded AI answer or a claim that a dealer uses MatchRV. The prompt leaves the weight basis undefined; an assistant should clarify dry weight versus loaded weight before recommending.</p>
    <div className="ai-comparison-grid">
      <article className="ai-comparison-card blocked"><p className="brand-eyebrow"><FileSearch size={16}/> When listing details are inaccessible</p><h3>Standard website. Missing evidence.</h3><p className="comparison-result">No unit can be confirmed from this page.</p><p>A JavaScript-only page shell may hide the inventory details a crawler needs. Missing sleeping capacity, length, and weight fields leave important questions unanswered.</p><p className="brand-fine">Tacoma RV Center’s September 21, 2026 audit scored 57/100. In that sample, all 40 listing pages returned empty static shells; sleeping capacity, length, and unit type were absent from all 14 units analyzed. Weight gaps varied by field.</p><Link href="/visibility-report" className="brand-text-link">Read the observed benchmark →</Link></article>
      <article className="ai-comparison-card ready"><p className="brand-eyebrow"><CheckCircle2 size={16}/> What readable inventory can expose</p><h3>A named unit. Facts the buyer can check.</h3><p className="comparison-unit">{example.title}</p><p>Stock #{example.stock} · {example.location}</p><dl className="comparison-specs"><div><dt>Price at inventory capture</dt><dd>$11,999 · October 16, 2026</dd></div><div><dt>Dealer-published dry weight</dt><dd>3,064 lbs</dd></div><div><dt>Dealer-published hitch weight</dt><dd>366 lbs</dd></div><div><dt>Sleeping capacity</dt><dd>5 · bunkhouse</dd></div><div><dt>Length</dt><dd>20′ 11″</dd></div></dl><a className="brand-text-link" href={example.url} target="_blank" rel="noopener noreferrer">See the dealer’s unit page <ArrowUpRight size={16}/></a><p className="brand-fine">Specifications checked against the dealer page October 18, 2026. Price comes from MatchRV’s October 16 inventory capture. Confirm current price and availability with the dealer. Dry weight is not loaded towing weight; verify vehicle ratings, payload, hitch limits, and loaded weights.</p></article>
    </div><p className="brand-fine">A readable inventory layer can improve access to these facts. AI assistants choose their own sources and recommendations; appearing first is not guaranteed.</p>
  </div></section>;
}
