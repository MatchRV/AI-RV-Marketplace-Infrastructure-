import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import {
  Building2,
  Bot,
  Search,
  Scale,
  ArrowRight,
  Mail,
  CheckCircle2,
  MessageSquare,
  Quote,
  XCircle,
} from "lucide-react";

const REPORT_MAILTO =
  "mailto:jonathan@matchrv.com?subject=AI%20Visibility%20Report%20Request&body=Hi%20Jonathan%2C%0A%0AI%27d%20like%20an%20AI%20Visibility%20Report%20for%20our%20dealership.%0A%0ADealership%20name%3A%0AWebsite%20%2F%20inventory%20URL%3A%0ACity%2C%20State%3A%0A%0AThanks%21";

const TALK_MAILTO =
  "mailto:jonathan@matchrv.com?subject=Talk%20to%20MatchRV%20%E2%80%94%20Dealer%20AI%20Inventory";

export function ForDealers() {
  return (
    <Layout>
      <SEO
        title="For RV Dealers — AI-Ready Inventory for ChatGPT & Gemini"
        description="Make your RV inventory readable by ChatGPT and Gemini. MatchRV is the AI-ready inventory network for RV dealers — MCP / AI agents can search and tow-check real dealer units."
        canonical="/for-dealers"
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Building2 className="w-8 h-8 text-primary" />
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-primary mb-3">
            For RV Dealers
          </p>
          <h1 className="text-3xl sm:text-5xl font-display font-bold mb-4 leading-tight">
            Make your inventory readable by ChatGPT and Gemini
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            The AI-ready inventory network for RV dealers
          </p>
        </div>

        <section className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-8">
          <div className="flex items-start gap-4 mb-4">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold mb-2">
                Built for AI agents — not another listing dump
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                MCP / AI agents (ChatGPT, Gemini) can search &amp; tow-check real dealer
                units on MatchRV. When a shopper asks an AI for an RV that fits their
                truck, budget, and trip, your inventory can answer — with typed
                constraints, not scraped HTML guesses.
              </p>
            </div>
          </div>
        </section>

        <section className="grid sm:grid-cols-3 gap-4 mb-10">
          <div className="bg-card border border-border rounded-2xl p-5">
            <Search className="w-5 h-5 text-primary mb-3" />
            <h3 className="font-display font-bold mb-1">Searchable by AI</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Structured inventory so agents find the right unit, not a wall of PDFs.
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5">
            <Scale className="w-5 h-5 text-primary mb-3" />
            <h3 className="font-display font-bold mb-1">Tow-check ready</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Agents can check tow fit against real specs before a buyer walks the lot.
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-5">
            <CheckCircle2 className="w-5 h-5 text-primary mb-3" />
            <h3 className="font-display font-bold mb-1">Dealer-first B2B</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This page is for dealerships. No consumer browse grid — just AI visibility.
            </p>
          </div>
        </section>

        {/* Citation evidence: what AI already answers (anonymized, observed behavior) */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold">What AI already answers</h2>
          </div>
          <p className="text-muted-foreground leading-relaxed mb-5 max-w-2xl">
            Shoppers near Fife, WA and across the Puget Sound are already asking ChatGPT
            and Claude for dealers, ratings, and specific units — before they ever visit a
            lot. AI is the front door.
          </p>

          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex justify-end">
              <div className="max-w-[85%] sm:max-w-[75%] bg-primary/10 rounded-2xl rounded-br-md px-4 py-3">
                <p className="text-sm font-medium leading-relaxed">
                  New travel trailers near Fife, WA under $75k that sleep 8?
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="shrink-0 w-8 h-8 rounded-lg bg-muted flex items-center justify-center mt-0.5">
                <Quote className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 bg-muted/50 border border-border rounded-2xl rounded-tl-md px-4 py-3 space-y-3">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Here are dealers and units that often surface for shoppers in that area:
                </p>
                <ul className="text-sm space-y-2">
                  <li className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-4">
                    <span className="font-semibold">Dealer A</span>
                    <span className="text-muted-foreground">
                      4.6★ · 180+ reviews · BBB A+
                    </span>
                  </li>
                  <li className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-0.5 sm:gap-4">
                    <span className="font-semibold">Dealer B</span>
                    <span className="text-muted-foreground">
                      4.4★ · 90+ reviews · listed with price
                    </span>
                  </li>
                  <li className="pt-1 border-t border-border/60">
                    <span className="text-muted-foreground">Sample units cited: </span>
                    <span className="font-medium">travel trailer · $17,999</span>
                    <span className="text-muted-foreground"> · </span>
                    <span className="font-medium">fifth wheel · $64,999</span>
                  </li>
                </ul>
              </div>
            </div>

            <p className="text-xs text-muted-foreground italic pt-1">
              Illustrative of real shopper queries observed in 2026 — not MatchRV answers.
              Dealer names anonymized.
            </p>
          </div>
        </section>

        {/* Who shows up / who doesn't — pattern language only */}
        <section className="mb-10">
          <h2 className="text-2xl font-display font-bold mb-2">
            Who shows up / who doesn&apos;t
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-5 max-w-2xl">
            When AI answers those queries, citations skew to signals machines can read.
            Incomplete inventory pages get skipped — or caveated with &ldquo;call first /
            price not shown.&rdquo;
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-2xl p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                <h3 className="font-display font-bold">Shows up</h3>
              </div>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">·</span>
                  Review volume (stars + count on review / list pages)
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">·</span>
                  BBB / accreditation signals
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">·</span>
                  OEM and dealer list pages machines can cite
                </li>
                <li className="flex gap-2">
                  <span className="text-primary font-bold shrink-0">·</span>
                  Inventory pages with price + specs
                </li>
              </ul>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <XCircle className="w-5 h-5 text-muted-foreground" />
                <h3 className="font-display font-bold">Gets skipped</h3>
              </div>
              <ul className="space-y-2.5 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-bold shrink-0">·</span>
                  Empty shells / thin dealer sites
                </li>
                <li className="flex gap-2">
                  <span className="font-bold shrink-0">·</span>
                  Missing price or key specs
                </li>
                <li className="flex gap-2">
                  <span className="font-bold shrink-0">·</span>
                  Laggy or stale listings
                </li>
                <li className="flex gap-2">
                  <span className="font-bold shrink-0">·</span>
                  Mixed signals that force &ldquo;call before you drive&rdquo;
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="bg-primary text-primary-foreground rounded-2xl p-6 sm:p-8 mb-8">
          <h2 className="text-2xl font-display font-bold mb-3">
            See if your rooftop appears
          </h2>
          <p className="opacity-90 leading-relaxed mb-6 max-w-2xl">
            Request a free AI Visibility Report. We show what ChatGPT and Claude surface
            for shoppers in your market today — including empty-shell and missing-spec
            findings — and what it takes to make your inventory readable by AI agents.
            No backend form required: just email us.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a
              href={REPORT_MAILTO}
              className="inline-flex items-center justify-center gap-2 bg-white text-primary px-6 py-3.5 rounded-lg font-bold hover:brightness-95 active:scale-[0.98] transition-all min-h-[48px]"
            >
              <Mail className="w-5 h-5" />
              Request AI Visibility Report
              <ArrowRight className="w-4 h-4" />
            </a>
            <a
              href={TALK_MAILTO}
              className="inline-flex items-center justify-center gap-2 border-2 border-white/40 text-white px-6 py-3.5 rounded-lg font-bold hover:bg-white/10 active:scale-[0.98] transition-all min-h-[48px]"
            >
              Talk to MatchRV
            </a>
          </div>
          <p className="mt-4 text-sm opacity-75">
            Or email{" "}
            <a href="mailto:jonathan@matchrv.com" className="underline font-medium">
              jonathan@matchrv.com
            </a>{" "}
            directly.
          </p>
        </section>

        <p className="text-center text-sm text-muted-foreground">
          Already a partner?{" "}
          <a href="/dealers/login" className="text-primary font-medium hover:underline">
            Dealer portal login
          </a>
        </p>
      </div>
    </Layout>
  );
}
