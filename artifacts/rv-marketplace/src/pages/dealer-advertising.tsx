import { Link } from "wouter";
import { ArrowUpRight, MessageSquare, Search, Target } from "lucide-react";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";

export function DealerAdvertising() {
  return <BrandLayout>
    <SEO title="ChatGPT & Google Ads for RV Dealerships" description="Explore MatchRV advertising support for RV dealerships, including ChatGPT ads and Google Search campaigns, inventory messaging, and lead measurement." canonical="/advertising"/>
    <section className="brand-container advertising-hero">
      <div><p className="brand-eyebrow"><Target size={17}/> Advertising for RV dealerships</p>
        <h1>Your inventory.<br/>Their next adventure.</h1>
        <p className="brand-lead">Reach shoppers as they search, compare, and decide. MatchRV helps your dealership build a clear advertising plan for ChatGPT and Google Ads.</p>
        <Link href="/contact" className="brand-button">Talk about advertising <ArrowUpRight size={18}/></Link>
        <p className="brand-fine">Start with your market, inventory, and goals. We confirm the scope and budget before work begins.</p>
      </div>
      <aside className="advertising-intent"><p className="brand-eyebrow">Two ways to connect</p><div><MessageSquare size={25}/><p><strong>While they explore</strong><span>ChatGPT advertising</span></p></div><div><Search size={25}/><p><strong>When they search</strong><span>Google Ads</span></p></div><p>Put a useful offer in front of a shopper, then give them a clear path to your dealership.</p></aside>
    </section>
    <section className="brand-soft-section"><div className="brand-container brand-section">
      <p className="brand-eyebrow">Choose your channel</p><h2>One dealership. More ways to be discovered.</h2>
      <div className="advertising-channels">
        <article><MessageSquare size={28}/><span className="advertising-label">A new advertising channel</span><h3>ChatGPT advertising</h3><p>Reach people as they explore options and compare choices in ChatGPT. Build messaging around what makes your inventory and dealership useful to RV shoppers.</p><ul><li>Account readiness and eligibility review</li><li>Campaign goals, budget, and ad messaging</li><li>Relevant inventory pages and clear calls to action</li><li>Performance review using available platform reporting</li></ul><p className="brand-fine">Campaign access and delivery depend on platform eligibility and review. Sponsored ads are labeled and separate from ChatGPT answers.</p><a className="brand-text-link" href="https://ads.openai.com/" target="_blank" rel="noopener noreferrer">About ChatGPT ads <ArrowUpRight size={15}/></a></article>
        <article><Search size={28}/><span className="advertising-label">Meet existing search demand</span><h3>Google Ads</h3><p>Show up when people search for RVs, brands, and dealerships. Focus Google Search campaigns on your service area and the inventory you want shoppers to see.</p><ul><li>Search terms and local market planning</li><li>Campaign structure, ad copy, and budget settings</li><li>Landing pages matched to shopper intent</li><li>Lead tracking and ongoing performance review</li></ul><p className="brand-fine">We agree on the campaign scope, measurement setup, and advertising budget before launch.</p><a className="brand-text-link" href="https://business.google.com/us/ad-solutions/search/" target="_blank" rel="noopener noreferrer">About Google Search ads <ArrowUpRight size={15}/></a></article>
      </div>
    </div></section>
    <section className="brand-container brand-section"><p className="brand-eyebrow">Built around your dealership</p><h2>A practical path from plan to campaign.</h2><ol className="advertising-steps"><li><span>01</span><h3>Understand your goals</h3><p>Review your location, inventory, sales priorities, and existing advertising.</p></li><li><span>02</span><h3>Prepare the campaign</h3><p>Choose the channel, message, destination pages, budget, and ways to measure inquiries.</p></li><li><span>03</span><h3>Launch and learn</h3><p>Launch the approved campaign, review the results, and adjust based on what shoppers do.</p></li></ol></section>
    <section className="brand-container advertising-cta"><div><p className="brand-eyebrow">Ready for the next step?</p><h2>Let’s talk about your market.</h2><p>Bring your dealership website and advertising goals. We’ll discuss where to start.</p><Link href="/contact" className="brand-button">Discuss your advertising <ArrowUpRight size={18}/></Link></div><div><h3>Start with AI visibility</h3><p>Understand how your website presents your inventory before choosing what to promote.</p><Link href="/" className="brand-text-link">Explore AI Visibility <ArrowUpRight size={16}/></Link><Link href="/visibility-report" className="brand-text-link">See report examples <ArrowUpRight size={16}/></Link></div></section>
  </BrandLayout>;
}
