import type { CSSProperties } from "react";
import { Link } from "wouter";
import { SiteLayout } from "@/components/site/site-layout";
import { SEO } from "@/components/seo";
import { Icon } from "@/components/site/icon";
import { PricingNote } from "@/components/site/blocks";
import { SITE } from "@/config/site";

export function VisibilityReport() {
  return <SiteLayout>
    <SEO title="AI Visibility Report Examples" description="See a completed MatchRV AI Visibility Report and the one-page free snapshot. Real reports, visible evidence, and five ranked fixes." canonical="/visibility-report"/>
    <section className="page-hero" aria-labelledby="page-title">
      <div className="page-hero__bg" aria-hidden="true">
        <div className="grain"></div>
      </div>
      <div className="container">
        <Link className="back-link" href="/"><Icon name="arrow"/> Dealer AI Visibility</Link>
        <h1 id="page-title" className="display display--md"><span className="line"><span>Real reports.</span></span> <span className="line"><span><em>Visible evidence.</em></span></span></h1>
        <p className="eyebrow">The MatchRV report standard</p>
        <p className="lead">See the full report and the free snapshot. A {SITE.sampleDealer} · Website observed September 21, 2026. These completed reports show the format used for full audits and free snapshots. Each new report uses that dealership’s own evidence.</p>
      </div>
    </section>
    <section className="section section--tight-top" aria-labelledby="examples-title">
      <div className="container">
        <h2 id="examples-title" className="sr-only">Report examples</h2>
        <div className="reports" data-stagger>
          <article className="report card" data-reveal data-spot>
            <div className="report__thumb" aria-hidden="true">
              <div className="sheet">
                <span className="sheet__brand">Match<b>RV</b></span>
                <span className="sheet__title">AI Visibility Report</span>
                <span className="sheet__score">57<small>/100</small></span>
                <span className="sheet__bars"><i style={{ "--w": "57%" } as CSSProperties}></i><i style={{ "--w": "70%" } as CSSProperties}></i><i style={{ "--w": "20%" } as CSSProperties}></i><i style={{ "--w": "24%" } as CSSProperties}></i><i style={{ "--w": "100%" } as CSSProperties}></i></span>
              </div>
              <div className="sheet sheet--back"></div>
              <div className="sheet sheet--back2"></div>
            </div>
            <div className="report__body">
              <h3 className="h3">Full AI Visibility Report</h3>
              <p>Scorecard, dealership snapshot, shopper questions, inventory health, listing spot-checks and five ranked fixes.</p>
              <div className="report__actions">
                <a className="btn btn--primary" href="#inside-title">See what’s inside <Icon name="arrow"/></a>
                <Link className="btn btn--ghost" href="/book">Book a report call</Link>
              </div>
            </div>
          </article>
          <article className="report card" data-reveal data-spot>
            <div className="report__thumb" aria-hidden="true">
              <div className="sheet sheet--single">
                <span className="sheet__brand">Match<b>RV</b></span>
                <span className="sheet__title">Free Visibility Snapshot</span>
                <span className="sheet__score">57<small>/100</small></span>
                <span className="sheet__lines"><i></i><i></i><i></i></span>
              </div>
            </div>
            <div className="report__body">
              <h3 className="h3">Free Visibility Snapshot</h3>
              <p>A one-page overview with the readiness score, three key findings and a short shopper-question table.</p>
              <div className="report__actions">
                <a className="btn btn--primary" href="/#request-report">Get my free snapshot <Icon name="arrow"/></a>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
    {/* Preview built from the MatchRV sample report (dealership name withheld) */}
    <section className="section theme-paper" aria-labelledby="inside-title">
      <div className="container">
        <header className="section-head section-head--split" data-reveal>
          <div>
            <p className="eyebrow">Inside the full report</p>
            <h2 id="inside-title" className="h1">A scorecard you can <em>act on.</em></h2>
          </div>
          <div>
            <p className="lead">Excerpts from the completed report for a {SITE.sampleDealer}.</p>
            <p className="fine">Observed September 21, 2026 · 342 inventory URLs in sitemap · 40 pages sampled · 14 units analyzed · 26 shopper questions. Static-page read without JavaScript. Dealership name withheld.</p>
          </div>
        </header>
        <div className="scorecard" data-reveal>
          <div className="dial" style={{ "--score": "57" } as CSSProperties} role="img" aria-label="Overall AI readiness: 57 out of 100">
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle className="dial__track" cx="60" cy="60" r="52" pathLength="100"/>
              <circle className="dial__value" cx="60" cy="60" r="52" pathLength="100"/>
            </svg>
            <p><strong data-count="57">57</strong><span>/100</span></p>
            <small>Overall AI readiness — observed</small>
          </div>
          <div className="scorecard__body">
            <h3 className="h3">“Your data exists, but AI can’t see it”</h3>
            <dl className="meters">
              <div>
                <dt>Inventory health</dt>
                <dd><span className="meter" style={{ "--w": "70%" } as CSSProperties}></span><b>70</b></dd>
              </div>
              <div>
                <dt>AI readability</dt>
                <dd><span className="meter meter--low" style={{ "--w": "20%" } as CSSProperties}></span><b>20</b></dd>
              </div>
              <div>
                <dt>Shopper-question coverage</dt>
                <dd><span className="meter meter--low" style={{ "--w": "24%" } as CSSProperties}></span><b>24</b></dd>
              </div>
              <div>
                <dt>Crawlability</dt>
                <dd><span className="meter" style={{ "--w": "100%" } as CSSProperties}></span><b>100</b></dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="excerpts" data-stagger>
          <article className="tile" data-reveal>
            <p className="eyebrow">Inventory health</p>
            <h3 className="h4">Which facts are missing</h3>
            <p className="fine">Share of the 14 units analyzed where the field was extractable.</p>
            <dl className="meters meters--fields">
              <div>
                <dt>Year / Make / Model</dt>
                <dd><span className="meter" style={{ "--w": "100%" } as CSSProperties}></span><b>14/14</b></dd>
              </div>
              <div>
                <dt>VIN</dt>
                <dd><span className="meter" style={{ "--w": "100%" } as CSSProperties}></span><b>14/14</b></dd>
              </div>
              <div>
                <dt>Dry weight</dt>
                <dd><span className="meter" style={{ "--w": "93%" } as CSSProperties}></span><b>13/14</b></dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd><span className="meter" style={{ "--w": "86%" } as CSSProperties}></span><b>12/14</b></dd>
              </div>
              <div>
                <dt>GVWR</dt>
                <dd><span className="meter" style={{ "--w": "79%" } as CSSProperties}></span><b>11/14</b></dd>
              </div>
              <div>
                <dt>RV type</dt>
                <dd><span className="meter meter--low" style={{ "--w": "0%" } as CSSProperties}></span><b>0/14</b></dd>
              </div>
              <div>
                <dt>Sleeps</dt>
                <dd><span className="meter meter--low" style={{ "--w": "0%" } as CSSProperties}></span><b>0/14</b></dd>
              </div>
              <div>
                <dt>Length</dt>
                <dd><span className="meter meter--low" style={{ "--w": "0%" } as CSSProperties}></span><b>0/14</b></dd>
              </div>
              <div>
                <dt>Per-unit location</dt>
                <dd><span className="meter meter--low" style={{ "--w": "0%" } as CSSProperties}></span><b>0/14</b></dd>
              </div>
            </dl>
          </article>
          <article className="tile" data-reveal>
            <p className="eyebrow">What AI shoppers asked</p>
            <h3 className="h4">Could the site prove the answer?</h3>
            <ul className="qa">
              <li><span className="qa__r qa__r--no">No</span><p><strong>“Travel trailer under $40,000 near Tacoma?”</strong> No unit carries an explicit RV type.</p></li>
              <li><span className="qa__r qa__r--no">No</span><p><strong>“Which units sleep 6?”</strong> Sleeping capacity missing on 14 of 14 units analyzed.</p></li>
              <li><span className="qa__r qa__r--no">No</span><p><strong>“Towables 30 feet or less?”</strong> Length missing on 14 of 14 units analyzed.</p></li>
              <li><span className="qa__r qa__r--part">Partial</span><p><strong>“Which listings publish dry weight + GVWR?”</strong> Weights on 13/14 and 11/14, still blocked by missing type and location.</p></li>
            </ul>
          </article>
          <article className="tile" data-reveal>
            <p className="eyebrow">Top 5 fixes</p>
            <h3 className="h4">Ranked by lead impact</h3>
            <ol className="fixes">
              <li><span>Highest</span>Make listing pages readable without JavaScript and add Vehicle structured data</li>
              <li><span>High</span>Tag every unit with an explicit RV type</li>
              <li><span>High</span>Add sleeps and length to every unit</li>
              <li><span>Medium-high</span>Put a per-unit location line on every listing</li>
              <li><span>Medium</span>Close the small gaps: 2 prices, 3 GVWRs, 4 slide counts</li>
            </ol>
          </article>
        </div>
      </div>
    </section>
    <section className="section section--glow" aria-labelledby="discuss-title">
      <div className="container">
        <div className="center-cta center-cta--flush center-cta--gap" data-reveal>
          <h2 id="discuss-title" className="h1">Discuss a report for <em>your dealership.</em></h2>
          <p className="lead">Review your inventory, the audit, and the right next step for your rooftop.</p>
        </div>
        <PricingNote/>
      </div>
    </section>
  </SiteLayout>;
}
