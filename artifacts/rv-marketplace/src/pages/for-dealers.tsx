import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Building2, Bot, Search, Scale, ArrowRight, Mail, CheckCircle2 } from "lucide-react";

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

        <section className="bg-primary text-primary-foreground rounded-2xl p-6 sm:p-8 mb-8">
          <h2 className="text-2xl font-display font-bold mb-3">
            Request your AI Visibility Report
          </h2>
          <p className="opacity-90 leading-relaxed mb-6 max-w-2xl">
            See how ChatGPT and Gemini see your dealership online today — and what it
            takes to make your inventory readable by AI agents. Free, no backend form
            required: just email us.
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
