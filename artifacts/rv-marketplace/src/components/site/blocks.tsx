import { Link } from "wouter";
import { SITE } from "@/config/site";
import { Icon } from "./icon";

/** Where MatchRV is available. The wording of both lines is fixed. */
export function StatusPills({ stacked = false }: { stacked?: boolean }) {
  return <ul className={stacked ? "status status--stack" : "status"} aria-label="Where MatchRV is available">
    <li className="status__item status__item--live"><i></i>Live in ChatGPT plugins</li>
    <li className="status__item status__item--pending"><i></i>In final approval on Muse</li>
  </ul>;
}

/** Shown on every page under Dealer Services. Pricing is never a number. */
export function PricingNote() {
  return <aside className="pricing-note" aria-labelledby="pricing-note-title" data-reveal>
    <div className="pricing-note__copy">
      <p className="eyebrow">Pricing</p>
      <h2 id="pricing-note-title" className="h2">Pricing is based on <em>dealership size.</em></h2>
      <p>To get pricing, set an appointment or call <a className="text-link" href={SITE.phoneHref}>{SITE.phone}</a> to reach the MatchRV team.</p>
    </div>
    <div className="pricing-note__actions">
      <Link className="btn btn--primary btn--lg" href="/book">Set an appointment <Icon name="arrow"/></Link>
      <a className="btn btn--ghost btn--lg" href={SITE.phoneHref}><Icon name="phone"/> Call {SITE.phone}</a>
    </div>
  </aside>;
}

/** Closing call to action for the dealer pages. */
export function CtaReport() {
  return <section className="cta-band" aria-labelledby="cta-band-title">
    <img className="cta-band__img" src="/images/site/lake-sunrise.webp" alt="" width="1408" height="768" loading="lazy" data-parallax="0.12"/>
    <div className="cta-band__shade" aria-hidden="true"></div>
    <div className="container cta-band__inner" data-reveal>
      <p className="eyebrow">Your dealership’s next step</p>
      <h2 id="cta-band-title" className="h1">Make your inventory <em>easier to understand.</em></h2>
      <p className="lead">Start with a visibility report built around your dealership.</p>
      <div className="hero__actions">
        <Link className="btn btn--primary btn--lg" href="/book">Book a report call <Icon name="arrow"/></Link>
        <a className="btn btn--ghost btn--lg" href={SITE.phoneHref}><Icon name="phone"/> {SITE.phone}</a>
      </div>
      <p className="fine">Pricing is based on dealership size. Scope is confirmed before work begins.</p>
    </div>
  </section>;
}
