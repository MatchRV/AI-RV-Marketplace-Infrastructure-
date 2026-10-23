import { Link } from "wouter";
import { InventoryCoverage } from "@/components/inventory-coverage";
import { ArrowRight, Search, Building2, ListChecks, FileSearch, BarChart3, ClipboardCheck, ChevronRight } from "lucide-react";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import { ReportExamples } from "@/components/report-examples";
import { QuickReport } from "@/components/quick-report";
import { DealerPricing } from "@/components/dealer-pricing";
import { AiVisibilityComparison } from "@/components/ai-visibility-comparison";

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
    <p>Review your inventory, the audit, and the right next step for your rooftop.</p>
    <Link href="/book" className="brand-button">Book a report call <ArrowRight size={17}/></Link>
    <p className="brand-fine">Full audit: $99, credited in full toward any monthly plan. Scope is confirmed before work begins.</p>
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
    <section className="brand-container dealer-hero"><div><p className="brand-eyebrow"><Search size={16}/> AI visibility for RV dealerships</p><h1>Make your inventory<br/>part of the answer.</h1><p className="brand-lead">Find what AI can read on your lot. Fix the gaps. Keep your inventory ready for AI discovery and paid promotion.</p><div className="hero-actions"><a href="#request-report" className="brand-button">Get my free snapshot <ArrowRight size={17}/></a><Link href="/visibility-report" className="brand-button secondary">See a sample report</Link></div><a href="#plans" className="brand-text-link">Explore audit and monthly plans <ChevronRight size={16}/></a><InventoryCoverage compact/></div>
      <div className="hero-visual"><img src="/images/stitch-rv-road.jpg" alt="Camper van on a forest road"/><div className="hero-visual-caption"><span>THE NEXT CUSTOMER JOURNEY</span><h2>Be understood.<br/>Be part of the conversation.</h2></div><div className="hero-proof"><FileSearch size={22}/><div><strong>Evidence behind every finding</strong><p>Clear observations. Honest unknowns. Practical next steps.</p></div></div></div>
    </section>
    <div className="brand-value-strip"><div className="brand-container"><span>Built for RV dealerships</span><span>Inventory-specific findings</span><span>Clear, actionable recommendations</span></div></div>
    <aside className="brand-container press-feature" aria-label="MatchRV in the news">
      <div>
        <p className="brand-eyebrow">In the news · October 22, 2026</p>
        <h2>RVBusiness profiles MatchRV</h2>
        <p>Read how MatchRV is working to connect RV shoppers with specific, available dealer inventory through AI.</p>
      </div>
      <a className="brand-text-link" href="https://rvbusiness.com/startup-matchrv-looking-to-make-ai-a-better-salesman/" target="_blank" rel="noopener noreferrer" aria-label="Read the MatchRV article on RVBusiness (opens in a new tab)">Read the RVBusiness article <ArrowRight size={17}/></a>
    </aside>
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
    <AiVisibilityComparison/>
    <section className="brand-container brand-section"><div className="section-heading"><div><p className="brand-eyebrow">A clearer view of your digital showroom</p><h2>What the Visibility Report covers</h2></div><p>Understand what’s visible, what’s missing, and where your team can make a difference.<br/><br/>The report is the starting point for preparing your inventory data for AI-powered shopping.</p></div><div className="coverage-grid">{coverage.map(([Icon,title,copy],i)=><article className="coverage-card" key={title}><div className="coverage-icon"><Icon size={22}/><span>0{i+1}</span></div><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <DealerPricing/>
    <section className="brand-soft-section" id="sample-report"><div className="brand-container brand-section"><div className="section-heading"><div><p className="brand-eyebrow">See the details</p><h2>Useful findings. A clear next step.</h2></div><p>See the full report and the one-page free snapshot.</p></div><SampleReportPreview/></div></section>
    <section className="brand-container brand-section"><div className="center-heading"><p className="brand-eyebrow">From visibility to action</p><h2>Three steps to a clearer picture</h2></div><div className="steps-grid">{[['Share your website','Start with your dealership website and the inventory you want reviewed.'],['Review your findings','See observed answers, information gaps, and the evidence behind them.'],['Put your plan to work','Give your team a focused list of improvements and track what changes.']].map(([title,copy],i)=><article key={title}><span className="step-number">0{i+1}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
    <ShoppingStatistic research/>
    <section className="brand-soft-section"><div className="brand-container brand-section brand-faq"><p className="brand-eyebrow">Before you begin</p><h2>Frequently asked questions</h2>{[
      ['What does it cost?','The snapshot is free. The full audit is $99 one time, credited in full toward any monthly plan. AI Inventory Syndication is $599 per month per rooftop. AI Dominance + Managed ChatGPT Ads is $1,499 per month per rooftop, plus ad spend. Scope and service terms are confirmed before enrollment; booking a call does not start a subscription.'],
      ['What does the report evaluate?','The report reviews dealership information, inventory accessibility, and specification gaps. The agreed scope determines which shopper questions and AI assistants are tested.'],
      ['What can I learn from the free snapshot?','See what a sample of your public pages exposes and how Gemini answers one local shopper question. Every finding has a date and a defined scope. The full audit checks a broader agreed set of pages, units, and questions.'],
      ['Will monthly management guarantee recommendations?','We manage the inventory data and connections in the agreed scope. AI assistants still choose their sources and recommendations. Ads remain labeled sponsored placements and do not purchase a place in the organic answer.'],
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

