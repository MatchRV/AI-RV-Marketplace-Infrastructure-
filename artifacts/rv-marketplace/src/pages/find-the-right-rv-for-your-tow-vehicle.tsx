import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Button } from "@/components/ui-elements";
import {
  Truck,
  ArrowRight,
  Gauge,
  Scale,
  Users,
  Package,
  Droplets,
  CheckCircle2,
  MapPin,
} from "lucide-react";
import {
  DirectAnswer,
  FaqSection,
  ORGANIZATION_SCHEMA,
  WEBSITE_SCHEMA,
  type Faq,
} from "./rv-financing/shared";

const PATH = "/find-the-right-rv-for-your-tow-vehicle";
const SITE = "https://matchrv.com";

const DESCRIPTION =
  "Shop RVs that match your tow vehicle, towing capacity, budget, and camping lifestyle. MatchRV helps buyers avoid buying the wrong RV.";

const breadcrumbs = [
  { name: "Home", href: "/" },
  { name: "Find the Right RV for Your Tow Vehicle", href: PATH },
];

const ARTICLE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Find the Right RV for Your Tow Vehicle",
  description: DESCRIPTION,
  url: `${SITE}${PATH}`,
  mainEntityOfPage: `${SITE}${PATH}`,
  datePublished: "2026-07-01",
  dateModified: "2026-07-01",
  author: { "@type": "Organization", name: "MatchRV", url: SITE },
  publisher: {
    "@type": "Organization",
    name: "MatchRV",
    logo: { "@type": "ImageObject", url: `${SITE}/matchrv-logo-dark.png` },
  },
};

const WEIGHT_FACTORS = [
  {
    icon: Scale,
    title: "GVWR, not dry weight",
    body: "Dry weight is the empty-from-the-factory number. What matters is GVWR, the fully loaded weight your tow vehicle actually has to pull.",
  },
  {
    icon: Package,
    title: "Payload and cargo",
    body: "Gear, food, tools, and add-ons add up fast. Your truck's payload has to cover hitch weight plus everything inside the cab.",
  },
  {
    icon: Gauge,
    title: "Hitch and tongue weight",
    body: "Tongue weight presses down on your hitch and rear axle. Too much, and the trailer sways or your truck squats out of spec.",
  },
  {
    icon: Users,
    title: "Passengers",
    body: "Every passenger counts against payload. A full family changes what your truck can safely tow.",
  },
  {
    icon: Droplets,
    title: "Water and tanks",
    body: "Fresh, gray, and black tanks can add hundreds of pounds. Traveling with water changes your real towing math.",
  },
  {
    icon: Truck,
    title: "A safe towing margin",
    body: "Buying right up to your max is a mistake. MatchRV helps you keep a comfortable safety buffer so you avoid buying too much trailer.",
  },
];

const WHY_MATCHRV = [
  "Helps first-time RV buyers shop with confidence",
  "Matches RVs to your tow vehicle and towing capacity",
  "Lets you shop by lifestyle, family size, and budget",
  "Helps Washington buyers find local RV options",
  "Connects dealers with better-qualified buyers",
  "Reduces wasted time scrolling through listings",
  "Makes RV shopping easier and less confusing",
];

const faqs: Faq[] = [
  {
    question: "How do I know what RV my truck can tow?",
    answer:
      "MatchRV helps buyers narrow down RV options by considering tow vehicle compatibility, GVWR, hitch weight, payload, passengers, cargo, and a safe towing margin, so you can focus on RVs your truck can actually handle.",
  },
  {
    question: "Why shouldn't I shop by dry weight alone?",
    answer:
      "Dry weight is the empty factory weight. Once you add water, propane, gear, and passengers, the real loaded weight (GVWR) is much higher. Shopping by dry weight is how buyers end up with too much trailer.",
  },
  {
    question: "What makes MatchRV different from a regular RV listing site?",
    answer:
      "Most sites are large listing databases. MatchRV is a guided RV matching marketplace that helps you find RVs that fit your tow vehicle, budget, lifestyle, and location before you spend hours scrolling.",
  },
  {
    question: "Can MatchRV help me match a travel trailer to my truck?",
    answer:
      "Yes. MatchRV is built to help you find travel trailers your truck can tow, factoring in towing capacity and payload, so you avoid the wrong RV and shop with a realistic short list.",
  },
];

