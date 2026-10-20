import { Link } from "wouter";
import { Check, ArrowRight } from "lucide-react";

export const dealerPlans = [
  { id: "audit", label: "Diagnostic", name: "Full AI Visibility Audit", price: "$99", period: "one time", description: "Find the gaps before you choose the fix.", features: ["4-page, 8-section audit PDF", "Client-side JavaScript and crawler accessibility checks", "Unit-level specification completeness scorecard", "Local competitor AI benchmark under stated test conditions", "One-on-one readout and action plan with Jonathan"], cta: "Book a Report Call", href: "/book", featured: false },
  { id: "syndication", label: "Core monthly plan", name: "Done-For-You AI Inventory Syndication", price: "$599", period: "/ month per rooftop", description: "Keep your inventory ready for the places AI reads.", features: ["Daily inventory ingestion from supported DMS or website feeds", "Missing OEM specifications backfilled when a source and exact model match are confirmed", "Hosted, pre-rendered inventory schema layer", "Inventory syndication through MatchRV’s live MCP tools", "Monthly AI Buyer Demand & Attribution Report using available MatchRV search and shortlist activity"], cta: "Start AI Syndication", href: "/book", featured: true },
  { id: "managed-ads", label: "Full scale · limited ads pilot", name: "AI Dominance + Managed ChatGPT Ads", price: "$1,499", period: "/ month per rooftop + ad spend", description: "Bring inventory readiness and paid promotion together.", features: ["Everything in Done-For-You AI Inventory Syndication", "Managed ChatGPT sponsored campaigns, subject to platform eligibility", "Inventory landing page alignment and conversion tracking", "Optional Google Search campaign integration, scoped separately", "Monthly local competitor AI share-of-voice checks under stated test conditions"], cta: "Explore Managed Ads", href: "/advertising", featured: false },
] as const;

export function DealerPricing() {
  return <section className="brand-container brand-section" id="plans" aria-labelledby="dealer-plans-heading">
    <div className="center-heading"><p className="brand-eyebrow">A clear starting point. Ongoing inventory care.</p><h2 id="dealer-plans-heading">Start with the audit. Keep the improvements working.</h2><p>Your $99 audit is credited in full toward any monthly plan.</p></div>
    <div className="dealer-pricing-grid">{dealerPlans.map(plan => <article className={`dealer-plan${plan.featured ? " featured" : ""}`} key={plan.id} aria-labelledby={`${plan.id}-heading`}>
      {plan.featured && <span className="dealer-plan-badge">Recommended</span>}
      <p className="brand-eyebrow">{plan.label}</p><h3 id={`${plan.id}-heading`}>{plan.name}</h3>
      <p className="dealer-plan-price"><strong>{plan.price}</strong><span>{plan.period}</span></p><p>{plan.description}</p>
      <ul>{plan.features.map(feature => <li key={feature}><Check size={17} aria-hidden="true"/><span>{feature}</span></li>)}</ul>
      <Link href={plan.href} className={`brand-button${plan.featured ? "" : " secondary"}`}>{plan.cta}<ArrowRight size={16}/></Link>
    </article>)}</div>
    <p className="brand-fine pricing-conditions">Enrollment starts with a scope review. We confirm feed access, supported integrations, reporting coverage, and service terms before work or recurring billing begins. Missing or conflicting specifications remain labeled. Reports cover activity MatchRV can observe; they do not measure every conversation across AI platforms.</p>
    <p className="brand-fine pricing-conditions">ChatGPT ads are in beta — we’re piloting with a small group of dealers. Ad spend is paid directly to OpenAI on your account. Sponsored placements are separate from organic answers; no plan guarantees a recommendation, ranking, or sale.</p>
  </section>;
}
