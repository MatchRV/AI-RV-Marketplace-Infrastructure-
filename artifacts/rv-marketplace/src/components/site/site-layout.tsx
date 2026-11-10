import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import "@/styles/site.css";
import { SITE } from "@/config/site";
import { initSiteEffects } from "@/lib/site-effects";
import { Icon, IconSprite, type IconName } from "./icon";
import { StatusPills } from "./blocks";

type NavGroup = "dealer" | "shop";
type NavItem = { href: string; title: string; note: string; icon: IconName };

const MENUS: Array<{ id: NavGroup; label: string; items: NavItem[] }> = [
  {
    id: "dealer",
    label: "Dealer Services",
    items: [
      { href: "/", title: "AI Visibility", note: "Reports and inventory improvements", icon: "eye" },
      { href: "/visibility-solution", title: "Visibility Solution", note: "Why dealers go unseen in AI, and the fix", icon: "route" },
      { href: "/lotai", title: "LotAI", note: "AI chat for your dealership website", icon: "chat" },
    ],
  },
  {
    id: "shop",
    label: "Shop with Your AI",
    items: [
      { href: "/shop", title: "Shop with Your AI", note: "Explore a new way to find your RV", icon: "chat" },
      { href: "/mcp-setup", title: "MCP Setup", note: "Connect MatchRV to your AI app", icon: "plug" },
    ],
  },
];
const LINKS = [
  { href: "/visibility-report", label: "Report Examples" },
  { href: "/about", label: "About" },
];

// useLayoutEffect warns during the prerender; the effect only matters in the browser.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

// Back/forward navigation keeps the browser's restored scroll position.
let arrivedViaHistory = false;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => { arrivedViaHistory = true; });
}

