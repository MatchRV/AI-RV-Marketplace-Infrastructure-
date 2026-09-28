import { useId, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { ArrowRight, Search, Building2, ListChecks, FileSearch, BarChart3, ClipboardCheck, Check, Globe, ChevronRight } from "lucide-react";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";

const coverage = [
  [Search, "Dealership visibility", "See how your dealership appears in the AI shopping questions that matter to your customers."],
  [Building2, "Business information", "Review whether your location, contact details, and dealership information are clear and consistent."],
  [ListChecks, "Inventory accessibility", "Find out whether inventory pages expose the information an assistant needs to understand an RV."],
  [FileSearch, "Specification completeness", "Identify missing prices, sleeping capacity, length, weights, and equipment details."],
  [BarChart3, "Competitive context", "Understand which dealerships appear in the same observed shopping answers, with supporting evidence."],
  [ClipboardCheck, "A prioritized action plan", "Get practical next steps for your team, ordered by the gaps found in your report."],
] as const;

export function ReportRequest({ compact = false }: { compact?: boolean }) {
  const formId = useId();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setDraft(null);
    try {
      const url = new URL(/^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`);
      if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) throw new Error();
      const body = `Hi Jonathan,\n\nI'd like a Starter Visibility Audit for our dealership.\n\nWebsite: ${url.href}\nContact email: ${email.trim()}\nName: ${name.trim() || "Not provided"}\nPhone: ${phone.trim() || "Not provided"}\n\nStarter audits typically run $299–$499 one-time. Please send the scope, pricing for our rooftop, and next steps.\n\nThanks!`;
      setDraft(`mailto:jonathan@matchrv.com?subject=${encodeURIComponent("AI Visibility Report Request")}&body=${encodeURIComponent(body)}`);
    } catch { setError("Enter a valid dealership website, such as yourdealership.com."); }
  }
  return <form className={`report-request ${compact ? "compact" : ""}`} onSubmit={submit}>
    <label htmlFor={`${formId}-website`}>Dealership website</label>
    <div className="report-request-row"><div className="brand-input-wrap"><Globe size={18}/><input id={`${formId}-website`} value={website} onChange={e => {setWebsite(e.target.value); setDraft(null);}} placeholder="www.yourdealership.com" inputMode="url" autoComplete="url" required maxLength={500}/></div></div>
    <div className="report-contact-fields">
      <label htmlFor={`${formId}-email`}>Email (required)<input id={`${formId}-email`} type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>{setEmail(e.target.value);setDraft(null);}} /></label>
      <label htmlFor={`${formId}-name`}>Name (optional)<input id={`${formId}-name`} autoComplete="name" maxLength={120} value={name} onChange={e=>{setName(e.target.value);setDraft(null);}} /></label>
      <label htmlFor={`${formId}-phone`}>Phone (optional)<input id={`${formId}-phone`} type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={e=>{setPhone(e.target.value);setDraft(null);}} /></label>
    </div>
    <button className="brand-button" type="submit">Prepare my report request <ArrowRight size={17}/></button>
    <p className="brand-fine">Starter Visibility Audit typically $299–$499. This prepares an email to jonathan@matchrv.com. You must send it from your email app; no payment starts here.</p>
    {error && <p role="alert" className="brand-error">{error}</p>}
    {draft && <div className="request-ready" role="status"><strong>Your request is ready to review.</strong><p>Your website and contact details are included. Open your email app and send the request to jonathan@matchrv.com. Nothing has been sent yet.</p><a href={draft} className="brand-button">Review request in email <ArrowRight size={16}/></a></div>}
  </form>;
}

