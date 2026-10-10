import { Link } from "wouter";
import { InventoryCoverage } from "@/components/inventory-coverage";
import { ArrowRight, Search, Building2, ListChecks, FileSearch, BarChart3, ClipboardCheck, ChevronRight } from "lucide-react";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import { ReportExamples } from "@/components/report-examples";
import { QuickReport } from "@/components/quick-report";

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
    <p className="brand-fine">Full AI Visibility Report: $99, one time. We confirm the scope before work begins.</p>
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
  return <BrandLayout><SEO title="Dealer AI Visibility Reports" description="Run a free quick check of your dealership website and see one Gemini answer to an RV shopper question near your city. Explore evidence-backed full audits." canonical="/"/>
    <section className="brand-container dealer-hero"><div><p className="brand-eyebrow"><Search size={16}/> AI visibility for RV dealerships</p><h1>Is Your Inventory<br/>Invisible To AI Buyers?</h1><p className="brand-lead">See how your dealership appears in AI answers, where your inventory information falls short, and what to improve first.</p><ReportRequest/><a href="#request-report" className="brand-text-link">Get a free sample report of your website <ChevronRight size={16}/></a><InventoryCoverage compact/></div>
      <div className="hero-visual"><img src="/images/stitch-rv-road.jpg" alt="Camper van on a forest road"/><div className="hero-visual-caption"><span>THE NEXT CUSTOMER JOURNEY</span><h2>Be understood.<br/>Be part of the conversation.</h2></div><div className="hero-proof"><FileSearch size={22}/><div><strong>Evidence behind every finding</strong><p>Clear observations. Honest unknowns. Practical next steps.</p></div></div></div>
    </section>
    <div className="brand-value-strip"><div className="brand-container"><span>Built for RV dealerships</span><span>Inventory-specific findings</span><span>Clear, actionable recommendations</span></div></div>
    <section className="brand-container brand-section free-sample-section" id="request-report" aria-label="Free sample report of your website"><QuickReport/></section>
    <section className="brand-container brand-section dealer-video-section" aria-labelledby="dealer-video-heading">
      <div>
        <p className="brand-eyebrow">Watch the problem in 70 seconds</p>
        <h2 id="dealer-video-heading">Why great RVs can disappear from an AI search.</h2>
        <p>See how incomplete or hard-to-read listings affect the answers shoppers receive. Your dealership’s report will show findings from your own inventory.</p>
        <p className="brand-fine">Video is optional. Reports will appear as soon as they are ready.</p>
      </div>
      <video className="dealer-video" controls preload="metadata" playsInline aria-label="The Invisible RV Market: why RV listings can be hard for AI to find">
        <source src="/websitevideo.mp4" type="video/mp4" />
        Your browser does not support video playback.
      </video>
    </section>
    <ShoppingStatistic/>
    <section className="brand-container brand-section"><div className="section-heading"><div><p className="brand-eyebrow">A clearer view of your digital showroom</p><h2>What the Visibility Report covers</h2></div><p>Understand what’s visible, what’s missing, and where your team can make a difference.<br/><br/>The report is the starting point for preparing your inventory data for AI-powered shopping.</p></div><div className="coverage-grid">{coverage.map(([Icon,title,copy],i)=><article className="coverage-card" key={title}><div className="coverage-icon"><Icon size={22}/><span>0{i+1}</span></div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <section className="brand-soft-section" id="sample-report"><div className="brand-container brand-section"><div className="section-heading"><div><p className="brand-eyebrow">See the details</p><h2>Useful findings. A clear next step.</h2></div><p>See the full report and the one-page free snapshot.</p></div><SampleReportPreview/></div></section>
    <section className="brand-container brand-section"><div className="center-heading"><p className="brand-eyebrow">From visibility to action</p><h2>Three steps to a clearer picture</h2></div><div className="steps-grid">{[['Share your website','Start with your dealership website and the inventory you want reviewed.'],['Review your findings','See observed answers, information gaps, and the evidence behind them.'],['Put your plan to work','Give your team a focused list of improvements and track what changes.']].map(([title,copy],i)=><article key={title}><span className="step-number">0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <ShoppingStatistic research/>
    <section className="brand-soft-section"><div className="brand-container brand-section brand-faq"><p className="brand-eyebrow">Before you begin</p><h2>Frequently asked questions</h2>{[
      ['What does it cost?','The sample website report is free. The full AI Visibility Report is $99, one time. We confirm scope before starting; booking a call does not start a subscription.'],
      ['What does the report evaluate?','The report reviews dealership information, inventory accessibility, and specification gaps. The agreed scope determines which shopper questions and AI assistants are tested.'],
      ['Is this an instant AI ranking score?','No. The free check samples a few public pages and records one Gemini answer to a shopper question near your city. It is a dated observation, not an AI ranking score. The full audit covers a broader agreed scope.'],
      ['How are findings supported?','A completed report should identify the pages reviewed, questions tested, dates, and observed answers. Missing or untested information is labeled, rather than treated as a positive result.'],
      ['Why can answers differ between AI assistants?','Answers can change with the question, location, timing, available sources, and assistant. A report captures observations under its stated conditions and does not guarantee future recommendations.'],
    ].map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div></section>
    <section className="brand-container brand-section"><div className="report-bottom"><p className="brand-eyebrow">Your dealership’s next step</p><h2>Make your inventory easier to understand.</h2><p>Start with a visibility report built around your dealership.</p><ReportRequest compact/></div></section>
  </BrandLayout>;
}

export function VisibilityReport() {
  return <BrandLayout><SEO title="Real Dealer AI Visibility Report Examples" description="View the full Tacoma RV Center AI Visibility Report and the one-page Free Visibility Snapshot, including downloadable PDFs." canonical="/visibility-report"/>
    <div className="brand-container brand-section"><Link href="/" className="brand-text-link">← Dealer AI Visibility</Link><h1>Real reports. Visible evidence.</h1><ReportExamples full/><div className="report-bottom"><h2>Discuss a report for your dealership.</h2><ReportRequest/></div></div>
  </BrandLayout>;
}

