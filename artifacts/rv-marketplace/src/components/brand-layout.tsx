import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight } from "lucide-react";
import "@/styles/brand.css";

export function BrandLayout({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const shop = path === "/shop";
  return <div className="matchrv-brand">
    <a className="brand-skip" href="#main-content">Skip to content</a>
    <header className="brand-header"><div className="brand-container brand-header-inner">
      <Link href="/" className="brand-logo" aria-label="MatchRV home"><img src="/images/matchrv-logo.jpg" alt="MatchRV" /></Link>
      <nav aria-label="Main navigation">
        <Link href="/" aria-current={!shop ? "page" : undefined} className={!shop ? "active" : ""}>Dealer AI Visibility</Link>
        <Link href="/shop" aria-current={shop ? "page" : undefined} className={shop ? "active" : ""}>AI RV Shop</Link>
      </nav>
      <Link href="/#request-report" className="brand-button brand-header-cta">Get Visibility Report <ArrowUpRight size={16}/></Link>
    </div></header>
    <main id="main-content">{children}</main>
    <footer className="brand-footer"><div className="brand-container">
      <div className="brand-footer-top"><Link href="/" className="brand-footer-logo" aria-label="MatchRV home"><img src="/images/matchrv-logo.jpg" alt="MatchRV" /></Link><p>Dealer AI visibility. Evidence-backed inventory improvements.</p><Link href="/#request-report">Request a dealership report <ArrowUpRight size={16}/></Link></div>
      <div className="brand-footer-bottom"><span>© {new Date().getFullYear()} MatchRV</span><nav aria-label="Footer"><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link><Link href="/terms-and-conditions">Terms</Link></nav></div>
    </div></footer>
  </div>;
}
