import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Link } from "wouter";
import { Compass, TrendingDown, Shield, Building2, ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui-elements";

export function About() {
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Jonathan Kitchel",
    "jobTitle": "Founder",
    "worksFor": { "@type": "Organization", "name": "MatchRV" },
    "description": "Jonathan Kitchel spent 8 years on the floor at Poulsbo RV, one of the largest RV dealerships in the United States, before founding MatchRV.",
  };
  const orgSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "MatchRV",
    "url": "https://matchrv.com",
    "logo": "https://matchrv.com/matchrv-logo.png",
    "description": "MatchRV is an AI-powered RV marketplace based in the Pacific Northwest. It connects buyers with 7,500+ live listings from Pacific Northwest dealers through personalized AI matching.",
    "foundingLocation": { "@type": "Place", "name": "Pacific Northwest, Washington State, USA" },
    "founder": { "@type": "Person", "name": "Jonathan Kitchel" },
  };

  return (
    <Layout>
      <SEO
        title="About MatchRV — Built by Someone Who Lived It"
        description="MatchRV was founded by Jonathan Kitchel, who spent 8 years on the floor at Poulsbo RV. He saw firsthand where dealerships were losing buyers and built something better."
        canonical="https://matchrv.com/about"
        jsonLd={[personSchema, orgSchema]}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Compass className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">About MatchRV</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Built by someone who lived it.
          </p>
        </div>

        <div className="space-y-8">

          <section className="bg-card border border-border rounded-2xl p-6 sm:p-8">
            <div className="flex items-start gap-5">
              <div className="shrink-0 w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-8 h-8 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-2xl font-display font-bold">Jonathan Kitchel</h2>
                  <span className="text-sm text-muted-foreground font-medium">· Founder</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>8 years at Poulsbo RV — one of the largest RV dealerships in the country</span>
                </div>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>
                    MatchRV was founded by Jonathan Kitchel — not a tech outsider who stumbled into the RV industry, but someone who spent 8 years on the floor at Poulsbo RV, one of the largest RV dealerships in the country.
                  </p>
                  <p>
                    Jonathan didn't just sell RVs. He built the tools dealers actually needed — websites, apps, and SaaS solutions that solved real operational problems from the inside. He saw firsthand where dealerships were losing buyers, burning time, and leaving money on the table because the software they were using wasn't built for how dealers actually work.
                  </p>
                  <p className="font-medium text-foreground">
                    So he built something better.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-primary text-primary-foreground rounded-2xl p-6 sm:p-8">
            <h2 className="text-2xl font-display font-bold mb-4">The Platform</h2>
            <p className="leading-relaxed opacity-90">
              MatchRV is the dealer-first inventory and sales platform for the RV industry. Designed for multi-location dealers, white-label portals, and the way modern buyers shop — MatchRV connects inventory to buyers faster, cleaner, and without the bloat of legacy platforms.
            </p>
            <p className="leading-relaxed opacity-90 mt-4">
              This isn't a side project. It's the platform Jonathan wished existed when he was in the business — now built to scale across the industry.
            </p>
          </section>

          <section className="bg-card border border-border rounded-2xl p-6 sm:p-8">
            <h2 className="text-2xl font-display font-bold mb-6">How Deal Scoring Works</h2>
            <p className="text-muted-foreground leading-relaxed mb-6">
              Every listing on MatchRV gets an automated deal score comparing the asking price against our estimated market value. We analyze comparable sales, market trends, and listing specifics to generate a fair estimate.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <h4 className="font-semibold text-green-900">Great Deal</h4>
                </div>
                <p className="text-sm text-green-800">10%+ below market value. These are the listings worth acting on fast.</p>
              </div>
              <div className="bg-lime-50 border border-lime-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-lime-500" />
                  <h4 className="font-semibold text-lime-900">Good Deal</h4>
                </div>
                <p className="text-sm text-lime-800">5–10% below market value. A solid price with room for further negotiation.</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <h4 className="font-semibold text-yellow-900">Fair Deal</h4>
                </div>
                <p className="text-sm text-yellow-800">Within 5% of market value. Competitively priced for the current market.</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <h4 className="font-semibold text-red-900">High Price / Overpriced</h4>
                </div>
                <p className="text-sm text-red-800">Above market value. Room to negotiate or consider other options.</p>
              </div>
            </div>
          </section>

          <section className="bg-card border border-border rounded-2xl p-6 sm:p-8">
            <h2 className="text-2xl font-display font-bold mb-6">Why It's Different</h2>
            <div className="grid sm:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <TrendingDown className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">Price Transparency</h4>
                <p className="text-sm text-muted-foreground">See exactly how each listing compares to market value — no guesswork, no games.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Shield className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">Built From the Inside</h4>
                <p className="text-sm text-muted-foreground">Not built by outsiders guessing at the industry — built by someone who worked it for 8 years.</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold mb-1">Dealer-First Design</h4>
                <p className="text-sm text-muted-foreground">Designed for how dealers actually work — multi-location, fast-moving inventory, real buyers.</p>
              </div>
            </div>
          </section>

          <div className="text-center">
            <Link href="/browse">
              <Button size="lg" className="gap-2">
                Explore Inventory <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

        </div>
      </div>
    </Layout>
  );
}