export function SampleReportPreview() {
  return <div className="sample-report-panel">
    <div className="sample-report-top"><span className="brand-eyebrow">Sample dealership</span><span className="sample-label">Sample report · Illustrative data</span></div>
    <div className="sample-report-body"><div><h3>The counts are the findings</h3><p className="brand-muted">Fictional example: 48 inventory pages reviewed. These are illustrative counts, not measurements of any dealership.</p>
      {[["Pages with a numeric price",36],["Pages with sleeping capacity",24],["Pages with length and weight",18]].map(([label,count])=><div className="sample-bar" key={label}><div><span>{label}</span><strong>{count} / 48</strong></div></div>)}
      <p className="brand-muted">Scores summarize these counts: price coverage 75%, sleeping capacity 50%, length and weight 38% (rounded). No overall AI visibility score is claimed.</p>
    </div><div className="sample-evidence"><div className="evidence-heading">From question to evidence</div><p className="sample-question">“Find a bunkhouse travel trailer near Tacoma for a family of four.”</p><div className="sample-finding"><span className="sample-label">Example finding</span><h3>Missing details leave unanswered questions.</h3><p>The sample listing includes a price and photos, but does not state sleeping capacity or loaded weight.</p></div><div className="sample-next"><Check size={18}/><div><strong>Suggested improvement</strong><p>Publish clearly labeled specifications on each RV’s listing page.</p></div></div><Link href="/visibility-report" className="brand-text-link">Explore the sample report <ArrowRight size={16}/></Link></div></div>
  </div>;
}

function ShoppingStatistic({ research = false }: { research?: boolean }) {
  return <aside className="brand-container shopping-stat-wrap" aria-label="AI shopping research statistic">
    <div className="shopping-stat-box">
      <strong className="shopping-stat-number">{research ? "72%" : "46%"}</strong>
      <div className="shopping-stat-copy">
        <p>{research ? "of shoppers already using AI use it as their primary research tool for products and brands." : "of AI users now begin purchase research on an AI platform instead of a traditional search engine."}</p>
        <a href={research ? "https://capitaloneshopping.com/research/ai-shopping-statistics/" : "https://martech.org/the-ai-shopping-stats-2026-what-you-need-to-know/"} target="_blank" rel="noopener noreferrer">{research ? "Source: Capital One Shopping · September 2026" : "Source: MarTech, citing L.E.K. Consulting · July 2026"} <ArrowRight size={15}/></a>
        <span className="shopping-stat-context">Consumer shopping research; not an RV-specific measurement.</span>
      </div>
    </div>
  </aside>;
}

