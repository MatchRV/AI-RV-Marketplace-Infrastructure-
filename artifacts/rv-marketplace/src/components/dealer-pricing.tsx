import { ArrowUpRight, CalendarDays } from "lucide-react";
import { BookingLink } from "@/components/booking-link";

export function DealerPricing() {
  return <section className="brand-container brand-section" id="plans" aria-labelledby="dealer-plans-heading">
    <div className="center-heading">
      <p className="brand-eyebrow">Let’s talk about your dealership</p>
      <h2 id="dealer-plans-heading">Find a time. Let’s talk.</h2>
      <p>Choose a time on Jonathan’s calendar to discuss your inventory and the right next step.</p>
    </div>
    <div className="dealer-booking-panel">
      <div className="dealer-audit-offer">
        <p className="brand-eyebrow">A simple starting point</p>
        <h3>Full AI Visibility Audit</h3>
        <p className="dealer-audit-price"><strong>$99</strong><span>one time</span></p>
        <p>Find the gaps in how your dealership and inventory appear to AI shoppers.</p>
      </div>
      <div className="dealer-calendar-offer">
        <CalendarDays size={32} aria-hidden="true"/>
        <h3>Pick a time that works for you.</h3>
        <p>Open Jonathan’s Google Calendar to choose an available time to talk.</p>
        <BookingLink placement="home_plans">Find a time and let’s talk <ArrowUpRight size={17} aria-hidden="true"/></BookingLink>
      </div>
    </div>
  </section>;
}
