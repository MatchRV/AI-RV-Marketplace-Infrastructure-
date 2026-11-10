import { Link } from "wouter";
import { SiteLayout } from "@/components/site/site-layout";
import { SEO } from "@/components/seo";
import { Icon } from "@/components/site/icon";
import { CtaReport, PricingNote, StatusPills } from "@/components/site/blocks";
import { SITE } from "@/config/site";

export function VisibilitySolution() {
  return <SiteLayout nav="dealer">
    <SEO title="The AI Visibility Problem for RV Dealers, and the Fix" description="Shoppers increasingly ask AI assistants which RV to buy. Dealerships whose inventory AI cannot read get left out. See how MatchRV makes inventory discoverable and recommendable." canonical="/visibility-solution"/>
    <section className="page-hero page-hero--split" aria-labelledby="page-title">
      <div className="page-hero__bg" aria-hidden="true">
        <div className="grain"></div>
      </div>
      <div className="container page-hero__grid">
        <div>
          <p className="eyebrow eyebrow--live">The dealer visibility problem</p>
          <h1 id="page-title" className="display display--md"><span className="line"><span>Shoppers ask AI.</span></span> <span className="line"><span><em>Is your lot in the answer?</em></span></span></h1>
          <p className="lead">RV shoppers increasingly ask AI assistants which RV to buy. An assistant can only recommend what it can read. When your listings are hard to read, your dealership gets left out of the answer. MatchRV makes your inventory discoverable and recommendable.</p>
          <div className="hero__actions">
            <a className="btn btn--primary btn--lg" href="/#request-report">Get my free snapshot <Icon name="arrow"/></a>
            <a className="btn btn--ghost btn--lg" href="#before-after">See the difference</a>
          </div>
          <StatusPills/>
        </div>
        <figure className="chat chat--hero" data-reveal>
          <header className="chat__bar"><span className="chat__dots" aria-hidden="true"><i></i><i></i><i></i></span>AI assistant<span className="chat__tag">Illustrative example</span></header>
          <div className="chat__body">
            <p className="chat__msg chat__msg--user">Which bunkhouse fits my family?</p>
            <div className="chat__msg chat__msg--ai">
              <p>To compare bunkhouses I need a few facts from each listing:</p>
              <ul className="chat__needs">
                <li className="is-missing"><Icon name="x"/> Sleeping capacity</li>
                <li className="is-missing"><Icon name="x"/> Length</li>
                <li className="is-missing"><Icon name="x"/> RV type</li>
                <li><Icon name="check"/> Price</li>
              </ul>
              <p>I could not read three of them on this dealer’s listing pages, so I can’t confirm a match there.</p>
            </div>
          </div>
          <figcaption className="fine">Illustrative. Not a recorded AI answer.</figcaption>
        </figure>
      </div>
    </section>
    {/* ───────────── The problem ───────────── */}
    <section className="section theme-paper" aria-labelledby="problem-title">
      <div className="container">
        <header className="section-head section-head--split" data-reveal>
          <div>
            <p className="eyebrow">Why it matters now</p>
            <h2 id="problem-title" className="h1">The first conversation is moving <em>to AI.</em></h2>
          </div>
          <div>
            <p className="lead">AI needs readable unit details before it can make a useful comparison.</p>
            <p>A JavaScript-only page shell may hide the inventory details a crawler needs. Missing sleeping capacity, length, and weight fields leave important questions unanswered. Great RVs become invisible before a customer ever contacts a dealership.</p>
          </div>
        </header>
        <div className="statpair" data-stagger>
          <article className="statcard" data-reveal>
            <p className="statcard__num"><span data-count="46">46</span>%</p>
            <p className="statcard__text">of AI users now begin purchase research on an AI platform instead of a traditional search engine.</p>
            <p className="fine"><a href="https://martech.org/the-ai-shopping-stats-2026-what-you-need-to-know/" target="_blank" rel="noopener">Source: MarTech, citing L.E.K. Consulting · July 2026 <Icon name="external"/></a><br/>Consumer shopping research; not an RV-specific measurement.</p>
          </article>
          <article className="statcard statcard--warm" data-reveal>
            <p className="statcard__num"><span data-count="72">72</span>%</p>
            <p className="statcard__text">of shoppers already using AI use it as their primary research tool for products and brands.</p>
            <p className="fine"><a href="https://capitaloneshopping.com/research/ai-shopping-statistics/" target="_blank" rel="noopener">Source: Capital One Shopping · September 2026 <Icon name="external"/></a><br/>Consumer shopping research; not an RV-specific measurement.</p>
          </article>
        </div>
      </div>
    </section>
    {/* ───────────── Before and after ───────────── */}
    <section className="section section--glow" id="before-after" aria-labelledby="ba-title">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="eyebrow">Same question. Two outcomes.</p>
          <h2 id="ba-title" className="h1">Invisible, <em>or recommended.</em></h2>
          <p className="lead">One local shopper question, answered twice: once when a dealer’s listing details can’t be read, and once when they can.</p>
        </header>
        <div className="ba" data-stagger>
          <figure className="chat chat--miss" data-reveal>
            <header className="chat__bar"><span className="chat__dots" aria-hidden="true"><i></i><i></i><i></i></span>AI assistant<span className="chat__tag">Illustrative example</span></header>
            <div className="chat__body">
              <p className="chat__msg chat__msg--user">Best bunkhouse travel trailer under 6,500 lbs within 50 miles of Fife, WA.</p>
              <div className="chat__msg chat__msg--ai">
                <p>I found RV dealers near Fife, but several listing pages came back without specs I can read, so I can’t confirm a bunkhouse under your weight limit there.</p>
                <p>Here is what I could verify from other sources:</p>
                <ul className="chat__list">
                  <li><strong>Dealer A</strong> · listed with price, weight, and sleeping capacity</li>
                  <li><strong>Dealer B</strong> · listed with price and length</li>
                </ul>
                <p>You may want to call other dealers directly to ask what they have.</p>
              </div>
            </div>
            <figcaption className="chat__verdict chat__verdict--miss"><Icon name="x"/> <span><strong>Before.</strong> Your dealership has the right unit on the lot and is not named.</span></figcaption>
          </figure>
          <figure className="chat chat--hit" data-reveal>
            <header className="chat__bar"><span className="chat__dots" aria-hidden="true"><i></i><i></i><i></i></span>AI assistant<span className="chat__tag">Illustrative example</span></header>
            <div className="chat__body">
              <p className="chat__msg chat__msg--user">Best bunkhouse travel trailer under 6,500 lbs within 50 miles of Fife, WA.</p>
              <div className="chat__msg chat__msg--ai">
                <p>One unit near Fife fits what you described. First, do you mean dry weight or loaded weight?</p>
                <div className="chat__unit">
                  <p className="chat__unit-name">2025 Heartland Pioneer 17BH</p>
                  <p className="chat__unit-meta">Stock #2747898 · Fife, WA</p>
                  <dl>
                    <div>
                      <dt>Price</dt>
                      <dd>$11,999</dd>
                    </div>
                    <div>
                      <dt>Dry weight</dt>
                      <dd>3,064 lbs</dd>
                    </div>
                    <div>
                      <dt>Hitch weight</dt>
                      <dd>366 lbs</dd>
                    </div>
                    <div>
                      <dt>Sleeps</dt>
                      <dd>5 · bunkhouse</dd>
                    </div>
                    <div>
                      <dt>Length</dt>
                      <dd>20′ 11″</dd>
                    </div>
                  </dl>
                </div>
                <p>Confirm current price and availability with the dealer before you visit.</p>
              </div>
            </div>
            <figcaption className="chat__verdict chat__verdict--hit"><Icon name="check"/> <span><strong>After.</strong> A named unit, with facts the buyer can check.</span></figcaption>
          </figure>
        </div>
        <p className="fine ba__note" data-reveal>Illustrative comparison, not a recorded AI answer or a claim that a dealer uses MatchRV. Unit specifications were checked against the <a href="https://rv.campingworld.com/rv/2025-heartland-pioneer-17bh-2747898-fife-wa" target="_blank" rel="noopener">dealer’s unit page</a> on October 18, 2026; price comes from MatchRV’s October 16 inventory capture. Dry weight is not loaded towing weight; verify vehicle ratings, payload, hitch limits, and loaded weights. AI assistants choose their own sources and recommendations; appearing first is not guaranteed.</p>
      </div>
    </section>
    {/* ───────────── What a listing looks like to AI ───────────── */}
    <section className="section theme-paper" aria-labelledby="listing-title">
      <div className="container">
        <header className="section-head section-head--split" data-reveal>
          <div>
            <p className="eyebrow">What AI reads on a listing page</p>
            <h2 id="listing-title" className="h1">The same RV, <em>read two ways.</em></h2>
          </div>
          <div>
            <p className="lead">A shopper’s browser runs the scripts and sees a full page. An AI reader often doesn’t.</p>
            <p>MatchRV organizes price, floorplan, sleeping capacity, length, weight, features, and availability into clear fields, and standardizes inconsistent model names and terminology.</p>
          </div>
        </header>
        <div className="compare" data-stagger>
          <article className="compare__card compare__card--miss" data-reveal>
            <p className="tag tag--warn"><Icon name="x"/> Before · hard to read</p>
            <h3 className="h3">An empty page shell.</h3>
            <div className="shell" aria-hidden="true">
              <div className="shell__bar">
                <i></i>
                <i></i>
                <i></i>
                <span>view-source: listing page</span>
              </div>
              <pre>{"<body>\n  <div id=\"app\"></div>\n  <script src=\"bundle.js\"></script>\n</body>"}</pre>
              <p>No unit can be confirmed from this page.</p>
            </div>
            <p className="sr-only">Illustration: a listing page whose source contains no unit details.</p>
            <p className="compare__evidence">In a September 21, 2026 audit of a {SITE.sampleDealer}, all 40 sampled listing pages returned empty static shells. RV type, sleeping capacity, length, and per-unit location were missing on all 14 units analyzed. Overall AI readiness: <strong>57/100</strong>.</p>
            <Link className="link-arrow" href="/visibility-report">Read the observed benchmark <Icon name="arrow"/></Link>
          </article>
          <article className="compare__card compare__card--hit" data-reveal>
            <p className="tag tag--ok"><Icon name="check"/> After · readable fields</p>
            <h3 className="h3">Facts an assistant can compare.</h3>
            <div className="shell shell--ok" aria-hidden="true">
              <div className="shell__bar">
                <i></i>
                <i></i>
                <i></i>
                <span>structured listing</span>
              </div>
              <pre>{"type          travel trailer\nfloorplan     bunkhouse\nsleeps        5\nlength        20′ 11″\ndry_weight    3,064 lbs\nprice         $11,999\nlocation      Fife, WA\ncaptured      Oct 16, 2026"}</pre>
            </div>
            <p className="sr-only">Illustration: the same listing as labeled fields for type, floorplan, sleeping capacity, length, dry weight, price, location, and capture date.</p>
            <p>What good looks like in a MatchRV report: pages readable without scripts, and every unit tagged with type, sleeping capacity, length, and location.</p>
            <p className="fine">Illustrative field layout using the dated unit facts above. Missing or conflicting specifications stay labeled as unknown.</p>
          </article>
        </div>
      </div>
    </section>
    {/* ───────────── How MatchRV fixes it ───────────── */}
    <section className="section" aria-labelledby="fix-title">
      <div className="container">
        <header className="section-head section-head--center" data-reveal>
          <p className="eyebrow">How MatchRV fixes it</p>
          <h2 id="fix-title" className="h1">From left out <em>to part of the answer.</em></h2>
        </header>
        <div className="steps steps--4" data-road>
          <svg className="steps__road" viewBox="0 0 1200 160" preserveAspectRatio="none" aria-hidden="true">
            <path className="steps__road-base" d="M0 110 C 150 20, 290 20, 400 80 S 650 150, 800 80 S 1060 10, 1200 60"/>
            <path className="steps__road-line" d="M0 110 C 150 20, 290 20, 400 80 S 650 150, 800 80 S 1060 10, 1200 60" pathLength="1"/>
          </svg>
          <ol className="steps__list" data-stagger>
            <li data-reveal><span className="steps__num">01</span> <h3 className="h3">Find the gaps</h3> <p>An AI Visibility Report shows what a sample of your pages exposes, which shopper questions your site could prove, and the fixes ranked by impact.</p></li>
            <li data-reveal><span className="steps__num">02</span> <h3 className="h3">Structure the inventory</h3> <p>Organize price, floorplan, sleeping capacity, length, weight, features, and availability into clear, consistent fields.</p></li>
            <li data-reveal><span className="steps__num">03</span> <h3 className="h3">Put it where AI looks</h3> <p>Authorized inventory is made available through MatchRV pages, structured feeds, and MCP responses to compatible AI assistants.</p> <StatusPills/></li>
            <li data-reveal><span className="steps__num">04</span> <h3 className="h3">Keep it current</h3> <p>Check changing inventory for missing or incomplete information that could affect AI discovery.</p></li>
          </ol>
        </div>
        <p className="notice notice--center" data-reveal>AI assistants choose their own sources and recommendations. MatchRV manages the inventory data and connections in the agreed scope; no plan guarantees a recommendation, ranking, or sale.</p>
      </div>
    </section>
    <section className="section theme-paper" aria-label="Pricing">
      <div className="container">
        <PricingNote/>
      </div>
    </section>
    <CtaReport/>
  </SiteLayout>;
}