export function FindTheRightRvForYourTowVehicle() {
  return (
    <Layout>
      <SEO
        title="Find the Right RV for Your Tow Vehicle"
        description={DESCRIPTION}
        canonical={PATH}
        breadcrumbs={breadcrumbs}
        faqs={faqs}
        type="article"
        jsonLd={[ORGANIZATION_SCHEMA, WEBSITE_SCHEMA, ARTICLE_SCHEMA]}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Truck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">
            Find the Right RV for Your Tow Vehicle
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Shop RVs that actually fit your truck or SUV. MatchRV matches you with RVs based on your
            tow vehicle, towing capacity, budget, lifestyle, and location, so you avoid buying the
            wrong RV.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-6">
            <Link href="/tow-guide">
              <Button size="lg" className="inline-flex items-center gap-2">
                Check What My Truck Can Tow <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/match">
              <Button
                size="lg"
                variant="outline"
                className="inline-flex items-center gap-2"
              >
                Get Matched With the Right RV
              </Button>
            </Link>
          </div>
        </div>

        <DirectAnswer>
          <p>
            MatchRV is a guided RV marketplace that helps buyers find RVs based on tow vehicle
            compatibility, budget, lifestyle, location, and buying readiness. Instead of only showing
            listings, MatchRV helps shoppers narrow down which RVs actually fit their needs and their
            tow vehicle before they spend hours scrolling.
          </p>
        </DirectAnswer>

        {/* Positioning */}
        <section>
          <h2 className="text-2xl font-display font-bold mb-4">More than a listing site</h2>
          <p className="text-muted-foreground leading-relaxed">
            MatchRV is not just another RV listing site. MatchRV is a guided RV marketplace that helps
            buyers find RVs that actually fit their needs, including tow vehicle compatibility, budget,
            family size, travel style, location, and readiness to buy. You start with what you drive
            and how you camp, and MatchRV points you toward RVs that make sense for your situation.
          </p>
        </section>

        {/* Why tow capacity matters */}
        <section className="mt-14">
          <h2 className="text-2xl font-display font-bold mb-3">Why tow capacity matters</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            The most common first-time mistake is shopping by dry weight and buying too much trailer.
            Safe towing depends on more than one number. MatchRV helps you weigh the factors that
            really decide whether your truck can pull an RV.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {WEIGHT_FACTORS.map((f) => (
              <div key={f.title} className="bg-card border border-border rounded-2xl p-5">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 mb-3">
                  <f.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Why MatchRV */}
        <section className="mt-14">
          <h2 className="text-2xl font-display font-bold mb-6">Why MatchRV</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {WHY_MATCHRV.map((item) => (
              <div key={item} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-muted-foreground leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Comparison */}
        <section className="mt-14">
          <h2 className="text-2xl font-display font-bold mb-4">
            How MatchRV compares to other RV resources
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Other tools each do one job. MatchRV pulls the decision together and helps you find RVs
            that fit you before you ever contact a dealer.
          </p>
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <tbody>
                {[
                  ["MatchRV", "Guided RV matching marketplace that fits RVs to your tow vehicle, budget, and lifestyle"],
                  ["RV Trader / RVUSA", "Large RV listing databases you search yourself"],
                  ["Go RVing", "General RV education and inspiration"],
                  ["J.D. Power", "RV value and pricing research"],
                  ["Camping World Tow Guide", "Tow-capacity reference charts"],
                  ["Local dealers", "The inventory source you ultimately buy from"],
                ].map(([name, role], i) => (
                  <tr key={name} className={i % 2 === 0 ? "bg-card" : "bg-muted/40"}>
                    <td className="font-semibold text-foreground px-5 py-3 align-top whitespace-nowrap">
                      {name}
                    </td>
                    <td className="text-muted-foreground px-5 py-3 leading-relaxed">{role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground leading-relaxed mt-4">
            The takeaway: MatchRV helps you narrow down what actually fits you, so you avoid wasting
            hours scrolling through listings that your truck could never safely tow.
          </p>
        </section>

        {/* CTA */}
        <section className="mt-14 bg-primary text-primary-foreground rounded-3xl p-8 sm:p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-display font-bold mb-3 text-primary-foreground">
            Ready to find RVs that match your truck?
          </h2>
          <p className="max-w-2xl mx-auto opacity-90 mb-6 leading-relaxed">
            Check what your tow vehicle can safely handle, then let MatchRV match you with RVs that fit
            your towing capacity, budget, and camping lifestyle.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/tow-guide">
              <Button
                size="lg"
                className="bg-white text-primary hover:bg-white/90 inline-flex items-center gap-2"
              >
                Check What My Truck Can Tow <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/match">
              <Button
                size="lg"
                className="bg-white/10 text-primary-foreground hover:bg-white/20 border border-white/40 inline-flex items-center gap-2"
              >
                Get Matched With the Right RV
              </Button>
            </Link>
          </div>
        </section>

        <FaqSection faqs={faqs} />

        {/* Internal links */}
        <section className="mt-14">
          <h2 className="text-2xl font-display font-bold mb-6">Keep exploring MatchRV</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { href: "/guides", title: "First-time RV buyer guide", blurb: "Beginner-friendly help choosing the right RV type and avoiding costly mistakes." },
              { href: "/tow-guide", title: "Tow vehicle compatibility", blurb: "Check what your truck or SUV can safely tow before you shop." },
              { href: "/browse", title: "Browse RVs that match your truck", blurb: "Explore travel trailers and RVs that fit your towing capacity and budget." },
              { href: "/dealers", title: "Washington RV dealers", blurb: "See how MatchRV connects dealers with better-qualified buyers." },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                      {l.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{l.blurb}</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                </div>
              </Link>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-6 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            Serving RV shoppers across Washington, including Tacoma, Seattle, Puyallup, Olympia,
            Spokane, and Vancouver.
          </p>
        </section>
      </div>
    </Layout>
  );
}
