import { Link } from "wouter";
import { SiteLayout } from "@/components/site/site-layout";
import { SEO } from "@/components/seo";
import { Icon } from "@/components/site/icon";
import { StatusPills } from "@/components/site/blocks";
import { InventoryCoverage, TypeCount } from "@/components/inventory-coverage";

export function Shop() {
  return <SiteLayout nav="shop">
    <SEO title="Shop with Your AI — A New Way to Discover RVs" description="Tell an AI assistant about the people you travel with, your budget, and the adventures you have in mind. MatchRV helps connect those conversations to real RV inventory." canonical="/shop"/>
    <section className="page-hero" aria-labelledby="page-title">
      <div className="page-hero__bg" aria-hidden="true">
        <div className="grain"></div>
      </div>
      <div className="container">
        <p className="eyebrow eyebrow--live">A new way to discover RVs</p>
        <h1 id="page-title" className="display display--md"><span className="line"><span>Your next RV search starts</span></span> <span className="line"><span><em>by talking to AI.</em></span></span></h1>
        <p className="lead">Tell an assistant about the people you travel with, your budget, and the adventures you have in mind. The search should begin with your life, not a maze of filters.</p>
        <div className="hero__actions">
          <Link className="btn btn--primary btn--lg" href="/mcp-setup">Connect MatchRV to your AI <Icon name="arrow"/></Link>
          <a className="btn btn--ghost btn--lg" href="#swipe">Swipe inventory</a>
        </div>
        <StatusPills/>
        <InventoryCoverage/>
        <div className="assistants" data-reveal>
          <ul>
            <li><img src="/images/ai-brands/openai.svg" alt="" width="20" height="20"/> ChatGPT</li>
            <li><img src="/images/ai-brands/gemini-color.svg" alt="" width="20" height="20"/> Gemini</li>
            <li><img src="/images/ai-brands/claude-color.svg" alt="" width="20" height="20"/> Claude</li>
            <li><img src="/images/ai-brands/copilot-color.svg" alt="" width="20" height="20"/> Copilot</li>
            <li><img src="/images/ai-brands/grok.svg" alt="" width="20" height="20"/> Grok</li>
            <li><img src="/images/ai-brands/perplexity-color.svg" alt="" width="20" height="20"/> Perplexity</li>
          </ul>
          <p className="fine">These are examples of AI assistants people use. Logos do not indicate a partnership. See where MatchRV is available below.</p>
        </div>
      </div>
    </section>
    <section className="section theme-paper" aria-labelledby="statement-title">
      <div className="container statement" data-reveal>
        <h2 id="statement-title" className="h1">When shoppers ask AI what RV fits their life, MatchRV helps <em>connect those conversations to inventory.</em></h2>
        <div className="statement__cols">
          <p>We’re building the data and connections that can help AI understand real RV listings, find relevant options, and explain the trade-offs.</p>
          <p>That starts with structured, consistent inventory information that stays current as prices, specifications, and availability change.</p>
        </div>
      </div>
    </section>
    <section className="section" aria-labelledby="ask-title">
      <div className="container">
        <header className="section-head" data-reveal>
          <p className="eyebrow">Imagine asking</p>
          <h2 id="ask-title" className="h1">Start with a question <em>in your own words.</em></h2>
        </header>
        <ol className="quotes" data-stagger>
          <li className="card" data-reveal data-spot><span className="card__num">01</span> <blockquote>“We have two kids and want a bunkhouse travel trailer under $40,000. What should we look for?”</blockquote></li>
          <li className="card" data-reveal data-spot><span className="card__num">02</span> <blockquote>“Which RVs are short enough for national park campgrounds but still have room for our family?”</blockquote></li>
          <li className="card" data-reveal data-spot><span className="card__num">03</span> <blockquote>“We like to camp off-grid. Show me RVs with solar, lithium, and enough fresh water for a long weekend.”</blockquote></li>
        </ol>
      </div>
    </section>
    {/* ───────────── Swipe inventory ───────────── */}
    <section className="section theme-paper" id="swipe" aria-labelledby="swipe-title">
      <div className="container swipe">
        <div className="swipe__copy" data-reveal>
          <p className="eyebrow">Already know what you want?</p>
          <h2 id="swipe-title" className="h1">Swipe to find <em>your RV.</em></h2>
          <p className="lead">If you already know the type or make of RV you’re after, skip the questions and swipe through dealer inventory one RV at a time.</p>
          <ol className="swipe__steps">
            <li><span>1</span><div><strong>Set your filters.</strong> RV type, price range, length, and how far you’ll travel.</div></li>
            <li><span>2</span><div><strong>Swipe right to like, left to pass.</strong> Your likes stay when you change filters.</div></li>
            <li><span>3</span><div><strong>Compare your likes</strong> side by side when you’re ready.</div></li>
          </ol>
          <div className="hero__actions">
            <Link className="btn btn--primary btn--lg" href="/swipe">Start swiping <Icon name="arrow"/></Link>
            <Link className="btn btn--ghost btn--lg" href="/match">Help me choose instead</Link>
          </div>
          <p className="fine">Inventory and availability can change. Confirm details with the dealer.</p>
        </div>
        <div className="deck" data-swipe data-reveal>
          <p className="deck__label"><span>Try it</span> Swipe through RV types. Photos are real RVs on dealer lots. The full deck shows individual RVs.</p>
          <ul className="deck__stack" aria-label="RV types to swipe through">
            <li className="deck__card" data-type="travel_trailer" data-name="Travel trailers"><span className="deck__stamp deck__stamp--like" aria-hidden="true">Like</span><span className="deck__stamp deck__stamp--pass" aria-hidden="true">Pass</span> <img className="deck__photo" src="/images/site/lot/travel-trailer.webp" alt="Travel trailer parked on a dealer lot" width="720" height="540" loading="lazy" draggable="false"/> <h3 className="deck__name">Travel trailers</h3> <p className="deck__count"><TypeCount type="travel_trailer"/> in the MatchRV inventory network</p></li>
            <li className="deck__card" data-type="fifth_wheel" data-name="Fifth wheels"><span className="deck__stamp deck__stamp--like" aria-hidden="true">Like</span><span className="deck__stamp deck__stamp--pass" aria-hidden="true">Pass</span> <img className="deck__photo" src="/images/site/lot/fifth-wheel.webp" alt="Fifth wheel with its slide-outs open on a dealer lot" width="720" height="540" loading="lazy" draggable="false"/> <h3 className="deck__name">Fifth wheels</h3> <p className="deck__count"><TypeCount type="fifth_wheel"/> in the MatchRV inventory network</p></li>
            <li className="deck__card" data-type="class_c" data-name="Class C motorhomes"><span className="deck__stamp deck__stamp--like" aria-hidden="true">Like</span><span className="deck__stamp deck__stamp--pass" aria-hidden="true">Pass</span> <img className="deck__photo" src="/images/site/lot/class-c.webp" alt="Class C motorhome on a dealer lot at night" width="720" height="540" loading="lazy" draggable="false"/> <h3 className="deck__name">Class C motorhomes</h3> <p className="deck__count"><TypeCount type="class_c"/> in the MatchRV inventory network</p></li>
            <li className="deck__card" data-type="toy_hauler" data-name="Toy haulers"><span className="deck__stamp deck__stamp--like" aria-hidden="true">Like</span><span className="deck__stamp deck__stamp--pass" aria-hidden="true">Pass</span> <img className="deck__photo" src="/images/site/lot/toy-hauler.webp" alt="Toy hauler fifth wheel on a dealer lot" width="720" height="540" loading="lazy" draggable="false"/> <h3 className="deck__name">Toy haulers</h3> <p className="deck__count"><TypeCount type="toy_hauler"/> in the MatchRV inventory network</p></li>
            <li className="deck__card" data-type="class_a" data-name="Class A motorhomes"><span className="deck__stamp deck__stamp--like" aria-hidden="true">Like</span><span className="deck__stamp deck__stamp--pass" aria-hidden="true">Pass</span> <img className="deck__photo" src="/images/site/lot/class-a.webp" alt="Class A diesel motorhome on a dealer lot" width="720" height="540" loading="lazy" draggable="false"/> <h3 className="deck__name">Class A motorhomes</h3> <p className="deck__count"><TypeCount type="class_a"/> in the MatchRV inventory network</p></li>
            <li className="deck__card" data-type="class_b" data-name="Class B camper vans"><span className="deck__stamp deck__stamp--like" aria-hidden="true">Like</span><span className="deck__stamp deck__stamp--pass" aria-hidden="true">Pass</span> <img className="deck__photo" src="/images/site/lot/class-b.webp" alt="Class B camper van on a dealer lot" width="720" height="540" loading="lazy" draggable="false"/> <h3 className="deck__name">Class B camper vans</h3> <p className="deck__count"><TypeCount type="class_b"/> in the MatchRV inventory network</p></li>
            <li className="deck__card" data-type="truck_camper" data-name="Truck campers"><span className="deck__stamp deck__stamp--like" aria-hidden="true">Like</span><span className="deck__stamp deck__stamp--pass" aria-hidden="true">Pass</span> <img className="deck__photo" src="/images/site/lot/truck-camper.webp" alt="Truck camper on stands on a dealer lot" width="720" height="540" loading="lazy" draggable="false"/> <h3 className="deck__name">Truck campers</h3> <p className="deck__count"><TypeCount type="truck_camper"/> in the MatchRV inventory network</p></li>
            <li className="deck__card" data-type="popup_camper" data-name="Pop-up campers"><span className="deck__stamp deck__stamp--like" aria-hidden="true">Like</span><span className="deck__stamp deck__stamp--pass" aria-hidden="true">Pass</span> <img className="deck__photo" src="/images/site/lot/popup-camper.webp" alt="Pop-up camper set up on a dealer lot" width="720" height="540" loading="lazy" draggable="false"/> <h3 className="deck__name">Pop-up campers</h3> <p className="deck__count"><TypeCount type="popup_camper"/> in the MatchRV inventory network</p></li>
          </ul>
          <div className="deck__done" hidden>
            <img className="deck__done-photo" src="/images/site/lot/class-a-red.webp" alt="Tiffin motorhome on a dealer lot" width="720" height="540" loading="lazy"/>
            <h3 className="h3" data-deck-summary>Nice picks.</h3>
            <p data-deck-list></p>
            <Link className="btn btn--primary" href="/swipe">Swipe real RVs <Icon name="arrow"/></Link>
            <button className="btn btn--ghost" type="button" data-deck-reset>Start over</button>
          </div>
          <div className="deck__controls">
            <button className="deck__btn deck__btn--pass" type="button" data-deck-pass aria-label="Pass"><Icon name="x"/></button>
            <p className="deck__hint">Drag the card, or use the buttons or arrow keys</p>
            <button className="deck__btn deck__btn--like" type="button" data-deck-like aria-label="Like"><Icon name="heart"/></button>
          </div>
          <p className="sr-only" role="status" aria-live="polite" data-deck-status></p>
        </div>
      </div>
    </section>
    <section className="section" aria-labelledby="pipeline-title">
      <div className="container">
        <h2 id="pipeline-title" className="sr-only">How fragmented dealer inventory becomes structured information AI tools can use</h2>
        <figure className="pipeline" data-reveal>
          <div className="pipeline__stage pipeline__stage--raw">
            <p className="eyebrow">Dealer inventory today</p>
            <div className="pipeline__mess" aria-hidden="true">
              <span>Inconsistent model names</span>
              <span>Missing specifications</span>
              <span>Unformatted descriptions</span>
              <span>Different listing fields</span>
            </div>
            <p className="sr-only">Inconsistent model names, missing specifications, unformatted descriptions, and different listing fields.</p>
          </div>
          <div className="pipeline__arrow" aria-hidden="true">
            <span>Structure</span>
            <i></i>
            <span>Normalize</span>
            <i></i>
            <span>Monitor</span>
          </div>
          <div className="pipeline__stage pipeline__stage--clean">
            <p className="eyebrow">Clear fields AI can use</p>
            <dl className="pipeline__fields">
              <div>
                <dt>price</dt>
                <dd></dd>
              </div>
              <div>
                <dt>floorplan</dt>
                <dd></dd>
              </div>
              <div>
                <dt>sleeping_capacity</dt>
                <dd></dd>
              </div>
              <div>
                <dt>length</dt>
                <dd></dd>
              </div>
              <div>
                <dt>weight</dt>
                <dd></dd>
              </div>
              <div>
                <dt>features</dt>
                <dd></dd>
              </div>
              <div>
                <dt>availability</dt>
                <dd></dd>
              </div>
            </dl>
          </div>
          <figcaption className="fine">MatchRV’s vision for making RV inventory easier for AI to understand. Diagram is conceptual.</figcaption>
        </figure>
      </div>
    </section>
    <section className="section theme-paper" aria-labelledby="infra-title">
      <div className="container">
        <header className="section-head section-head--split" data-reveal>
          <div>
            <p className="eyebrow">Beyond the Report</p>
            <h2 id="infra-title" className="h1">The inventory infrastructure <em>between dealerships and AI</em></h2>
          </div>
          <div>
            <p className="lead">Your dealership already has a website. Preparing its inventory for AI-powered shopping takes more: complete details, consistent fields, standardized descriptions, and ongoing checks as listings change.</p>
            <p>MatchRV is building a path from identifying those gaps to improving the inventory data behind them.</p>
          </div>
        </header>
        <ul className="covers covers--4" data-stagger>
          <li className="card" data-reveal data-spot><Icon name="chat"/> <h3 className="h4">AI-Ready Inventory</h3> <p>Prepare inventory records so AI shopping assistants can understand and compare RVs.</p></li>
          <li className="card" data-reveal data-spot><Icon name="layers"/> <h3 className="h4">Structured Inventory</h3> <p>Organize price, floorplan, sleeping capacity, length, weight, features, and availability into clear fields.</p></li>
          <li className="card" data-reveal data-spot><Icon name="list"/> <h3 className="h4">Normalized Inventory</h3> <p>Standardize inconsistent model names, specifications, terminology, and listing fields.</p></li>
          <li className="card" data-reveal data-spot><Icon name="eye"/> <h3 className="h4">Visibility Monitoring</h3> <p>Check changing inventory for missing or incomplete information that could affect AI discovery.</p></li>
        </ul>
      </div>
    </section>
    <section className="section" aria-labelledby="path-title">
      <div className="container">
        <header className="section-head section-head--center" data-reveal>
          <p className="eyebrow">The path MatchRV is building</p>
          <h2 id="path-title" className="h1">From dealership inventory <em>to qualified shopper</em></h2>
        </header>
        <ol className="route" data-route>
          <li className="route__phase" aria-hidden="true">Data phase</li>
          <li className="route__stop" data-reveal><span>01</span><div><h3 className="h4">Dealer Inventory</h3><p>Raw, messy dealership data.</p></div></li>
          <li className="route__stop" data-reveal><span>02</span><div><h3 className="h4">AI Visibility Report</h3><p>Identifying critical gaps in pricing, specifications, and weights.</p></div></li>
          <li className="route__stop" data-reveal><span>03</span><div><h3 className="h4">Inventory Enrichment</h3><p>Transforming messy dealer data into structured schemas.</p></div></li>
          <li className="route__stop" data-reveal><span>04</span><div><h3 className="h4">AI-Ready Inventory</h3><p>Creating machine-readable records that allow AI to compare units and reason over specs.</p></div></li>
          <li className="route__phase route__phase--warm" aria-hidden="true">Consumer phase</li>
          <li className="route__stop route__stop--warm" data-reveal><span>05</span><div><h3 className="h4">MatchRV Inventory Network</h3><p>Distributing enriched inventory to the AI platforms where modern shoppers begin research.</p></div></li>
          <li className="route__stop route__stop--warm" data-reveal><span>06</span><div><h3 className="h4">AI Shopping Experiences</h3><p>Engaging shoppers in conversational discovery.</p></div></li>
          <li className="route__stop route__stop--warm" data-reveal><span>07</span><div><h3 className="h4">Qualified Shopper</h3><p>Shoppers matched to relevant inventory.</p></div></li>
          <li className="route__stop route__stop--warm" data-reveal><span>08</span><div><h3 className="h4">Dealer Lead</h3><p>Connecting interested shoppers with the dealership.</p></div></li>
        </ol>
        <p className="fine center">MatchRV’s planned inventory-to-shopper journey.</p>
        <div className="center-cta" data-reveal>
          <h2 className="h2">Find the gaps. Improve the data. <em>Prepare for AI discovery.</em></h2>
          <a className="btn btn--primary btn--lg" href="/#request-report">Start With an AI Visibility Report <Icon name="arrow"/></a>
        </div>
      </div>
    </section>
    <section className="section theme-paper" aria-labelledby="soon-title">
      <div className="container duo" data-stagger>
        <article className="duo__main" data-reveal>
          <p className="eyebrow">Where MatchRV is available</p>
          <h2 id="soon-title" className="h1">Meet shoppers where <em>their search begins.</em></h2>
          <p className="lead">MatchRV connects shopper questions with RV inventory inside the AI tools people already use.</p>
          <ul className="avail">
            <li className="avail__item avail__item--live"><i></i><div><strong>Live in ChatGPT plugins</strong><span>Ask ChatGPT to use MatchRV to search and compare RVs.</span></div></li>
            <li className="avail__item avail__item--pending"><i></i><div><strong>In final approval on Muse</strong><span>Submitted and in the last review step.</span></div></li>
            <li className="avail__item avail__item--live"><i></i><div><strong>Any MCP-compatible AI app</strong><span>Connect it yourself in a few minutes. <Link className="text-link" href="/mcp-setup">MCP setup</Link></span></div></li>
            <li className="avail__item avail__item--soon"><i></i><div><strong>Google UCP</strong><span>Coming soon.</span></div></li>
          </ul>
        </article>
        <article className="tile" data-reveal>
          <h3 className="h3">Are you an RV dealership?</h3>
          <p className="tile__links"><Link className="link-arrow" href="/">See how visible your inventory is to AI <Icon name="arrow"/></Link></p>
        </article>
      </div>
    </section>
  </SiteLayout>;
}
