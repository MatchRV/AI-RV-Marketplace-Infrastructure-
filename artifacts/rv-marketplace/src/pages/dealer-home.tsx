import { Link } from "wouter";
import { ArrowRight, Search, Building2, ListChecks, FileSearch, BarChart3, ClipboardCheck, ChevronRight } from "lucide-react";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import { ReportExamples } from "@/components/report-examples";

const coverage = [
  [Search, "Dealership visibility", "See how your dealership appears in the AI shopping questions that matter to your customers."],
  [Building2, "Business information", "Review whether your location, contact details, and dealership information are clear and consistent."],
  [ListChecks, "Inventory accessibility", "Find out whether inventory pages expose the information an assistant needs to understand an RV."],
  [FileSearch, "Specification completeness", "Identify missing prices, sleeping capacity, length, weights, and equipment details."],
  [BarChart3, "Competitive context", "Understand which dealerships appear in the same observed shopping answers, with supporting evidence."],
  [ClipboardCheck, "A prioritized action plan", "Get practical next steps for your team, ordered by the gaps found in your report."],
] as const;

export function ReportRequest({ compact = false }: { compact?: boolean }) {
  return <div className={`report-request ${compact ? "compact" : ""}`}>
    <p>Start with a conversation about your inventory, the report, and the next steps.</p>
    <Link href="/book" className="brand-button">Book a report call <ArrowRight size={17}/></Link>
    <p className="brand-fine">Starter audit: Founding 5 offer of $99 for the first five rooftops, then $299–$499. Scope and offer availability are confirmed before work begins.</p>
  </div>;
}

export function SampleReportPreview() {
  return <ReportExamples/>;
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
  return <BrandLayout><SEO title="Dealer AI Visibility Reports" description="Understand your dealership’s AI visibility. Founding 5: $99 · then $299–$499. Book a report call with the founder." canonical="/"/>
    <section className="brand-container dealer-hero" id="request-report"><div><p className="brand-eyebrow"><Search size={16}/> AI visibility for RV dealerships</p><h1>Is Your Inventory<br/>Invisible To AI Buyers?</h1><p className="brand-lead">See how your dealership appears in AI answers, where your inventory information falls short, and what to improve first.</p><ReportRequest/><a href="#sample-report" className="brand-text-link">See what’s in the report <ChevronRight size={16}/></a></div>
      <div className="hero-visual"><img src="/images/stitch-rv-road.jpg" alt="Camper van on a forest road"/><div className="hero-visual-caption"><span>THE NEXT CUSTOMER JOURNEY</span><h2>Be understood.<br/>Be part of the conversation.</h2></div><div className="hero-proof"><FileSearch size={22}/><div><strong>Evidence behind every finding</strong><p>Clear observations. Honest unknowns. Practical next steps.</p></div></div></div>
    </section>
    <div className="brand-value-strip"><div className="brand-container"><span>Built for RV dealerships</span><span>Inventory-specific findings</span><span>Clear, actionable recommendations</span></div></div>
    <ShoppingStatistic/>
    <section className="brand-container brand-section"><div className="section-heading"><div><p className="brand-eyebrow">A clearer view of your digital showroom</p><h2>What the Visibility Report covers</h2></div><p>Understand what’s visible, what’s missing, and where your team can make a difference.</p></div><div className="coverage-grid">{coverage.map(([Icon,title,copy],i)=><article className="coverage-card" key={title}><div className="coverage-icon"><Icon size={22}/><span>0{i+1}</span></div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="brand-soft-section" id="sample-report"><div className="brand-container brand-section"><div className="section-heading"><div><p className="brand-eyebrow">See the details</p><h2>Useful findings. A clear next step.</h2></div><p>Completed audits with dealership identities removed.</p></div><SampleReportPreview/></div></section>
    <section className="brand-container brand-section"><div className="center-heading"><p className="brand-eyebrow">From visibility to action</p><h2>Three steps to a clearer picture</h2></div><div className="steps-grid">{[['Share your website','Start with your dealership website and the inventory you want reviewed.'],['Review your findings','See observed answers, information gaps, and the evidence behind them.'],['Put your plan to work','Give your team a focused list of improvements and track what changes.']].map(([title,copy],i)=><article key={title}><span className="step-number">0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <ShoppingStatistic research/>
    <section className="brand-soft-section"><div className="brand-container brand-section brand-faq"><p className="brand-eyebrow">Before you begin</p><h2>Frequently asked questions</h2>{[
      ['What does it cost?','Founding 5: $99 for the first five rooftops, then $299–$499 one-time (rooftop size and unit count). We confirm scope before starting; booking a call does not start a subscription.'],
      ['What does the report evaluate?','The report reviews dealership information, inventory accessibility, and specification gaps. The agreed scope determines which shopper questions and AI assistants are tested.'],
      ['Is this an instant AI ranking score?','No. Book a call to discuss your dealership and the report scope. We confirm scope and pricing before a review begins. The examples show dated findings from completed audits with dealership identities removed; they are not measurements of your dealership.'],
      ['How are findings supported?','A completed report should identify the pages reviewed, questions tested, dates, and observed answers. Missing or untested information is labeled, rather than treated as a positive result.'],
      ['Why can answers differ between AI assistants?','Answers can change with the question, location, timing, available sources, and assistant. A report captures observations under its stated conditions and does not guarantee future recommendations.'],
    ].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
    <section className="brand-container brand-section"><div className="report-bottom"><p className="brand-eyebrow">Your dealership’s next step</p><h2>Make your inventory easier to understand.</h2><p>Start with a visibility report built around your dealership.</p><ReportRequest compact/></div></section>
  </BrandLayout>;
}

export function VisibilityReport() {
  return <BrandLayout><SEO title="Real Dealer AI Visibility Report Examples" description="Explore dated findings from completed MatchRV audits, with dealership identities removed: missing specifications, inventory readiness scores, and prioritized improvements." canonical="/visibility-report"/>
    <div className="brand-container brand-section"><Link href="/" className="brand-text-link">← Dealer AI Visibility</Link><h1>Real reports. Visible evidence.</h1><ReportExamples full/><div className="report-bottom"><h2>Discuss a report for your dealership.</h2><ReportRequest/></div></div>
  </BrandLayout>;
}
