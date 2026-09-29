import { Link } from "wouter";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import { BOOKING_URL } from "@/config/booking";

export function BookReportCall() {
  return <BrandLayout><SEO title="Book an AI Visibility Report Call" description="Discuss your dealership inventory and the scope of a MatchRV AI Visibility Report." canonical="/book"/>
    <section className="brand-container brand-section booking-page"><p className="brand-eyebrow">Your next step</p><h1>Let’s talk about your dealership.</h1>
      <p className="brand-lead">Walk through your inventory challenges with Jonathan and decide whether a visibility audit fits your dealership.</p>
      <div className="booking-grid"><article className="coverage-card"><h2>Starter Visibility Audit</h2><p>Inventory completeness, AI readability, crawlability, shopper-query coverage, and a prioritized list of improvements.</p><p><strong>Founding 5: $99</strong> for the first five rooftops. Standard pricing: $299–$499. Scope and offer availability are confirmed on the call.</p><h3>What to bring</h3><ul><li>Your dealership website and inventory URL</li><li>The shopper questions you want to be found for</li><li>Any known inventory or website issues</li></ul><Link href="/visibility-report" className="brand-text-link">See completed report examples →</Link></article>
      <div className="booking-calendar"><h2>Choose a time</h2>{BOOKING_URL ? <><p>Open Jonathan’s calendar to choose an available appointment. Your booking is confirmed by the scheduling service after you finish.</p><a className="brand-button" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">Open booking calendar ↗</a></> : <div role="status"><p><strong>Online scheduling is coming soon.</strong></p><p>The booking calendar is being connected. No appointment has been reserved.</p><button className="brand-button" disabled>Calendar not yet available</button></div>}<p className="brand-fine">Booking a conversation does not start an audit or charge your card.</p></div></div>
    </section></BrandLayout>;
}
