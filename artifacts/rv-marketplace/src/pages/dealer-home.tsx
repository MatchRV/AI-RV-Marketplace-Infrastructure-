import { Link } from "wouter";
import { SiteLayout } from "@/components/site/site-layout";
import { SEO } from "@/components/seo";
import { Icon } from "@/components/site/icon";
import { QuickReport } from "@/components/quick-report";
import { CtaReport, PricingNote, StatusPills } from "@/components/site/blocks";
import { InventoryCoverage } from "@/components/inventory-coverage";
import { SITE } from "@/config/site";

export function DealerHome() {
  return <SiteLayout nav="dealer" home>
    <SEO title="AI Visibility for RV Dealerships" description="Find what AI can read on your lot, fix the gaps, and keep your RV inventory ready for AI discovery. Start with a free Visibility Snapshot." canonical="/"/>
    {/* ───────────── Hero ───────────── */}
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__media" aria-hidden="true">
        <video className="hero__video" muted loop playsInline preload="none" poster="/images/site/hero-night.webp" data-autoplay-src="/videos/home-bg.mp4"></video>
        <div className="hero__shade"></div>
        <div className="grain"></div>
      </div>
      <div className="container hero__grid">
        <div className="hero__copy">
          <p className="eyebrow eyebrow--live">AI visibility for RV dealerships</p>
          <h1 id="hero-title" className="display"><span className="line"><span>Make your inventory</span></span> <span className="line"><span><em>part of the answer.</em></span></span></h1>
          <p className="lead hero__lead">Find what AI can read on your lot. Fix the gaps. Keep your inventory ready for AI discovery.</p>
          <div className="hero__actions">
            <a className="btn btn--primary btn--lg" href="#request-report">Get my free snapshot <Icon name="arrow"/></a>
            <Link className="btn btn--ghost btn--lg" href="/visibility-report">See a sample report</Link>
          </div>
          <div className="hero__status">
            <a className="status__item status__item--press" href="https://rvbusiness.com/startup-matchrv-looking-to-make-ai-a-better-salesman/" target="_blank" rel="noopener"><i></i>As featured in RVBusiness <Icon name="external"/></a>
            <StatusPills/>
          </div>
        </div>
        <aside className="ask" aria-label="Example shopper questions">
          <header className="ask__head"><span className="ask__pulse" aria-hidden="true"></span> A shopper asks their AI</header>
          <p className="ask__q"><span className="sr-only">“Best bunkhouse travel trailer under 6,500 lbs within 50 miles of Fife, WA.”</span> <span aria-hidden="true" data-typer={"[\"Best bunkhouse travel trailer under 6,500 lbs within 50 miles of Fife, WA.\",\"Which bunkhouse fits my family?\",\"What fifth wheel can my truck safely tow?\",\"Find me a diesel pusher with washer/dryer prep under $200,000.\"]"}>Best bunkhouse travel trailer under 6,500 lbs within 50 miles of Fife, WA.</span><span className="ask__caret" aria-hidden="true"></span></p>
          <p className="ask__label">To answer, AI needs facts it can read</p>
          <ul className="ask__chips">
            <li>Price</li>
            <li>Sleeping capacity</li>
            <li>Length</li>
            <li>Weights</li>
            <li>Equipment</li>
            <li>Location</li>
          </ul>
          <p className="fine">Example shopper questions. Not recorded AI answers.</p>
        </aside>
      </div>
      <div className="container hero__stats">
        <InventoryCoverage/>
      </div>
    </section>
    {/* ───────────── As featured in RVBusiness ───────────── */}
    <section className="pressband theme-paper" aria-labelledby="press-title">
      <div className="container pressband__inner" data-reveal>
        <a className="pressband__badge" href="https://rvbusiness.com/startup-matchrv-looking-to-make-ai-a-better-salesman/" target="_blank" rel="noopener" aria-label="Read the RVBusiness article about MatchRV"> <span>As featured in</span> <strong>RV<b>Business</b></strong> <small>RVB Exclusive · October 22, 2026</small> </a>
        <div className="pressband__copy">
          <h2 id="press-title" className="h2">“Startup ‘MatchRV’ Looking to Make AI <em>a Better Salesman</em>”</h2>
          <p>RVBusiness profiled founder Jonathan Kitchel and how MatchRV connects AI shoppers with specific, in-stock RVs on dealer lots. Story by Laura Falin.</p>
        </div>
        <a className="btn btn--primary btn--lg" href="https://rvbusiness.com/startup-matchrv-looking-to-make-ai-a-better-salesman/" target="_blank" rel="noopener">Read the article <Icon name="external"/></a>
      </div>
    </section>
    {/* ───────────── Free Visibility Snapshot ───────────── */}
    <section className="section section--glow section--compact" id="request-report" aria-labelledby="snapshot-title">
      <div className="container snapshot">
        <div className="snapshot__copy" data-reveal>
          <p className="eyebrow">Free Visibility Snapshot</p>
          <h2 id="snapshot-title" className="h1">Get your free <em>Visibility Snapshot.</em></h2>
          <p className="lead">Enter your dealership website and location. We’ll check public pages and ask Gemini one RV shopper question near your dealership.</p>
          <ul className="ticks ticks--grid">
            <li><Icon name="check"/> A readiness score</li>
            <li><Icon name="check"/> Three findings</li>
            <li><Icon name="check"/> Shopper-question results</li>
            <li><Icon name="check"/> A PDF to download</li>
          </ul>
          <p className="fine">One-page snapshot. No account or card required.</p>
        </div>
        <div className="snapshot__panel" data-reveal>
          <QuickReport/>
        </div>
      </div>
    </section>
    {/* ───────────── The problem: video + two stats ───────────── */}
    <section className="section section--compact theme-paper" aria-labelledby="video-title">
      <div className="container">
        <div className="split split--video">
          <div data-reveal>
            <p className="eyebrow">Watch the problem in 70 seconds</p>
            <h2 id="video-title" className="h1">Why great RVs can <em>disappear</em> from an AI search.</h2>
            <p>AI needs readable unit details before it can make a useful comparison. Incomplete or hard-to-read listings change the answers shoppers receive.</p>
            <Link className="btn btn--primary" href="/visibility-solution">See how MatchRV fixes it <Icon name="arrow"/></Link>
          </div>
          <div className="player theme-ink" data-player data-reveal>
            <video preload="none" playsInline controls src="/websitevideo.mp4">Your browser does not support video playback.</video>
            <button className="player__cover" type="button"> <span className="player__play"><Icon name="play"/></span> <span className="player__meta"><strong>Why great RVs can disappear from an AI search</strong><small>Play video · 1:10 · captions on screen</small></span> </button>
          </div>
        </div>
        <div className="statpair statpair--tight" data-stagger>
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
    {/* ───────────── What the report covers ───────────── */}
    <section className="section section--compact" aria-labelledby="covers-title">
      <div className="container">
        <header className="section-head section-head--split" data-reveal>
          <div>
            <p className="eyebrow">A clearer view of your digital showroom</p>
            <h2 id="covers-title" className="h1">What the Visibility Report <em>covers</em></h2>
          </div>
          <div>
            <p className="lead">Understand what’s visible, what’s missing, and where your team can make a difference. Every finding comes with evidence: clear observations, honest unknowns, practical next steps.</p>
          </div>
        </header>
        <ol className="covers covers--compact" data-stagger>
          <li className="card" data-reveal data-spot><span className="card__num">01</span><Icon name="search"/> <h3 className="h4">Dealership visibility</h3> <p>How your dealership appears in the AI shopping questions that matter to your customers.</p></li>
          <li className="card" data-reveal data-spot><span className="card__num">02</span><Icon name="store"/> <h3 className="h4">Business information</h3> <p>Whether your location, contact details, and dealership information are clear and consistent.</p></li>
          <li className="card" data-reveal data-spot><span className="card__num">03</span><Icon name="eye"/> <h3 className="h4">Inventory accessibility</h3> <p>Whether inventory pages expose the information an assistant needs to understand an RV.</p></li>
          <li className="card" data-reveal data-spot><span className="card__num">04</span><Icon name="list"/> <h3 className="h4">Specification completeness</h3> <p>Missing prices, sleeping capacity, length, weights, and equipment details.</p></li>
          <li className="card" data-reveal data-spot><span className="card__num">05</span><Icon name="chart"/> <h3 className="h4">Competitive context</h3> <p>Which dealerships appear in the same observed shopping answers, with supporting evidence.</p></li>
          <li className="card" data-reveal data-spot><span className="card__num">06</span><Icon name="route"/> <h3 className="h4">A prioritized action plan</h3> <p>Practical next steps for your team, ordered by the gaps found in your report.</p></li>
        </ol>
        <div className="report-strip" data-reveal>
          <p><strong>See a completed example.</strong> A {SITE.sampleDealer} · observed September 21, 2026.</p>
          <div className="report-strip__links">
            <a className="link-arrow" href="/visibility-report#inside-title">See the scorecard <Icon name="arrow"/></a>
            <Link className="link-arrow" href="/visibility-report">Explore report examples <Icon name="arrow"/></Link>
          </div>
        </div>
      </div>
    </section>
    {/* ───────────── Pricing + more for dealers ───────────── */}
    <section className="section section--compact theme-paper" id="plans" aria-label="Pricing and dealer services">
      <div className="container">
        <PricingNote/>
        <div className="more" data-stagger>
          <Link className="more__card" href="/visibility-solution" data-reveal> <Icon name="route"/> <strong>Visibility Solution</strong> <span>Why dealers go unseen in AI answers, and how MatchRV fixes it.</span> </Link>
          <Link className="more__card" href="/lotai" data-reveal> <Icon name="chat"/> <strong>LotAI</strong> <span>AI chat for your dealership website: accurate answers and booked appointments.</span> </Link>
          <Link className="more__card" href="/match" data-reveal> <Icon name="search"/> <strong>Shopping for an RV?</strong> <span>Answer a few questions and we’ll match you with available dealer inventory.</span> </Link>
        </div>
      </div>
    </section>
    {/* ───────────── FAQ ───────────── */}
    <section className="section section--compact" aria-labelledby="faq-title">
      <div className="container faq-wrap">
        <header className="section-head" data-reveal>
          <p className="eyebrow">Before you begin</p>
          <h2 id="faq-title" className="h1">Frequently asked <em>questions</em></h2>
          <p>Something else on your mind? <Link className="text-link" href="/contact">Ask Jonathan directly.</Link></p>
        </header>
        <div className="faq" data-accordion data-reveal>
          <div className="faq__item">
            <h3><button className="faq__q" type="button" aria-expanded="false" aria-controls="faq-1">What does it cost?<span className="faq__icon" aria-hidden="true"></span></button></h3>
            <div className="faq__a" id="faq-1">
              <div>
                <p>The snapshot is free. Pricing for audits and ongoing services is based on dealership size. To get pricing, <Link className="text-link" href="/book">set an appointment</Link> or call <a className="text-link" href={SITE.phoneHref}>{SITE.phone}</a> to reach the MatchRV team. Booking a call does not start a subscription.</p>
              </div>
            </div>
          </div>
          <div className="faq__item">
            <h3><button className="faq__q" type="button" aria-expanded="false" aria-controls="faq-2">What does the report evaluate?<span className="faq__icon" aria-hidden="true"></span></button></h3>
            <div className="faq__a" id="faq-2">
              <div>
                <p>The report reviews dealership information, inventory accessibility, and specification gaps. The agreed scope determines which shopper questions and AI assistants are tested.</p>
              </div>
            </div>
          </div>
          <div className="faq__item">
            <h3><button className="faq__q" type="button" aria-expanded="false" aria-controls="faq-3">What can I learn from the free snapshot?<span className="faq__icon" aria-hidden="true"></span></button></h3>
            <div className="faq__a" id="faq-3">
              <div>
                <p>See what a sample of your public pages exposes and how Gemini answers one local shopper question. Every finding has a date and a defined scope. The full audit checks a broader agreed set of pages, units, and questions.</p>
              </div>
            </div>
          </div>
          <div className="faq__item">
            <h3><button className="faq__q" type="button" aria-expanded="false" aria-controls="faq-4">Will monthly management guarantee recommendations?<span className="faq__icon" aria-hidden="true"></span></button></h3>
            <div className="faq__a" id="faq-4">
              <div>
                <p>We manage the inventory data and connections in the agreed scope. AI assistants still choose their sources and recommendations.</p>
              </div>
            </div>
          </div>
          <div className="faq__item">
            <h3><button className="faq__q" type="button" aria-expanded="false" aria-controls="faq-5">How are findings supported?<span className="faq__icon" aria-hidden="true"></span></button></h3>
            <div className="faq__a" id="faq-5">
              <div>
                <p>A completed report should identify the pages reviewed, questions tested, dates, and observed answers. Missing or untested information is labeled, rather than treated as a positive result.</p>
              </div>
            </div>
          </div>
          <div className="faq__item">
            <h3><button className="faq__q" type="button" aria-expanded="false" aria-controls="faq-6">Why can answers differ between AI assistants?<span className="faq__icon" aria-hidden="true"></span></button></h3>
            <div className="faq__a" id="faq-6">
              <div>
                <p>Answers can change with the question, location, timing, available sources, and assistant. A report captures observations under its stated conditions and does not guarantee future recommendations.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
    <CtaReport/>
  </SiteLayout>;
}
