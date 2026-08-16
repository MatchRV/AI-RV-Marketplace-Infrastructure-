import { CategoryListingsPage } from "@/components/category-listings-page";

const RELATED_LINKS = [
  { href: "/fifth-wheels-for-sale", label: "Fifth Wheels" },
  { href: "/class-a-rvs-for-sale", label: "Class A Motorhomes" },
  { href: "/class-c-rvs-for-sale", label: "Class C Motorhomes" },
  { href: "/toy-haulers-for-sale", label: "Toy Haulers" },
];

const FAQS = [
  {
    question: "What should I look for when buying a used travel trailer?",
    answer: "Start by inspecting the roof seams, slide-out seals, and underbelly for water damage — it's the most common and costly repair on travel trailers. Check all appliances, the electrical system, and look for soft spots in the floor. Bring a flashlight and tap the walls; hollow spots can indicate delamination. Request the service history from the dealer and run the VIN if available.",
  },
  {
    question: "What truck do I need to tow a travel trailer?",
    answer: "Towing capacity depends on the trailer's Gross Vehicle Weight Rating (GVWR). Lightweight trailers under 5,000 lbs can be towed by many half-ton trucks and some mid-size SUVs. Trailers in the 7,000–10,000 lb range typically require a half-ton truck like a Ford F-150 or Ram 1500 with a proper hitch package. Anything over 12,000 lbs needs a 3/4-ton or 1-ton truck. Always check your vehicle's tow rating in the owner's manual — never rely on the window sticker alone.",
  },
  {
    question: "Are travel trailers a good investment for full-time living?",
    answer: "Travel trailers can work well for full-time living if you choose a model with a residential-quality layout: solid-surface counters, a full bathroom with a real shower, a queen or king bed, and ample storage. Look for models with four-season insulation packages if you plan to camp in cold climates. Many full-timers find that a 30–38 foot trailer with a dedicated office space and double-slide floorplan suits long-term life. Budget for site fees, insurance, and more frequent maintenance than a weekend camper.",
  },
];

export function TravelTrailersForSale() {
  return (
    <CategoryListingsPage
      rvType="travel_trailer"
      title="Travel Trailers for Sale | New & Used | MatchRV"
      h1="Travel Trailers for Sale"
      metaDescription="Browse new and used travel trailers for sale. Lightweight, bunkhouse, toy hauler, and luxury travel trailer listings with AI deal scoring. Find the best price near you."
      canonical="/travel-trailers-for-sale"
      introCopy="Travel trailers are the most popular RV type in America — and for good reason. They offer full living amenities without the complexity of a motorhome, and they unhook from your tow vehicle so you can drive around camp freely. Browse our inventory ranging from ultralight weekend rigs to family-sized trailers with multiple slides and all the comforts of home."
      faqs={FAQS}
      relatedLinks={RELATED_LINKS}
    />
  );
}
