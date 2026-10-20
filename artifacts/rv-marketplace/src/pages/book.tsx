import { Link } from "wouter";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import { BOOKING_URL } from "@/config/booking";

export function BookReportCall() {
  return <BrandLayout><SEO title="Book an AI Visibility Report Call" description="Discuss your dealership inventory and the scope of a MatchRV AI Visibility Report." canonical="/book"/>
    <section className="brand-container brand-section booking-page"><p className="brand-eyebrow">Your next step</p><h1>Let’s talk about your dealership.</h1>
      <p className="brand-lead">Review your snapshot, walk through your inventory challenges with Jonathan, and choose an audit or monthly service scope.</p>
      <div className="booking-grid"><article className="coverage-card"><h2>Audit or monthly inventory services</h2><p>Start with a snapshot readout or discuss a full audit, supported inventory feeds, and ongoing management.</p><p><strong>$99 one-time audit, credited in full toward a monthly plan.</strong> AI Inventory Syndication is $599/month per rooftop. Managed ChatGPT Ads with syndication is $1,499/month per rooftop plus ad spend, subject to pilot eligibility.</p><p>We confirm the scope and service agreement before paid work or recurring billing begins.</p><h3>What to bring</h3><ul><li>Your dealership website and inventory URL</li><li>Your snapshot or the shopper questions you want reviewed</li><li>Your inventory provider and rooftop locations</li></ul><Link href="/visibility-report" className="brand-text-link">See completed report examples →</Link><Link href="/#plans" className="brand-text-link">Compare all plans →</Link></article>
      <div className="booking-calendar"><h2>Choose a time</h2>{BOOKING_URL ? <><p>Open Jonathan’s calendar to choose an available appointment. Your booking is confirmed by the scheduling service after you finish.</p><a className="brand-button" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">Open booking calendar ↗</a></> : <div role="status"><p><strong>Online scheduling is coming soon.</strong></p><p>The booking calendar is being connected. No appointment has been reserved.</p><button className="brand-button" disabled>Calendar not yet available</button></div>}<p className="brand-fine">Booking a conversation does not start an audit or charge your card.</p></div></div>
    </section></BrandLayout>;
}
