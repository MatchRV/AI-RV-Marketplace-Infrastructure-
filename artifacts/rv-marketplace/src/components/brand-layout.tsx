import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight } from "lucide-react";
import "@/styles/brand.css";
import { BrandNavDropdown } from "./brand-nav-dropdown";

export function BrandLayout({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  return <div className="matchrv-brand">
    <a className="brand-skip" href="#main-content">Skip to content</a>
    <header className="brand-header"><div className="brand-container brand-header-inner">
      <Link href="/" className="brand-logo" aria-label="MatchRV home"><img src="/images/matchrv-logo.jpg" alt="MatchRV" /></Link>
      <nav aria-label="Main navigation">
        <BrandNavDropdown label="Dealer Services" id="dealer-services-links" items={[
          { href: "/", title: "AI Visibility", description: "Reports and inventory improvements" },
          { href: "/advertising", title: "ChatGPT Advertising", description: "Reach shoppers in ChatGPT" },
        ]}/>
        <BrandNavDropdown label="Shop with Your AI" id="shop-ai-links" items={[
          { href: "/shop", title: "Shop with Your AI", description: "Explore a new way to find your RV" },
          { href: "/mcp-setup", title: "MCP Setup", description: "Connect MatchRV to your AI app" },
        ]}/>
        <Link href="/visibility-report" aria-current={path === "/visibility-report" ? "page" : undefined}>Report Examples</Link>
        <Link href="/about" aria-current={path === "/about" ? "page" : undefined}>About</Link>
      </nav>
      <Link href="/book" className="brand-button brand-header-cta">Book a Call <ArrowUpRight size={16}/></Link>
    </div></header>
    <main id="main-content">{children}</main>
    <footer className="brand-footer"><div className="brand-container">
      <div className="brand-footer-top"><Link href="/" className="brand-footer-logo" aria-label="MatchRV home"><img src="/images/matchrv-logo.jpg" alt="MatchRV" /></Link><p>AI visibility and advertising for RV dealerships.</p><Link href="/book">Book a report call <ArrowUpRight size={16}/></Link></div>
      <div className="brand-footer-bottom"><span>© {new Date().getFullYear()} MatchRV</span><nav aria-label="Footer"><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link><Link href="/terms-and-conditions">Terms</Link></nav></div>
    </div></footer>
  </div>;
}
