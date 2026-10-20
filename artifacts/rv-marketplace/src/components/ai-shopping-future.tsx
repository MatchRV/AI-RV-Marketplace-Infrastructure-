import { Link } from "wouter";
import { InventoryCoverage } from "@/components/inventory-coverage";
import { ArrowRight, MessageCircle, Sparkles } from "lucide-react";

const assistants = [
  ["ChatGPT", "openai"],
  ["Gemini", "gemini-color"],
  ["Claude", "claude-color"],
  ["Copilot", "copilot-color"],
  ["Grok", "grok"],
  ["Perplexity", "perplexity-color"],
] as const;

const prompts = [
  "We have two kids and want a bunkhouse travel trailer under $40,000. What should we look for?",
  "Which RVs are short enough for national park campgrounds but still have room for our family?",
  "We like to camp off-grid. Show me RVs with solar, lithium, and enough fresh water for a long weekend.",
];

export function AiShoppingFuture() {
  return <section className="ai-future vision-page" aria-labelledby="ai-future-title">
    <div className="ai-future-intro">
      <p className="brand-eyebrow"><Sparkles size={16}/> A new way to discover RVs</p>
      <h1 id="ai-future-title">Your next RV search starts by talking to AI.</h1>
      <p>Tell an assistant about the people you travel with, your budget, and the adventures you have in mind. The search should begin with your life, not a maze of filters.</p>
    </div>

    <InventoryCoverage/>
    <div className="ai-brand-row" aria-label="Examples of AI assistants">
      {assistants.map(([name, icon]) => <div className="ai-brand-badge" key={name}><img src={`/images/ai-brands/${icon}.svg`} alt=""/><span>{name}</span></div>)}
    </div>
    <p className="ai-brand-note">These are examples of AI assistants people use. Their logos do not indicate a partnership or a live MatchRV integration.</p>

    <div className="vision-bridge">
      <MessageCircle aria-hidden="true" size={34}/>
      <h2>When shoppers ask AI what RV fits their life, MatchRV helps connect those conversations to inventory.</h2>
      <p>We’re building the data and connections that can help AI understand real RV listings, find relevant options, and explain the trade-offs.</p>
      <p>That starts with structured, consistent inventory information that stays current as prices, specifications, and availability change.</p>
    </div>

    <div className="vision-prompts">
      <p className="brand-eyebrow">Imagine asking</p>
      <h2>Start with a question in your own words.</h2>
      <div className="vision-prompt-grid">{prompts.map((prompt, index) => <blockquote key={prompt}><span>0{index + 1}</span>“{prompt}”</blockquote>)}</div>
    </div>

    <figure className="vision-infrastructure">
      <img src="/images/ai-ready-data-infrastructure-process.webp" alt="Concept diagram showing fragmented dealer inventory data becoming structured information that AI tools can use" loading="lazy"/>
      <figcaption>MatchRV’s vision for making RV inventory easier for AI to understand. Diagram is conceptual.</figcaption>
    </figure>

    <section className="vision-beyond" aria-labelledby="beyond-report-title">
      <div className="center-heading">
        <p className="brand-eyebrow">Beyond the Report</p>
        <h2 id="beyond-report-title">The inventory infrastructure between dealerships and AI</h2>
        <p>Your dealership already has a website. Preparing its inventory for AI-powered shopping takes more: complete details, consistent fields, standardized descriptions, and ongoing checks as listings change.</p>
        <p>MatchRV is building a path from identifying those gaps to improving the inventory data behind them.</p>
      </div>
      <div className="vision-data-grid">
        {[
          ["AI-Ready Inventory", "Prepare inventory records so AI shopping assistants can understand and compare RVs."],
          ["Structured Inventory", "Organize price, floorplan, sleeping capacity, length, weight, features, and availability into clear fields."],
          ["Normalized Inventory", "Standardize inconsistent model names, specifications, terminology, and listing fields."],
          ["Visibility Monitoring", "Check changing inventory for missing or incomplete information that could affect AI discovery."],
        ].map(([title, copy]) => <article key={title}><h3>{title}</h3><p>{copy}</p></article>)}
      </div>
      <div className="center-heading vision-journey-heading"><h2>From dealership inventory to qualified shopper</h2><p>The path MatchRV is building:</p></div>
      <figure className="vision-journey">
        <a href="/images/ai-driven-sales-lead-journey.webp" target="_blank" rel="noopener noreferrer" aria-label="View full-size MatchRV inventory journey diagram"><img src="/images/ai-driven-sales-lead-journey.webp" alt="The path MatchRV is building: Dealer Inventory, AI Visibility Report, Inventory Enrichment, AI-Ready Inventory, MatchRV Inventory Network, AI Shopping Experiences, Qualified Shopper, Dealer Lead" loading="lazy" width="1678" height="937"/></a>
        <figcaption>MatchRV’s planned inventory-to-shopper journey. View the full-size diagram for details.</figcaption>
      </figure>
      <div className="vision-report-cta"><h2>Find the gaps. Improve the data. Prepare for AI discovery.</h2><a href="/#request-report" className="brand-button">Start With an AI Visibility Report <ArrowRight size={17}/></a></div>
    </section>

    <div className="vision-coming-soon">
      <div><p className="brand-eyebrow">Coming Soon</p><h2>Meet shoppers where their search begins.</h2><p>MatchRV is working toward ways for AI assistants to connect shopper questions with RV inventory.</p></div>
      <div className="vision-roadmap"><span>MatchRV ChatGPT Plugin</span><span>Google UCP</span></div>
    </div>

    <div className="vision-dealer-link"><p>Are you an RV dealership?</p><Link href="/" className="brand-text-link">See how visible your inventory is to AI <ArrowRight size={17}/></Link></div>
  </section>;
}

