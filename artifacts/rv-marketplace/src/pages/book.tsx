import { Link } from "wouter";
import { SiteLayout } from "@/components/site/site-layout";
import { SEO } from "@/components/seo";
import { Icon } from "@/components/site/icon";
import { BookingLink } from "@/components/booking-link";
import { SITE } from "@/config/site";

export function BookReportCall() {
  return <SiteLayout>
    <SEO title="Book a Call" description="Review your snapshot, walk through your inventory challenges with Jonathan, and choose an audit or monthly service scope." canonical="/book"/>
    <section className="page-hero" aria-labelledby="page-title">
      <div className="page-hero__bg" aria-hidden="true">
        <div className="grain"></div>
      </div>
      <div className="container">
        <p className="eyebrow eyebrow--live">Your next step</p>
        <h1 id="page-title" className="display display--md"><span className="line"><span>Let’s talk about</span></span> <span className="line"><span><em>your dealership.</em></span></span></h1>
        <p className="lead">Review your snapshot, walk through your inventory challenges with Jonathan, and choose an audit or monthly service scope.</p>
      </div>
    </section>
    <section className="section section--tight-top" aria-labelledby="book-title">
      <div className="container booking">
        <div className="booking__info" data-reveal>
          <h2 id="book-title" className="h2">Let’s talk about your inventory</h2>
          <p>Start with a snapshot readout or discuss a full audit, supported inventory feeds, and ongoing management.</p>
          <p className="notice"><strong>Pricing is based on dealership size.</strong> To get pricing, set an appointment here or call <a className="text-link" href={SITE.phoneHref}>{SITE.phone}</a> to reach the MatchRV team. No paid work or recurring billing begins without a separate agreement.</p>
          <h3 className="h4">What to bring</h3>
          <ul className="ticks ticks--lg">
            <li><Icon name="check"/> Your dealership website and inventory URL</li>
            <li><Icon name="check"/> Your snapshot or the shopper questions you want reviewed</li>
            <li><Icon name="check"/> Your inventory provider and rooftop locations</li>
          </ul>
          <p className="tile__links"><Link className="link-arrow" href="/visibility-report">See completed report examples <Icon name="arrow"/></Link> <Link className="link-arrow" href="/visibility-solution">See how MatchRV fixes visibility <Icon name="arrow"/></Link></p>
        </div>
        <aside className="plan plan--book booking__card" data-reveal>
          <span className="plan__icon"><Icon name="calendar"/></span>
          <h2 className="h2">Find a time. Let’s talk.</h2>
          <p>Open Jonathan’s Google Calendar to choose an available appointment. Your booking is confirmed by the scheduling service after you finish.</p>
          <BookingLink placement="book_page" className="btn btn--primary btn--lg btn--block">Find a time and let’s talk <Icon name="external"/></BookingLink>
          <a className="btn btn--ghost btn--lg btn--block" href={SITE.phoneHref}><Icon name="phone"/> Call {SITE.phone}</a>
          <p className="fine">Booking a conversation does not start an audit or charge your card.</p>
        </aside>
      </div>
    </section>
  </SiteLayout>;
}
