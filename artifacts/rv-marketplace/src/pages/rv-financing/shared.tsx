import { Link } from "wouter";
import { Button } from "@/components/ui-elements";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

const SITE = "https://matchrv.com";
const PUBLISHED = "2026-06-27";

export const FINANCING_DISCLAIMER =
  "MatchRV is not a lender and does not make credit decisions. Financing terms are determined by lenders, dealers, banks, credit unions, or other financial institutions.";

export interface Faq {
  question: string;
  answer: string;
}

export interface FinancingPage {
  path: string;
  title: string;
  short: string;
  blurb: string;
}

export const financingPages: FinancingPage[] = [
  {
    path: "/rv-financing",
    title: "RV Financing Made Simple",
    short: "RV Financing Hub",
    blurb: "Plain-English answers to the most common RV financing questions.",
  },
  {
    path: "/rv-financing/what-credit-score-do-you-need-to-buy-an-rv",
    title: "What Credit Score Do You Need to Buy an RV?",
    short: "Credit Score to Buy an RV",
    blurb: "What credit ranges lenders tend to look for — without approval promises.",
  },
  {
    path: "/rv-financing/bad-credit-rv-financing",
    title: "Can You Finance an RV With Bad Credit?",
    short: "Bad Credit RV Financing",
    blurb: "Realistic options and factors that shape lower-credit RV financing.",
  },
  {
    path: "/rv-financing/rv-loan-calculator",
    title: "RV Loan Calculator: Estimate Your Monthly Payment",
    short: "RV Loan Calculator",
    blurb: "Estimate a monthly payment from price, down payment, rate, and term.",
  },
  {
    path: "/rv-financing/find-rvs-by-monthly-payment",
    title: "Find RVs by Monthly Payment",
    short: "Find RVs by Monthly Payment",
    blurb: "Shop around a comfortable monthly payment, not just sticker price.",
  },
  {
    path: "/rv-financing/rv-pre-approval-before-shopping",
    title: "Should You Get Pre-Approved Before Shopping for an RV?",
    short: "RV Pre-Approval",
    blurb: "Why pre-approval can clarify your budget before you contact dealers.",
  },
  {
    path: "/rv-financing/used-rv-financing",
    title: "Can You Finance a Used RV?",
    short: "Used RV Financing",
    blurb: "What lenders weigh when financing an older or used RV.",
  },
];

export function pageByPath(path: string): FinancingPage | undefined {
  return financingPages.find((p) => p.path === path);
}

export function breadcrumbsFor(path: string) {
  const crumbs = [
    { name: "Home", href: "/" },
    { name: "RV Financing", href: "/rv-financing" },
  ];
  if (path !== "/rv-financing") {
    const page = pageByPath(path);
    if (page) crumbs.push({ name: page.short, href: page.path });
  }
  return crumbs;
}

// ── Structured data (no FinancialProduct / LoanOrCredit — MatchRV is not a lender) ──
export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "MatchRV",
  url: SITE,
  logo: `${SITE}/matchrv-logo-dark.png`,
  description:
    "MatchRV is an RV marketplace that helps buyers find the right RV faster by matching shoppers with RVs based on budget, location, RV type, lifestyle needs, travel plans, buying readiness, and financing awareness. MatchRV is not a lender and does not make credit decisions.",
  founder: { "@type": "Person", name: "Jonathan Kitchel" },
  areaServed: "US",
};

export const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "MatchRV",
  url: SITE,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE}/browse?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export function articleSchema(path: string, description: string) {
  const page = pageByPath(path);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page?.title ?? "RV Financing",
    description,
    url: `${SITE}${path}`,
    mainEntityOfPage: `${SITE}${path}`,
    datePublished: PUBLISHED,
    dateModified: PUBLISHED,
    author: { "@type": "Organization", name: "MatchRV", url: SITE },
    publisher: {
      "@type": "Organization",
      name: "MatchRV",
      logo: { "@type": "ImageObject", url: `${SITE}/matchrv-logo-dark.png` },
    },
  };
}

// ── Reusable UI building blocks ──
export function DirectAnswer({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-10">
      <div className="flex items-center gap-2 text-primary mb-2">
        <Sparkles className="w-4 h-4" />
        <span className="text-xs font-bold uppercase tracking-widest">Quick Answer</span>
      </div>
      <div className="text-base sm:text-lg text-foreground leading-relaxed [&_p+p]:mt-3">
        {children}
      </div>
    </div>
  );
}

export function FaqSection({ faqs }: { faqs: Faq[] }) {
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-display font-bold mb-6">Frequently Asked Questions</h2>
      <div className="space-y-4">
        {faqs.map((f) => (
          <div key={f.question} className="bg-card border border-border rounded-2xl p-6">
            <h3 className="text-base font-semibold mb-2">{f.question}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{f.answer}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function FinancingCta({
  heading = "Ready to shop smarter?",
  body = "MatchRV matches you with RVs based on your budget, monthly payment goals, RV type, location, and lifestyle — so you can shop with a number in mind before you ever contact a dealer.",
}: {
  heading?: string;
  body?: string;
}) {
  return (
    <section className="mt-14 bg-primary text-primary-foreground rounded-3xl p-8 sm:p-10 text-center">
      <h2 className="text-2xl sm:text-3xl font-display font-bold mb-3 text-primary-foreground">
        {heading}
      </h2>
      <p className="max-w-2xl mx-auto opacity-90 mb-6 leading-relaxed">{body}</p>
      <Link href="/match">
        <Button
          size="lg"
          className="bg-white text-primary hover:bg-white/90 inline-flex items-center gap-2"
        >
          Find RVs That Fit Your Budget <ArrowRight className="w-5 h-5" />
        </Button>
      </Link>
    </section>
  );
}

export function FinancingDisclaimer() {
  return (
    <div className="mt-12 bg-muted/50 border border-border rounded-2xl p-6">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-2">
        <ShieldCheck className="w-4 h-4 text-primary" /> Important Disclaimer
      </h2>
      <p className="text-xs text-muted-foreground leading-relaxed">{FINANCING_DISCLAIMER}</p>
    </div>
  );
}

export function RelatedFinancingLinks({ currentPath }: { currentPath: string }) {
  const others = financingPages.filter((p) => p.path !== currentPath);
  return (
    <section className="mt-14">
      <h2 className="text-2xl font-display font-bold mb-6">More RV Financing Resources</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        {others.map((p) => (
          <Link
            key={p.path}
            href={p.path}
            className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-sm transition-all"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                  {p.short}
                </h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{p.blurb}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
