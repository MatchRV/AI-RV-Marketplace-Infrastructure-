import { Link } from "wouter";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import { BOOKING_URL } from "@/config/booking";
import { BookingLink } from "@/components/booking-link";

export function BookReportCall() {
  return <BrandLayout><SEO title="Book an AI Visibility Report Call" description="Discuss your dealership inventory and the scope of a MatchRV AI Visibility Report." canonical="/book"/>
    <section className="brand-container brand-section booking-page"><p className="brand-eyebrow">Your next step</p><h1>Let’s talk about your dealership.</h1>
      <p className="brand-lead">Review your snapshot, walk through your inventory challenges with Jonathan, and choose an audit or monthly service scope.</p>
      <div className="booking-grid"><article className="coverage-card"><h2>Let’s talk about your inventory</h2><p>Start with a snapshot readout or discuss a full audit, supported inventory feeds, and ongoing management.</p><p><strong>The full AI Visibility Audit is $99 one time.</strong> We’ll discuss the right scope for any ongoing work on a call. No paid work or recurring billing begins without a separate agreement.</p><h3>What to bring</h3><ul><li>Your dealership website and inventory URL</li><li>Your snapshot or the shopper questions you want reviewed</li><li>Your inventory provider and rooftop locations</li></ul><Link href="/visibility-report" className="brand-text-link">See completed report examples →</Link><Link href="/#plans" className="brand-text-link">See the audit and calendar →</Link></article>
      <div className="booking-calendar"><h2>Find a time. Let’s talk.</h2>{BOOKING_URL ? <><p>Open Jonathan’s Google Calendar to choose an available appointment. Your booking is confirmed by the scheduling service after you finish.</p><BookingLink placement="book_page">Find a time and let’s talk ↗</BookingLink></> : <div role="status"><p><strong>Online scheduling is coming soon.</strong></p><p>The booking calendar is being connected. No appointment has been reserved.</p><button className="brand-button" disabled>Calendar not yet available</button></div>}<p className="brand-fine">Booking a conversation does not start an audit or charge your card.</p></div></div>
    </section></BrandLayout>;
}
