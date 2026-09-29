import { Link } from "wouter";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";

export function About() {
  return <BrandLayout><SEO title="About Jonathan Kitchel, Founder of MatchRV" description="Meet Jonathan Kitchel, the RV industry professional who founded and built MatchRV to help dealerships make their inventory easier for AI shoppers to understand." canonical="/about"/>
    <section className="brand-container brand-section"><p className="brand-eyebrow">The person behind MatchRV</p><h1>Built from experience.<br/>Built by Jonathan.</h1>
      <div className="founder-grid">
        <img className="founder-photo" src="/jonathan-kitchel-headshot.jpg" alt="Jonathan Kitchel, founder and builder of MatchRV" width="1024" height="1536" />
        <article>
          <h2>Jonathan Kitchel</h2>
          <p className="brand-eyebrow">Founder &amp; builder · MatchRV</p>
          <p className="brand-lead">I founded MatchRV after spending eight years in the RV industry and seeing a growing disconnect between how dealerships present inventory and how customers are beginning to shop.</p>
          <p>For decades, RV shopping relied on dealership websites, classified marketplaces, and conversations with salespeople. Today, buyers are increasingly turning to AI assistants to help answer questions like:</p>
          <ul className="founder-questions">
            <li>“Which bunkhouse fits my family?”</li>
            <li>“What fifth wheel can my truck safely tow?”</li>
            <li>“Find me a diesel pusher with washer/dryer prep under $200,000.”</li>
          </ul>
          <p>The problem is that AI systems can only work with the information they can access and understand. When inventory data is incomplete, inconsistent, or poorly structured, great RVs become invisible before a customer ever contacts a dealership.</p>
          <p><strong>MatchRV was built to solve that problem.</strong></p>
        </article>
      </div>
      <section className="founder-mission" aria-labelledby="founder-mission-heading">
        <p className="brand-eyebrow">Our mission</p>
        <h2 id="founder-mission-heading">Preparing inventory for AI-powered discovery.</h2>
        <p>Our mission is to help dealerships prepare their inventory not just for human shoppers, but for the next generation of AI-powered discovery systems. Through AI Visibility Reports, inventory enrichment, and structured data analysis, we help dealers understand what their listings communicate, what information is missing, and how that impacts discoverability.</p>
        <p>As technologies such as MCP (Model Context Protocol), UCP, AI agents, and conversational commerce become more common, inventory quality will increasingly determine which products get recommended, compared, and ultimately purchased.</p>
        <p>We're building the bridge between dealership inventory and the emerging ecosystem of AI-powered shopping.</p>
        <h2>MatchRV is building the infrastructure layer between dealership inventory and the AI economy.</h2>
        <p>As shopping shifts from websites and search engines to AI assistants, agents, MCP servers, and conversational commerce platforms, inventory must become machine-readable, trustworthy, and discoverable.</p>
        <p>MatchRV helps dealerships measure, improve, and distribute inventory data so that AI systems can accurately understand, recommend, and match vehicles to buyers.</p>
        <p><strong>We believe the dealers who prepare for this shift today will capture the customers of tomorrow.</strong></p>
      </section>
      <div className="coverage-grid brand-section"><article className="coverage-card"><h3>A person behind the work</h3><p>Jonathan is the founder and builder of MatchRV. Your report conversation starts with the person responsible for the product.</p></article><article className="coverage-card"><h3>Evidence before promises</h3><p>Counts, dated observations, and clear limitations come before scores. Reports identify practical improvements without promising AI rankings.</p></article><article className="coverage-card"><h3>Built for the RV industry</h3><p>The work centers on the inventory details dealerships publish and the real questions shoppers ask.</p></article></div>
      <div className="report-bottom"><h2>See the work. Meet the builder.</h2><p>Explore completed audit examples, then talk through what a report could cover for your dealership.</p><Link className="brand-button" href="/visibility-report">View real report examples →</Link> <Link className="brand-button" href="/book">Book a call →</Link></div>
    </section></BrandLayout>;
}
