import { Link, useLocation } from "wouter";
import { Menu, X, Search, Heart, User, LogOut, Bookmark, Bell, MessageSquare, Settings, Map, Compass, Sparkles, Home, Send, Loader2, Mic, MicOff, HelpCircle, AlertTriangle, Zap } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Button } from "./ui-elements";
import { cn, formatCurrency, formatRvType } from "@/lib/utils";
import { useAppAuth } from "@/contexts/auth-context";
import { SearchOverlay } from "./search-overlay";
import { useChatSession } from "@/hooks/use-chat-session";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import type { ExpansionSuggestion } from "@/hooks/use-chat-session";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const { user, isAuthenticated, login, logout, messageCount, savedCount, savedSearches } = useAppAuth();
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  const navLinks: Array<{ href: string; label: string; badge?: string }> = [
    { href: "/shop", label: "Agent Shop", badge: "NEW" },
    { href: "/browse", label: "Browse RVs" },
    { href: "/match", label: "Match Report" },
    { href: "/find-the-right-rv-for-your-tow-vehicle", label: "Tow Match" },
    { href: "/campgrounds", label: "Campgrounds" },
    { href: "/guides", label: "Buyers Guide" },
    { href: "/sell", label: "Sell Your RV (Owner)" },
    { href: "/dealers", label: "For Dealers" },
  ];

  const bottomNavLinks = [
    { href: "/match", label: "Match", icon: Sparkles },
    { href: "/browse", label: "Browse", icon: Home },
    { href: "/discover", label: "Discover", icon: Compass },
    { href: "/trips", label: "Trips", icon: Map },
    { href: "/saved", label: "Saved", icon: Heart },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#0B1117]/95 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 md:h-20">
            <Link href="/" className="flex items-center group" aria-label="MatchRV home">
              <img
                src="/matchrv-logo-dark.png"
                alt="MatchRV"
                className="h-20 md:h-24 w-auto object-contain"
              />
            </Link>

            <nav className="hidden md:flex items-center gap-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm font-bold transition-colors hover:text-[#00CED1] relative py-2",
                    location === link.href ? "text-[#00CED1] font-black" : "text-white/70"
                  )}
                >
                  {link.label}
                  {link.badge && (
                    <span className="absolute -top-1 -right-6 bg-accent text-accent-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {link.badge}
                    </span>
                  )}
                </Link>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-3">
              <button onClick={() => setIsSearchOpen(true)} className="text-white/50 hover:text-white transition-colors p-2" aria-label="Search">
                <Search className="w-5 h-5" />
              </button>
              <Link href="/saved">
                <button className={cn(
                  "transition-colors p-2 relative",
                  location === "/saved" ? "text-[#00CED1]" : "text-white/50 hover:text-white"
                )} aria-label="Saved listings">
                  <Heart className="w-5 h-5" />
                  {savedCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                      {savedCount}
                    </span>
                  )}
                </button>
              </Link>
              <div className="h-6 w-px bg-border mx-1" />
              {!isAuthenticated && (
                <Link href="/match">
                  <button className="bg-[#00CED1] text-[#0B1117] px-5 py-2 rounded font-bold text-sm glow-cyan hover:brightness-110 active:scale-95 transition-all">
                    Get Match Report
                  </button>
                </Link>
              )}
              {isAuthenticated ? (
                <div className="relative" ref={userMenuRef}>
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2 p-1.5 rounded-full hover:bg-muted transition-colors"
                    aria-label="User menu"
                  >
                    {user?.profileImageUrl ? (
                      <img src={user.profileImageUrl} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-primary/20" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="w-4 h-4 text-primary" />
                      </div>
                    )}
                  </button>
                  {isUserMenuOpen && (
                    <div className="absolute right-0 top-12 w-56 bg-white border border-[#E2E8F0] rounded-xl shadow-2xl py-2 z-50">
                      <div className="px-4 py-2 border-b border-[#E2E8F0]">
                        <p className="text-sm font-medium text-[#161d1d] truncate">{user?.firstName} {user?.lastName}</p>
                        <p className="text-xs text-[#3b4949] truncate">{user?.email}</p>
                      </div>
                      <Link href="/account" onClick={() => setIsUserMenuOpen(false)}>
                        <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#3b4949] hover:bg-muted hover:text-[#161d1d] transition-colors cursor-pointer font-medium">
                          <Settings className="w-4 h-4" /> My Account
                        </div>
                      </Link>
                      <div className="border-t border-[#E2E8F0] mx-3 my-1" />
                      <Link href="/saved" onClick={() => setIsUserMenuOpen(false)}>
                        <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-[#3b4949] hover:bg-muted hover:text-[#161d1d] transition-colors cursor-pointer">
                          <Heart className="w-4 h-4" /> Saved Listings
                          {savedCount > 0 && (
                            <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{savedCount}</span>
                          )}
                        </div>
                      </Link>
                      <Link href="/searches" onClick={() => setIsUserMenuOpen(false)}>
                        <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer">
                          <Bookmark className="w-4 h-4" /> My Searches
                        </div>
                      </Link>
                      {savedSearches.length > 0 && (
                        <div className="border-t border-border/50 mx-3 my-1">
                          {savedSearches.map((s) => {
                            const params = new URLSearchParams();
                            if (s.filters) Object.entries(s.filters).forEach(([k, v]) => { if (v != null) params.set(k, String(v)); });
                            const href = `/browse${params.toString() ? `?${params.toString()}` : ""}`;
                            return (
                              <Link key={s.id} href={href} onClick={() => setIsUserMenuOpen(false)}>
                                <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
                                  <Search className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{s.name}</span>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                      <Link href="/alerts" onClick={() => setIsUserMenuOpen(false)}>
                        <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer">
                          <Bell className="w-4 h-4" /> Price Alerts
                        </div>
                      </Link>
                      <Link href="/messages" onClick={() => setIsUserMenuOpen(false)}>
                        <div className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors cursor-pointer">
                          <MessageSquare className="w-4 h-4" /> Messages
                          {messageCount > 0 && (
                            <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{messageCount}</span>
                          )}
                        </div>
                      </Link>
                      <div className="border-t border-border mt-1 pt-1">
                        <button onClick={logout} className="flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-muted transition-colors w-full text-left">
                          <LogOut className="w-4 h-4" /> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button className="hidden lg:flex items-center gap-2 text-white/70 font-bold text-sm hover:text-[#00CED1] transition-colors" onClick={login}>
                  <User className="w-4 h-4" /> Sign In
                </button>
              )}
            </div>

            {/* Mobile header right: search + hamburger */}
            <div className="md:hidden flex items-center gap-1">
              <button onClick={() => setIsSearchOpen(true)} className="p-2.5 text-white/60" aria-label="Search">
                <Search className="w-5 h-5" />
              </button>
              <button
                className="p-2.5 text-white/60"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                aria-label="Menu"
              >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile slide-down menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-white/10 bg-[#0B1117] absolute w-full shadow-2xl z-50">
            <div className="px-4 pt-3 pb-6 space-y-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center justify-between px-4 py-3.5 rounded-xl text-base font-semibold transition-colors",
                    location === link.href ? "bg-white/10 text-[#00CED1]" : "text-white/70 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {link.label}
                  {link.badge && (
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full font-bold",
                      location === link.href ? "bg-white/20 text-white" : "bg-accent text-accent-foreground"
                    )}>
                      {link.badge}
                    </span>
                  )}
                </Link>
              ))}

              <div className="pt-3 mt-2 border-t border-white/10 space-y-1">
                {isAuthenticated ? (
                  <>
                    <div className="px-4 py-2">
                      <p className="text-sm font-semibold text-white">{user?.firstName} {user?.lastName}</p>
                      <p className="text-xs text-white/50">{user?.email}</p>
                    </div>
                    <Link href="/account" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white">
                      <Settings className="w-4 h-4" /> My Account
                    </Link>
                    <Link href="/alerts" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white">
                      <Bell className="w-4 h-4" /> Price Alerts
                    </Link>
                    <Link href="/messages" className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white/70 hover:bg-white/5 hover:text-white">
                      <MessageSquare className="w-4 h-4" /> Messages
                      {messageCount > 0 && (
                        <span className="ml-auto bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{messageCount}</span>
                      )}
                    </Link>
                    <button onClick={logout} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-white/5 w-full text-left">
                      <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                  </>
                ) : (
                  <button onClick={login} className="w-full bg-[#00CED1] text-[#0B1117] py-3.5 rounded-xl font-bold text-sm glow-cyan">
                    Sign In to MatchRV
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 flex flex-col pb-16 md:pb-0">
        {children}
      </main>

      <SearchOverlay isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      <OutfitterFAB />

      {/* Mobile bottom navigation bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0B1117]/95 backdrop-blur-md border-t border-white/10 safe-area-pb">
        <div className="flex items-stretch">
          {bottomNavLinks.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href === "/browse" && location.startsWith("/listing"));
            return (
              <Link key={href} href={href} className="flex-1">
                <div className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2.5 px-1 transition-colors",
                  active ? "text-[#00CED1]" : "text-white/40"
                )}>
                  <div className="relative">
                    <Icon className={cn("w-5 h-5", active && "stroke-[2.5]")} />
                    {href === "/saved" && savedCount > 0 && (
                      <span className="absolute -top-1 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full min-w-[14px] text-center leading-tight">
                        {savedCount}
                      </span>
                    )}
                  </div>
                  <span className={cn("text-[10px] font-semibold leading-none", active ? "font-black" : "")}>{label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>

      <footer className="bg-[#0B1117] w-full py-16 px-4 sm:px-8 mt-auto hidden md:block">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 max-w-7xl mx-auto">
          <div className="col-span-2 space-y-5">
            <img src="/matchrv-logo-dark.png" alt="MatchRV" className="h-14 w-auto object-contain" />
            <p className="text-white/60 text-sm leading-relaxed">AI-powered RV marketplace. Smarter shopping, selling, matching, and dealer tools — all in one place.</p>
          </div>
          <div>
            <h6 className="font-display font-bold text-[#00CED1] mb-5 text-sm uppercase tracking-widest">Browse by Type</h6>
            <ul className="space-y-3 text-sm text-white/60">
              <li><Link href="/rvs-for-sale" className="hover:text-[#00CED1] transition">All RVs for Sale</Link></li>
              <li><Link href="/travel-trailers-for-sale" className="hover:text-[#00CED1] transition">Travel Trailers</Link></li>
              <li><Link href="/fifth-wheels-for-sale" className="hover:text-[#00CED1] transition">Fifth Wheels</Link></li>
              <li><Link href="/class-a-rvs-for-sale" className="hover:text-[#00CED1] transition">Class A Motorhomes</Link></li>
              <li><Link href="/class-b-rvs-for-sale" className="hover:text-[#00CED1] transition">Class B Campervans</Link></li>
              <li><Link href="/class-c-rvs-for-sale" className="hover:text-[#00CED1] transition">Class C Motorhomes</Link></li>
              <li><Link href="/toy-haulers-for-sale" className="hover:text-[#00CED1] transition">Toy Haulers</Link></li>
            </ul>
          </div>
          <div>
            <h6 className="font-display font-bold text-[#00CED1] mb-5 text-sm uppercase tracking-widest">Buyer Resources</h6>
            <ul className="space-y-3 text-sm text-white/60">
              <li><Link href="/guides" className="hover:text-[#00CED1] transition">Buyer Guides</Link></li>
              <li><Link href="/guides/how-to-buy-a-used-rv" className="hover:text-[#00CED1] transition">How to Buy a Used RV</Link></li>
              <li><Link href="/guides/best-rvs-for-families" className="hover:text-[#00CED1] transition">Best RVs for Families</Link></li>
              <li><Link href="/guides/motorhome-vs-travel-trailer" className="hover:text-[#00CED1] transition">Motorhome vs Trailer</Link></li>
              <li><Link href="/rv-financing" className="hover:text-[#00CED1] transition">RV Financing</Link></li>
              <li><Link href="/guides/towing-guide" className="hover:text-[#00CED1] transition">Towing Guide</Link></li>
              <li><Link href="/rv-dealers" className="hover:text-[#00CED1] transition">RV Dealers</Link></li>
            </ul>
          </div>
          <div>
            <h6 className="font-display font-bold text-[#00CED1] mb-5 text-sm uppercase tracking-widest">Company</h6>
            <ul className="space-y-3 text-sm text-white/60">
              <li><Link href="/about" className="hover:text-[#00CED1] transition">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-[#00CED1] transition">Contact</Link></li>
              <li><Link href="/dealers/login" className="hover:text-[#00CED1] transition">For Dealers</Link></li>
              <li><Link href="/outfitter" className="hover:text-[#00CED1] transition">AI Outfitter</Link></li>
              <li><Link href="/trips" className="hover:text-[#00CED1] transition">Trip Planner</Link></li>
              <li><Link href="/campgrounds" className="hover:text-[#00CED1] transition">Campgrounds</Link></li>
              <li><Link href="/sell" className="hover:text-[#00CED1] transition">Sell Your RV</Link></li>
            </ul>
          </div>
          <div>
            <h6 className="font-display font-bold text-[#00CED1] mb-5 text-sm uppercase tracking-widest">Newsletter</h6>
            <p className="text-sm text-white/60 mb-4">New listings, deal alerts, and RV tips — straight to your inbox.</p>
            <div className="relative">
              <input
                type="email"
                placeholder="Your email"
                aria-label="Newsletter email"
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/40 rounded px-5 py-3 focus:ring-2 focus:ring-[#00CED1] outline-none text-sm"
              />
              <button className="absolute right-2 top-1.5 bg-[#00CED1] text-[#0B1117] px-4 py-1.5 rounded text-xs font-bold hover:bg-[#009fa2] transition-colors">
                Join
              </button>
            </div>
          </div>
        </div>
        <div className="max-w-7xl mx-auto border-t border-white/10 mt-14 pt-8 flex flex-col sm:flex-row justify-between items-center text-xs text-white/40 gap-4">
          <span>&copy; {new Date().getFullYear()} MatchRV. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/terms-and-conditions" className="hover:text-[#00CED1]">Terms and Conditions</Link>
            <Link href="/privacy" className="hover:text-[#00CED1]">Privacy</Link>
          </div>
        </div>
      </footer>

      {/* Mobile footer (compact) */}
      <footer className="md:hidden bg-[#0B1117] w-full py-8 px-4 mb-16">
        <img src="/matchrv-logo-dark.png" alt="MatchRV" className="h-10 w-auto object-contain mb-3" />
        <p className="text-white/50 text-xs mb-4">AI-powered RV marketplace. Smarter shopping and selling.</p>
        <div className="flex gap-4 text-xs text-white/50">
          <Link href="/terms-and-conditions" className="hover:text-[#00CED1]">Terms</Link>
          <Link href="/privacy" className="hover:text-[#00CED1]">Privacy</Link>
          <Link href="/about" className="hover:text-[#00CED1]">About</Link>
          <Link href="/contact" className="hover:text-[#00CED1]">Contact</Link>
        </div>
        <p className="text-[10px] text-white/30 mt-3">&copy; {new Date().getFullYear()} MatchRV</p>
      </footer>
    </div>
  );
}

// ── Floating RV Outfitter button + chat drawer ────────────────────────────────
const FAB_QUESTIONS = [
  { label: "Help me find my perfect RV", icon: Heart },
  { label: "What's the difference between RV types?", icon: HelpCircle },
  { label: "What should I look for in a used RV?", icon: Search },
  { label: "Can I full-time in an RV?", icon: Zap },
];

function OutfitterFAB() {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(true);

  const { messages, sendMessage, isTyping, recommendations, noMatch, expansionSuggestions, messagesEndRef } = useChatSession();
  const { isAuthenticated, login } = useAppAuth();
  const { status: micStatus, toggle: toggleMic } = useSpeechToText({
    onResult: (transcript) => setInput((prev) => prev ? `${prev} ${transcript}` : transcript),
  });

  useEffect(() => { setIsOpen(false); }, [location]);
  useEffect(() => { if (messages.length > 1) setShowSuggestions(false); }, [messages]);

  if (location === "/outfitter" || location.startsWith("/dealers")) return null;

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || isTyping) return;
    setInput("");
    await sendMessage(text);
  };

  const handleSuggestionClick = (q: string) => {
    setShowSuggestions(false);
    sendMessage(q);
  };

  return (
    <>
      {/* Floating pill trigger */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Open RV Outfitter"
          className="fixed bottom-[4.75rem] right-4 md:bottom-8 md:right-6 z-40 flex items-center gap-2.5 bg-[#0B1117] text-white pl-3.5 pr-5 py-3 rounded shadow-2xl hover:bg-[#002829] hover:scale-[1.03] active:scale-95 transition-all"
        >
          <div className="w-7 h-7 rounded-full bg-[#00CED1]/20 flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-[#00CED1]" />
          </div>
          <div className="flex flex-col items-start leading-none">
            <span className="text-[11px] text-[#00CED1] font-black tracking-tight">Ask me anything!</span>
            <span className="text-[10px] text-white/60 mt-0.5">I'm your RV outfitter</span>
          </div>
        </button>
      )}

      {/* Open drawer */}
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <div className="md:hidden fixed inset-0 z-[55] bg-black/40" onClick={() => setIsOpen(false)} />

          {/* Panel — bottom sheet on mobile, card on desktop */}
          <div
            className="fixed z-[60] flex flex-col bg-white border border-[#E2E8F0] shadow-2xl bottom-0 left-0 right-0 rounded-t-2xl md:bottom-6 md:left-auto md:right-6 md:w-96 md:rounded-2xl"
            style={{ height: "min(84vh, 620px)" }}
          >
            {/* Header */}
            <div className="bg-[#0B1117] text-white px-4 py-3 flex items-center gap-3 flex-shrink-0 rounded-t-2xl">
              <div className="w-8 h-8 rounded-full bg-[#00CED1]/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-[#00CED1]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black leading-tight">RV Outfitter</p>
                <p className="text-[11px] text-white/60">Your AI guide to the perfect RV</p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto bg-[#f4fbfa] px-4 py-4 flex flex-col gap-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "assistant" && (
                    <div className="w-6 h-6 rounded-full bg-[#0B1117] flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                      <Zap className="w-3 h-3 text-[#00CED1]" />
                    </div>
                  )}
                  <div className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                    msg.role === "user"
                      ? "bg-[#0B1117] text-white rounded-br-sm"
                      : "bg-white border border-[#E2E8F0] text-[#161d1d] rounded-bl-sm shadow-sm"
                  )}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="w-6 h-6 rounded-full bg-[#0B1117] flex items-center justify-center flex-shrink-0 mr-2">
                    <Zap className="w-3 h-3 text-[#00CED1]" />
                  </div>
                  <div className="bg-white border border-[#E2E8F0] rounded-2xl rounded-bl-sm px-4 py-2.5 shadow-sm">
                    <div className="flex gap-1 items-center h-4">
                      {[0, 150, 300].map((d) => (
                        <div key={d} className="w-1.5 h-1.5 bg-[#6b7a7a] rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Suggested starter questions */}
              {showSuggestions && messages.length <= 1 && !isTyping && (
                <div className="mt-1">
                  <p className="text-xs text-[#6b7a7a] mb-2 font-medium">Try asking:</p>
                  <div className="flex flex-col gap-1.5">
                    {FAB_QUESTIONS.map((q) => {
                      const Icon = q.icon;
                      return (
                        <button
                          key={q.label}
                          onClick={() => handleSuggestionClick(q.label)}
                          className="text-left px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-xs text-[#161d1d] hover:border-[#0B1117] hover:bg-[#00CED1]/5 transition flex items-start gap-2"
                        >
                          <Icon className="w-3.5 h-3.5 text-[#0B1117] flex-shrink-0 mt-0.5" />
                          <span>{q.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No-match nudge */}
              {noMatch && !isTyping && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-800 text-xs mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> No exact matches right now
                  </div>
                  {expansionSuggestions.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {expansionSuggestions.map((s: ExpansionSuggestion, i: number) => (
                        <button key={i} onClick={() => sendMessage(s.message ?? s.label)}
                          className="text-left px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-semibold text-amber-800 hover:bg-amber-100 transition">
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Recommendations */}
              {recommendations.length > 0 && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#0B1117]" />
                    <span className="text-xs font-black text-[#161d1d]">Your Matches</span>
                  </div>
                  {!isAuthenticated ? (
                    <div className="bg-white border border-[#0B1117]/20 rounded-2xl p-4 text-center">
                      <p className="font-black text-sm text-[#161d1d] mb-1">Matches ready!</p>
                      <p className="text-xs text-[#6b7a7a] mb-3">Sign in to see your {recommendations.length} personalized RV picks.</p>
                      <button onClick={login} className="w-full py-2.5 rounded-xl bg-[#0B1117] text-white font-black text-xs hover:bg-[#002829] transition">
                        Sign In to View
                      </button>
                    </div>
                  ) : (
                    <>
                      {(recommendations as Record<string, unknown>[]).slice(0, 3).map((rec) => (
                        <Link key={String(rec.id)} href={`/listing/${rec.id}`} onClick={() => setIsOpen(false)}>
                          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden hover:border-[#0B1117] transition cursor-pointer">
                            <div className="flex">
                              <div className="w-20 h-20 flex-shrink-0 bg-[#eef5f4]">
                                {Array.isArray(rec.images) && rec.images[0] ? (
                                  <img src={String(rec.images[0])} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-[#6b7a7a] text-[10px]">No photo</div>
                                )}
                              </div>
                              <div className="flex-1 p-2.5 min-w-0">
                                <p className="text-[10px] text-[#6b7a7a] truncate">{formatRvType(String(rec.type))}</p>
                                <p className="text-xs font-bold text-[#161d1d] truncate">{rec.year} {rec.make} {rec.model}</p>
                                <p className="text-sm font-black text-[#0B1117] mt-1">{formatCurrency(Number(rec.price))}</p>
                                {rec.whyMatch && (
                                  <p className="text-[10px] text-[#6b7a7a] mt-0.5 line-clamp-1">{String(rec.whyMatch)}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                      <Link href="/match" onClick={() => setIsOpen(false)}>
                        <button className="w-full mt-1 py-2.5 rounded-xl bg-[#0B1117] text-white font-black text-xs hover:bg-[#002829] transition flex items-center justify-center gap-1.5">
                          <Heart className="w-3.5 h-3.5" /> Get Full Match Report
                        </button>
                      </Link>
                    </>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <div className="bg-white border-t border-[#E2E8F0] px-3 py-3 flex-shrink-0">
              <form onSubmit={handleSend} className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={micStatus === "listening" ? "Listening…" : "Ask anything about RVs…"}
                  className={cn(
                    "flex-1 px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none bg-[#f4fbfa] transition",
                    micStatus === "listening" ? "border-red-400 bg-red-50" : "border-[#E2E8F0] focus:border-[#0B1117]"
                  )}
                  disabled={isTyping}
                />
                {micStatus !== "unsupported" && (
                  <button
                    type="button"
                    onClick={toggleMic}
                    disabled={isTyping}
                    className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition flex-shrink-0 disabled:opacity-40",
                      micStatus === "listening" ? "bg-red-500 text-white animate-pulse" : "bg-[#eef5f4] text-[#3b4949] hover:bg-[#E2E8F0]"
                    )}
                  >
                    {micStatus === "listening" ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!input.trim() || isTyping}
                  className="w-10 h-10 rounded-xl bg-[#0B1117] text-white flex items-center justify-center hover:bg-[#002829] transition flex-shrink-0 disabled:opacity-40"
                >
                  {isTyping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
