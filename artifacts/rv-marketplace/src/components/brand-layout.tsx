import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import "@/styles/brand.css";

export function BrandLayout({ children }: { children: ReactNode }) {
  const [path] = useLocation();
  const shop = path === "/shop";
  const [servicesOpen, setServicesOpen] = useState(false);
  const services = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { setServicesOpen(false); }, [path]);
  useEffect(() => {
    if (!servicesOpen) return;
    const outside = (event: PointerEvent) => {
      if (!services.current?.contains(event.target as Node)) setServicesOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setServicesOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [servicesOpen]);
  return <div className="matchrv-brand">
    <a className="brand-skip" href="#main-content">Skip to content</a>
    <header className="brand-header"><div className="brand-container brand-header-inner">
      <Link href="/" className="brand-logo" aria-label="MatchRV home"><img src="/images/matchrv-logo.jpg" alt="MatchRV" /></Link>
      <nav aria-label="Main navigation">
        <div className="brand-services" ref={services} onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setServicesOpen(false);
        }}>
          <button ref={trigger} className={`brand-services-trigger ${path === "/" || path === "/advertising" ? "active" : ""}`} aria-expanded={servicesOpen} aria-controls="dealer-services-links" onClick={() => setServicesOpen(!servicesOpen)}>
            Dealer Services <ChevronDown size={15} aria-hidden="true"/>
          </button>
          <div id="dealer-services-links" className="brand-services-links" hidden={!servicesOpen}>
            <Link href="/" aria-current={path === "/" ? "page" : undefined} onClick={() => setServicesOpen(false)}><strong>AI Visibility</strong><span>Reports and inventory improvements</span></Link>
            <Link href="/advertising" aria-current={path === "/advertising" ? "page" : undefined} onClick={() => setServicesOpen(false)}><strong>ChatGPT &amp; Google Ads</strong><span>Advertising for RV dealerships</span></Link>
          </div>
        </div>
        <Link href="/shop" aria-current={shop ? "page" : undefined} className={shop ? "active" : ""}>Shop with Your AI</Link>
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