export function DealerHome() {
  return <BrandLayout><SEO title="Dealer AI Visibility Reports" description="Understand your dealership’s AI visibility. Starter Visibility Audits typically run $299–$499. Email jonathan@matchrv.com." canonical="/"/>
    <section className="brand-container dealer-hero" id="request-report"><div><p className="brand-eyebrow"><Search size={16}/> AI visibility for RV dealerships</p><h1>Is Your Inventory<br/>Invisible To AI Buyers?</h1><p className="brand-lead">See how your dealership appears in AI answers, where your inventory information falls short, and what to improve first.</p><ReportRequest/><a href="#sample-report" className="brand-text-link">See what’s in the report <ChevronRight size={16}/></a></div>
      <div className="hero-visual"><img src="/images/stitch-rv-road.jpg" alt="Camper van on a forest road"/><div className="hero-visual-caption"><span>THE NEXT CUSTOMER JOURNEY</span><h2>Be understood.<br/>Be part of the conversation.</h2></div><div className="hero-proof"><FileSearch size={22}/><div><strong>Evidence behind every finding</strong><p>Clear observations. Honest unknowns. Practical next steps.</p></div></div></div>
    </section>
    <div className="brand-value-strip"><div className="brand-container"><span>Built for RV dealerships</span><span>Inventory-specific findings</span><span>Clear, actionable recommendations</span></div></div>
    <ShoppingStatistic/>
    <section className="brand-container brand-section"><div className="section-heading"><div><p className="brand-eyebrow">A clearer view of your digital showroom</p><h2>What the Visibility Report covers</h2></div><p>Understand what’s visible, what’s missing, and where your team can make a difference.</p></div><div className="coverage-grid">{coverage.map(([Icon,title,copy],i)=><article className="coverage-card" key={title}><div className="coverage-icon"><Icon size={22}/><span>0{i+1}</span></div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="brand-soft-section" id="sample-report"><div className="brand-container brand-section"><div className="section-heading"><div><p className="brand-eyebrow">See the details</p><h2>Useful findings. A clear next step.</h2></div><p>A look inside a report, using illustrative data.</p></div><SampleReportPreview/></div></section>
    <section className="brand-container brand-section"><div className="center-heading"><p className="brand-eyebrow">From visibility to action</p><h2>Three steps to a clearer picture</h2></div><div className="steps-grid">{[['Share your website','Start with your dealership website and the inventory you want reviewed.'],['Review your findings','See observed answers, information gaps, and the evidence behind them.'],['Put your plan to work','Give your team a focused list of improvements and track what changes.']].map(([title,copy],i)=><article key={title}><span className="step-number">0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <ShoppingStatistic research/>
    <section className="brand-soft-section"><div className="brand-container brand-section brand-faq"><p className="brand-eyebrow">Before you begin</p><h2>Frequently asked questions</h2>{[
      ['What does it cost?','Starter Visibility Audits typically run $299–$499 one-time (rooftop size and unit count). We confirm scope before starting; sending a request does not start a subscription.'],
      ['What does the report evaluate?','The report reviews dealership information, inventory accessibility, and specification gaps. The agreed scope determines which shopper questions and AI assistants are tested.'],
      ['Is this an instant AI ranking score?','No. Submitting your website prepares a report request. We confirm scope and pricing before a review begins. Sample scores on this page are illustrative, not measurements of your dealership.'],
      ['How are findings supported?','A completed report should identify the pages reviewed, questions tested, dates, and observed answers. Missing or untested information is labeled, rather than treated as a positive result.'],
      ['Why can answers differ between AI assistants?','Answers can change with the question, location, timing, available sources, and assistant. A report captures observations under its stated conditions and does not guarantee future recommendations.'],
    ].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
    <section className="brand-container brand-section"><div className="report-bottom"><p className="brand-eyebrow">Your dealership’s next step</p><h2>Make your inventory easier to understand.</h2><p>Start with a visibility report built around your dealership.</p><ReportRequest compact/></div></section>
  </BrandLayout>;
}

export function VisibilityReport() {
  return <BrandLayout><SEO title="Sample Dealer AI Visibility Report" description="Explore an illustrative MatchRV dealership AI visibility report, with example findings and a prioritized action plan." canonical="/visibility-report"/>
    <div className="brand-container brand-section"><Link href="/" className="brand-text-link">← Dealer AI Visibility</Link><div className="report-page-heading"><div><p className="brand-eyebrow">An example of your report</p><h1>Dealership visibility,<br/>explained.</h1></div><span className="sample-label">Sample report · Illustrative data</span></div><p className="brand-lead">This example shows the report format. It is not an audit of a real dealership, and no live AI measurements are shown.</p><SampleReportPreview/>
      <section className="brand-section"><h2>What a completed report documents</h2><div className="coverage-grid">{[['Questions tested','The exact shopper questions, date, location context, and assistant used.'],['Observed answers','Whether your dealership or inventory was mentioned, with the actual supporting evidence.'],['Pages reviewed','The pages and specifications examined, including missing or inaccessible information.']].map(([title,copy])=><article className="coverage-card" key={title}><h3>{title}</h3><p>{copy}</p><span className="sample-label">Not tested in this example</span></article>)}</div></section>
      <section><p className="brand-eyebrow">Illustrative action plan</p><h2>Start with the information shoppers need.</h2><div className="report-actions">{[['Publish the essential specifications','Clearly label sleeping capacity, overall length, GVWR, and dry weight. Keep unknown values distinct from zero.'],['Make prices and availability clear','Provide numeric prices and keep sold or unavailable units up to date.'],['Align business information','Check that the dealership’s name, address, contact details, and hours agree across its pages.']].map(([title,copy],i)=><details key={title} open={i===0}><summary><span className="step-number">0{i+1}</span>{title}</summary><p>{copy}</p></details>)}</div></section>
      <div className="report-bottom"><h2>Get a report for your dealership.</h2><ReportRequest/></div>
    </div></BrandLayout>;
}
