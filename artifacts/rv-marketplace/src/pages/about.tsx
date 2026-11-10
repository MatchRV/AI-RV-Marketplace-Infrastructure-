import { Link } from "wouter";
import { SiteLayout } from "@/components/site/site-layout";
import { SEO } from "@/components/seo";
import { Icon } from "@/components/site/icon";

export function About() {
  return <SiteLayout>
    <SEO title="About MatchRV — Built from Experience. Built by Jonathan." description="Jonathan Kitchel founded MatchRV after eight years in the RV industry to help dealerships prepare their inventory for AI-powered discovery." canonical="/about"/>
    <section className="page-hero page-hero--split" aria-labelledby="page-title">
      <div className="page-hero__bg" aria-hidden="true">
        <div className="grain"></div>
      </div>
      <div className="container page-hero__grid">
        <div>
          <p className="eyebrow eyebrow--live">The person behind MatchRV</p>
          <h1 id="page-title" className="display display--md"><span className="line"><span>Built from experience.</span></span> <span className="line"><span><em>Built by Jonathan.</em></span></span></h1>
          <div className="hero__actions">
            <Link className="btn btn--primary btn--lg" href="/book">Book a call <Icon name="arrow"/></Link>
            <Link className="btn btn--ghost btn--lg" href="/visibility-report">View real report examples</Link>
          </div>
        </div>
        <figure className="portrait portrait--person" data-reveal>
          <img src="/images/site/jonathan-kitchel.webp" alt="Jonathan Kitchel, founder and builder of MatchRV" width="800" height="1200"/>
          <figcaption><strong>Jonathan Kitchel</strong> <span>Founder &amp; builder · MatchRV</span></figcaption>
        </figure>
      </div>
    </section>
    <section className="section theme-paper" aria-labelledby="story-title">
      <div className="container letter">
        <header data-reveal>
          <p className="eyebrow">Founder’s note</p>
          <h2 id="story-title" className="h2">Jonathan Kitchel</h2>
          <p className="muted">Founder &amp; builder · MatchRV</p>
        </header>
        <div className="letter__body" data-reveal>
          <p className="lead">I founded MatchRV after spending eight years in the RV industry and seeing a growing disconnect between how dealerships present inventory and how customers are beginning to shop.</p>
          <p>For decades, RV shopping relied on dealership websites, classified marketplaces, and conversations with salespeople. Today, buyers are increasingly turning to AI assistants to help answer questions like:</p>
          <ul className="asks">
            <li>“Which bunkhouse fits my family?”</li>
            <li>“What fifth wheel can my truck safely tow?”</li>
            <li>“Find me a diesel pusher with washer/dryer prep under $200,000.”</li>
          </ul>
          <p>The problem is that AI systems can only work with the information they can access and understand. When inventory data is incomplete, inconsistent, or poorly structured, great RVs become invisible before a customer ever contacts a dealership.</p>
          <p className="letter__punch">MatchRV was built to solve that problem.</p>
        </div>
      </div>
    </section>
    <section className="section" aria-labelledby="mission-title">
      <div className="container split">
        <header data-reveal>
          <p className="eyebrow">Our mission</p>
          <h2 id="mission-title" className="h1">Preparing inventory for <em>AI-powered discovery.</em></h2>
        </header>
        <div data-reveal>
          <p className="lead">Our mission is to help dealerships prepare their inventory not just for human shoppers, but for the next generation of AI-powered discovery systems.</p>
          <p>Through AI Visibility Reports, inventory enrichment, and structured data analysis, we help dealers understand what their listings communicate, what information is missing, and how that impacts discoverability.</p>
          <p>As technologies such as MCP (Model Context Protocol), UCP, AI agents, and conversational commerce become more common, inventory quality will increasingly determine which products get recommended, compared, and ultimately purchased.</p>
          <p>We’re building the bridge between dealership inventory and the emerging ecosystem of AI-powered shopping.</p>
        </div>
      </div>
    </section>
    <section className="section section--glow" aria-labelledby="layer-title">
      <div className="container statement statement--dark" data-reveal>
        <h2 id="layer-title" className="h1">MatchRV is building the infrastructure layer between dealership inventory and <em>the AI economy.</em></h2>
        <div className="statement__cols">
          <p>As shopping shifts from websites and search engines to AI assistants, agents, MCP servers, and conversational commerce platforms, inventory must become machine-readable, trustworthy, and discoverable.</p>
          <p>MatchRV helps dealerships measure, improve, and distribute inventory data so that AI systems can accurately understand, recommend, and match vehicles to buyers.</p>
        </div>
        <p className="statement__punch">We believe the dealers who prepare for this shift today will capture the customers of tomorrow.</p>
      </div>
    </section>
    <section className="section theme-paper" aria-labelledby="values-title">
      <div className="container">
        <h2 id="values-title" className="sr-only">How we work</h2>
        <ul className="covers covers--3" data-stagger>
          <li className="card" data-reveal data-spot><Icon name="user"/> <h3 className="h4">A person behind the work</h3> <p>Jonathan is the founder and builder of MatchRV. Your report conversation starts with the person responsible for the product.</p></li>
          <li className="card" data-reveal data-spot><Icon name="chart"/> <h3 className="h4">Evidence before promises</h3> <p>Counts, dated observations, and clear limitations come before scores. Reports identify practical improvements without promising AI rankings.</p></li>
          <li className="card" data-reveal data-spot><Icon name="route"/> <h3 className="h4">Built for the RV industry</h3> <p>The work centers on the inventory details dealerships publish and the real questions shoppers ask.</p></li>
        </ul>
        <div className="center-cta" data-reveal>
          <h2 className="h1">See the work. <em>Meet the builder.</em></h2>
          <p className="lead">Explore completed audit examples, then talk through what a report could cover for your dealership.</p>
          <div className="hero__actions hero__actions--center">
            <Link className="btn btn--primary btn--lg" href="/visibility-report">View real report examples <Icon name="arrow"/></Link>
            <Link className="btn btn--ghost btn--lg" href="/book">Book a call <Icon name="arrow"/></Link>
          </div>
        </div>
      </div>
    </section>
  </SiteLayout>;
}
