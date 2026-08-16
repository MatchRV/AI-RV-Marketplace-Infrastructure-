import { CategoryListingsPage } from "@/components/category-listings-page";

const RELATED_LINKS = [
  { href: "/travel-trailers-for-sale", label: "Travel Trailers" },
  { href: "/class-a-rvs-for-sale", label: "Class A Motorhomes" },
  { href: "/toy-haulers-for-sale", label: "Toy Haulers" },
  { href: "/class-c-rvs-for-sale", label: "Class C Motorhomes" },
];

const FAQS = [
  {
    question: "What's the difference between a fifth wheel and a travel trailer?",
    answer: "A fifth wheel hitches to a special coupling mounted in the bed of a pickup truck, distributing weight more evenly over the rear axle. This gives you a more stable, car-like towing experience compared to a travel trailer's ball hitch. Fifth wheels can also be taller and heavier because of this improved stability, giving you more interior headroom and larger floorplans. The trade-off is that you need a pickup truck — no SUVs or minivans can tow a fifth wheel.",
  },
  {
    question: "What size truck do I need to tow a fifth wheel?",
    answer: "Most fifth wheels weigh between 8,000 and 20,000 lbs loaded. A half-ton truck like an F-150 or Ram 1500 can handle lighter fifth wheels under 12,500 lbs with the right max-tow package. For anything heavier, you'll want a 3/4-ton (F-250, Ram 2500) or 1-ton dually (F-350, Ram 3500) for maximum stability. Always match your truck's fifth-wheel tow rating — not its regular tow rating — to the trailer's GVWR.",
  },
  {
    question: "Are fifth wheels good for full-time living?",
    answer: "Fifth wheels are among the most popular choices for full-time RV living. Their bi-level design puts the bedroom in a raised front section, separating it from the main living area for privacy and noise reduction. Many luxury fifth wheels feature residential appliances, king-size beds, washer/dryer hookups, and multiple slide-outs that rival a small apartment. Brands like Keystone Montana, Jayco North Point, and Grand Design Solitude are especially popular for long-term living.",
  },
];

export function FifthWheelsForSale() {
  return (
    <CategoryListingsPage
      rvType="fifth_wheel"
      title="Fifth Wheels for Sale | New & Used | MatchRV"
      h1="Fifth Wheels for Sale"
      metaDescription="Browse new and used fifth wheels for sale. Luxury, toy hauler, and bunkhouse fifth wheel listings with AI deal scoring. Find the best fifth wheel near you."
      canonical="/fifth-wheels-for-sale"
      introCopy="Fifth wheels combine the space of a motorhome with the flexibility of a towable. Their unique pin-box hitch design delivers superior stability and allows for taller, more residential floorplans. Whether you're a weekend warrior looking for a spacious retreat or a full-timer wanting a permanent home on wheels, fifth wheels offer some of the most livable square footage in the RV world."
      faqs={FAQS}
      relatedLinks={RELATED_LINKS}
    />
  );
}