function NavMenu({ id, label, items, active, path }: { id: string; label: string; items: NavItem[]; active: boolean; path: string }) {
  const [open, setOpen] = useState(false);
  const item = useRef<HTMLLIElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!item.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  return <li
    ref={item}
    className={`nav__item has-menu${active ? " is-active" : ""}`}
    onMouseEnter={() => { if (canHover()) { window.clearTimeout(closeTimer.current); setOpen(true); } }}
    onMouseLeave={() => { if (canHover()) closeTimer.current = window.setTimeout(() => setOpen(false), 140); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") { setOpen(false); button.current?.focus(); } }}
  >
    {/* With a mouse the menu is already open from hover, so a click keeps it open; keyboard and touch toggle it. */}
    <button ref={button} className="nav__link" type="button" aria-expanded={open} aria-controls={`menu-${id}`} onClick={() => setOpen(canHover() && item.current?.matches(":hover") ? true : !open)}>{label}<Icon name="chevron" className="icon nav__chev"/></button>
    <div className="nav__menu" id={`menu-${id}`}>
      <div className="nav__panel">
        {items.map(entry => <Link key={entry.href} className="nav__card" href={entry.href} aria-current={path === entry.href ? "page" : undefined} onClick={() => setOpen(false)}>
          <span className="nav__card-icon"><Icon name={entry.icon}/></span>
          <span><strong>{entry.title}</strong><small>{entry.note}</small></span>
        </Link>)}
      </div>
    </div>
  </li>;
}

/**
 * Page shell for the marketing site: header, menus, footer, and the scroll
 * effects. `nav` marks which header menu the page belongs to.
 */
export function SiteLayout({ nav, home = false, children }: { nav?: NavGroup; home?: boolean; children: ReactNode }) {
  const [path] = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [enhanced, setEnhanced] = useState(false);
  const [menuShown, setMenuShown] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const current = (href: string) => (path === href ? "page" as const : undefined);

  // Scroll-reveal hides content until it enters the viewport. Turn that on
  // only once scripts run, so the prerendered page is fully visible without them.
  useBrowserLayoutEffect(() => { setEnhanced(true); }, []);

  useEffect(() => {
    if (!enhanced || !root.current) return;
    return initSiteEffects(root.current);
  }, [enhanced]);

  useEffect(() => {
    const viaHistory = arrivedViaHistory;
    arrivedViaHistory = false;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) {
      // The target may sit below images that are still loading.
      const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView(), 80);
      return () => window.clearTimeout(timer);
    }
    if (!viaHistory) window.scrollTo(0, 0);
    return undefined;
  }, []);

  function setMenu(open: boolean) {
    document.documentElement.classList.toggle("mrv-menu-open", open);
    if (open) {
      setMenuShown(true);
      requestAnimationFrame(() => setMenuOpen(true));
    } else {
      setMenuOpen(false);
      window.setTimeout(() => {
        if (!document.documentElement.classList.contains("mrv-menu-open")) setMenuShown(false);
      }, 300);
    }
  }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && document.documentElement.classList.contains("mrv-menu-open")) {
        setMenu(false);
        toggle.current?.focus();
      }
    };
    const wide = window.matchMedia("(min-width: 1081px)");
    const onWide = (event: MediaQueryListEvent) => { if (event.matches) setMenu(false); };
    document.addEventListener("keydown", escape);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", escape);
      wide.removeEventListener("change", onWide);
      document.documentElement.classList.remove("mrv-menu-open");
    };
  }, []);

  return <div ref={root} className={`mrv-site${home ? " page-home" : ""}${enhanced ? " js" : ""}`}>
    <IconSprite/>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="scroll-progress" aria-hidden="true"><span></span></div>

    <header className="site-header" data-header>
      <div className="container site-header__inner">
        <Link className="brand" href="/" aria-label="MatchRV home"><img src="/images/site/logo.webp" alt="MatchRV" width="640" height="193"/></Link>
        <nav className="nav" aria-label="Primary">
          <ul className="nav__list">
            {MENUS.map(menu => <NavMenu key={menu.id} id={menu.id} label={menu.label} items={menu.items} active={nav === menu.id} path={path}/>)}
            {LINKS.map(link => <li className="nav__item" key={link.href}><Link className="nav__link" href={link.href} aria-current={current(link.href)}>{link.label}</Link></li>)}
          </ul>
        </nav>
        <div className="site-header__actions">
          <Link className="btn btn--primary btn--sm" href="/book">Book a Call <Icon name="arrow"/></Link>
          <button ref={toggle} className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="mobile-menu" onClick={() => setMenu(!menuOpen)}>
            <span className="sr-only">Menu</span>
            <span className="menu-toggle__bars" aria-hidden="true"><i></i><i></i></span>
          </button>
        </div>
      </div>
    </header>

    <div className={`mobile-menu${menuOpen ? " is-open" : ""}`} id="mobile-menu" hidden={!menuShown} onClick={event => { if ((event.target as HTMLElement).closest("a")) setMenu(false); }}>
      <nav className="container" aria-label="Mobile">
        <ul className="mobile-menu__list">
          {MENUS.map(menu => <li key={menu.id}>
            <p className="mobile-menu__group">{menu.label}</p>
            <ul>
              {menu.items.map(entry => <li key={entry.href}><Link className="mobile-menu__link" href={entry.href} aria-current={current(entry.href)}>{entry.title}<small>{entry.note}</small></Link></li>)}
            </ul>
          </li>)}
          {LINKS.map(link => <li key={link.href}><Link className="mobile-menu__link" href={link.href} aria-current={current(link.href)}>{link.label}</Link></li>)}
          <li><Link className="mobile-menu__link" href="/contact" aria-current={current("/contact")}>Contact</Link></li>
        </ul>
        <Link className="btn btn--primary btn--lg" href="/book">Book a Call <Icon name="arrow"/></Link>
      </nav>
    </div>

    <main id="main-content">{children}</main>

    <footer className="site-footer">
      <div className="container">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <Link className="brand" href="/" aria-label="MatchRV home"><img src="/images/site/logo.webp" alt="MatchRV" width="640" height="193" loading="lazy"/></Link>
            <p>AI visibility for RV dealerships.</p>
            <StatusPills stacked/>
            <Link className="btn btn--primary" href="/book">Book a report call <Icon name="arrow"/></Link>
          </div>
          <nav className="site-footer__nav" aria-label="Footer">
            <div>
              <h2>Dealer Services</h2>
              <ul>
                <li><Link href="/">AI Visibility</Link></li>
                <li><Link href="/visibility-solution">Visibility Solution</Link></li>
                <li><Link href="/lotai">LotAI</Link></li>
                <li><Link href="/visibility-report">Report Examples</Link></li>
              </ul>
            </div>
            <div>
              <h2>Shop with Your AI</h2>
              <ul>
                <li><Link href="/shop">Shop with Your AI</Link></li>
                <li><a href="/shop#swipe">Swipe inventory</a></li>
                <li><Link href="/mcp-setup">MCP Setup</Link></li>
                <li><Link href="/match">Find my RV</Link></li>
              </ul>
            </div>
            <div>
              <h2>Company</h2>
              <ul>
                <li><Link href="/about">About</Link></li>
                <li><Link href="/contact">Contact</Link></li>
                <li><Link href="/privacy">Privacy</Link></li>
                <li><Link href="/terms">Terms</Link></li>
              </ul>
            </div>
          </nav>
        </div>
        <div className="site-footer__bottom">
          <p>© {new Date().getFullYear()} MatchRV</p>
          <p className="site-footer__contact"><a href={SITE.phoneHref}>{SITE.phone}</a><a href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
        </div>
      </div>
      <p className="site-footer__mark" aria-hidden="true">Match<span>RV</span></p>
    </footer>
  </div>;
}
