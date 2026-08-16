import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { Link } from "wouter";
import { Truck, ShieldCheck, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui-elements";

const TRUCK_CAPACITIES = [
  { truck: "Ford F-150 (3.5L EcoBoost)", tow: "13,200", payload: "3,250" },
  { truck: "Chevrolet Silverado 1500 (6.2L)", tow: "13,300", payload: "2,280" },
  { truck: "RAM 1500 (5.7L HEMI)", tow: "12,750", payload: "2,300" },
  { truck: "Toyota Tundra (i-FORCE MAX)", tow: "12,000", payload: "1,940" },
  { truck: "Ford F-250 Super Duty (7.3L)", tow: "20,000", payload: "4,260" },
  { truck: "Ford F-350 Super Duty (6.7L PSD)", tow: "24,200", payload: "7,850" },
  { truck: "RAM 2500 (6.7L Cummins)", tow: "20,000", payload: "3,160" },
  { truck: "RAM 3500 (6.7L Cummins)", tow: "37,090", payload: "7,680" },
  { truck: "Chevrolet Silverado 3500HD (Duramax)", tow: "36,000", payload: "7,442" },
  { truck: "GMC Sierra 2500HD (Duramax)", tow: "22,500", payload: "3,979" },
];

export function TowGuide() {
  return (
    <Layout>
      <SEO
        title="RV Towing Guide — Safe Tow Capacity by Truck & RV Type"
        description="Find out exactly what your truck can tow. MatchRV's free RV towing guide covers popular trucks, GVWR ratings, and safe tow capacity for all RV types."
        canonical="https://matchrv.com/tow-guide"
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Truck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-display font-bold mb-3">RV Towing Guide</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Everything you need to know about tow ratings, GVWR, and safe towing practices for your RV adventure.
          </p>
        </div>

        <div className="space-y-10">
          <section className="bg-card border border-border rounded-2xl p-6 sm:p-8">
            <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-primary" /> Understanding Tow Ratings
            </h2>
            <div className="prose prose-sm text-muted-foreground space-y-4">
              <p>
                Your tow vehicle's rating determines the maximum weight it can safely pull. This number is set by the manufacturer and accounts for engine power, transmission, frame strength, brakes, and cooling systems.
              </p>
              <div className="grid sm:grid-cols-2 gap-4 not-prose">
                <div className="bg-muted/50 rounded-xl p-4">
                  <h4 className="font-semibold text-foreground mb-1">GVWR</h4>
                  <p className="text-sm text-muted-foreground">Gross Vehicle Weight Rating — the maximum total weight of the RV when fully loaded including passengers, cargo, water, and fuel.</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-4">
                  <h4 className="font-semibold text-foreground mb-1">GCWR</h4>
                  <p className="text-sm text-muted-foreground">Gross Combined Weight Rating — the maximum total weight of your tow vehicle plus the trailer when both are fully loaded.</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-4">
                  <h4 className="font-semibold text-foreground mb-1">Dry Weight</h4>
                  <p className="text-sm text-muted-foreground">The weight of the RV as shipped from the factory — no water, propane, personal belongings, or options added.</p>
                </div>
                <div className="bg-muted/50 rounded-xl p-4">
                  <h4 className="font-semibold text-foreground mb-1">Tongue/Pin Weight</h4>
                  <p className="text-sm text-muted-foreground">The downward force the trailer exerts on the hitch. Should be 10-15% of total trailer weight for proper balance.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-card border border-border rounded-2xl p-6 sm:p-8">
            <h2 className="text-2xl font-display font-bold mb-4">Common Truck Tow Capacities</h2>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border">
                    <th className="text-left py-3 px-2 font-semibold">Truck</th>
                    <th className="text-right py-3 px-2 font-semibold">Max Tow (lbs)</th>
                    <th className="text-right py-3 px-2 font-semibold">Max Payload (lbs)</th>
                  </tr>
                </thead>
                <tbody>
                  {TRUCK_CAPACITIES.map((t) => (
                    <tr key={t.truck} className="border-b border-border/50">
                      <td className="py-3 px-2 text-foreground font-medium">{t.truck}</td>
                      <td className="py-3 px-2 text-right text-muted-foreground">{t.tow}</td>
                      <td className="py-3 px-2 text-right text-muted-foreground">{t.payload}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">* Tow and payload capacities vary by configuration. Always check your vehicle's door jamb sticker for exact ratings.</p>
          </section>

          <section className="bg-card border border-border rounded-2xl p-6 sm:p-8">
            <h2 className="text-2xl font-display font-bold mb-4 flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-orange-500" /> Tips for Safe Towing
            </h2>
            <ul className="space-y-3">
              {[
                "Always stay at least 20% below your vehicle's maximum tow rating for a comfortable safety margin.",
                "Use a weight distribution hitch for trailers over 5,000 lbs to improve stability.",
                "Check tire pressures on both your tow vehicle and trailer before every trip.",
                "Load your trailer with 60% of the weight in the front half for proper tongue weight.",
                "Practice braking in an empty parking lot before hitting the highway with a new trailer.",
                "Allow twice the normal stopping distance when towing.",
                "Use your tow/haul mode and trailer brake controller for descending long grades.",
                "Get a tow match check on any listing — use the Tow Match tool on every listing page.",
              ].map((tip, i) => (
                <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {tip}
                </li>
              ))}
            </ul>
          </section>

          <div className="text-center">
            <Link href="/browse?type=travel_trailer">
              <Button size="lg" className="gap-2">
                Browse Towable RVs <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
