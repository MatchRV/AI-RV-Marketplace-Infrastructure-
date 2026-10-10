import { Link } from "wouter";
import { ArrowUpRight, MessageSquare, Target } from "lucide-react";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";

export function DealerAdvertising() {
  return <BrandLayout>
    <SEO title="ChatGPT Advertising for RV Dealerships" description="Explore ChatGPT advertising for RV dealerships with MatchRV: campaign planning, inventory messaging, landing pages, and performance review." canonical="/advertising"/>
    <section className="brand-container advertising-hero">
      <div><p className="brand-eyebrow"><Target size={17}/> ChatGPT advertising for RV dealerships</p>
        <h1>Put your dealership<br/>in the conversation.</h1>
        <p className="brand-lead">Reach RV shoppers as they explore options and compare choices in ChatGPT. MatchRV brings your inventory, dealership story, and campaign plan together.</p>
        <Link href="/contact" className="brand-button">Explore ChatGPT advertising <ArrowUpRight size={18}/></Link>
        <p className="brand-fine">Start with your market, inventory, and goals. We confirm the scope and budget before work begins.</p>
      </div>
      <aside className="advertising-intent"><p className="brand-eyebrow">Be part of their next step</p><div><MessageSquare size={28}/><p><strong>While they explore</strong><span>ChatGPT advertising</span></p></div><p>Help RV shoppers discover your dealership while they weigh their options. Connect a relevant ad to inventory worth exploring.</p><p className="brand-fine">Paid placements are labeled and separate from ChatGPT answers.</p></aside>
    </section>
    <section className="brand-soft-section"><div className="brand-container brand-section">
      <p className="brand-eyebrow">Our advertising focus</p><h2>Built for RV dealers. Designed for ChatGPT.</h2>
      <div className="advertising-channels advertising-primary">
        <article><MessageSquare size={28}/><span className="advertising-label">A new way to reach shoppers</span><h3>ChatGPT advertising</h3><p>Reach people as they explore options and compare choices in ChatGPT. Build messaging around what makes your inventory and dealership useful to RV shoppers.</p><ul><li>Account readiness and eligibility review</li><li>Campaign goals, budget, and ad messaging</li><li>Relevant inventory pages and clear calls to action</li><li>Performance review using available platform reporting</li></ul><p className="brand-fine">Campaign access and delivery depend on platform eligibility and review. Sponsored ads are labeled and separate from ChatGPT answers.</p><a className="brand-text-link" href="https://ads.openai.com/" target="_blank" rel="noopener noreferrer">About ChatGPT ads <ArrowUpRight size={15}/></a></article>

      </div>
    </div></section>
    <section className="brand-container brand-section"><p className="brand-eyebrow">Built around your dealership</p><h2>A practical path from plan to campaign.</h2><ol className="advertising-steps"><li><span>01</span><h3>Understand your goals</h3><p>Review your location, inventory, sales priorities, and existing advertising.</p></li><li><span>02</span><h3>Prepare the campaign</h3><p>Build your ChatGPT ad messaging, destination pages, budget, and ways to measure inquiries.</p></li><li><span>03</span><h3>Launch and learn</h3><p>Launch the approved campaign, review the results, and adjust based on what shoppers do.</p></li></ol></section>
    <section className="brand-container advertising-support"><div><p className="brand-eyebrow">Additional advertising support</p><h2>Google Ads, when it fits your plan.</h2><p>Need help reaching shoppers who are searching on Google? We can discuss Google Search campaigns as an optional addition to your ChatGPT advertising plan, with a separate scope and budget.</p></div><Link href="/contact" className="brand-text-link">Discuss Google Ads support <ArrowUpRight size={16}/></Link></section>
    <section className="brand-container advertising-cta"><div><p className="brand-eyebrow">Ready for the next step?</p><h2>Let’s talk about your market.</h2><p>Bring your dealership website and advertising goals. We’ll discuss where to start.</p><Link href="/contact" className="brand-button">Discuss ChatGPT advertising <ArrowUpRight size={18}/></Link></div><div><h3>Start with AI visibility</h3><p>Understand how your website presents your inventory before choosing what to promote.</p><Link href="/" className="brand-text-link">Explore AI Visibility <ArrowUpRight size={16}/></Link><Link href="/visibility-report" className="brand-text-link">See report examples <ArrowUpRight size={16}/></Link></div></section>
  </BrandLayout>;
}
