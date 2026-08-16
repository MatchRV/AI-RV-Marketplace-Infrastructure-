import { CategoryListingsPage } from "@/components/category-listings-page";

const RELATED_LINKS = [
  { href: "/travel-trailers-for-sale", label: "Travel Trailers" },
  { href: "/fifth-wheels-for-sale", label: "Fifth Wheels" },
  { href: "/class-a-rvs-for-sale", label: "Class A Motorhomes" },
  { href: "/class-c-rvs-for-sale", label: "Class C Motorhomes" },
];

const FAQS = [
  {
    question: "What is a toy hauler RV?",
    answer: "A toy hauler is a travel trailer or fifth wheel with a dedicated garage space at the rear — separated from the living quarters by a ramp door that doubles as a patio deck. The garage can carry ATVs, dirt bikes, side-by-sides, kayaks, or motorcycles. Many toy haulers convert the garage into sleeping space using flip-down bunks or suspended sleeping systems. They're popular with outdoor enthusiasts who want to bring their gear to trail access points, sand dunes, or backcountry campsites.",
  },
  {
    question: "What size garage do toy haulers have?",
    answer: "Toy hauler garage lengths typically range from 8 to 16 feet, with some units offering 18+ feet. An 8-foot garage fits two dirt bikes comfortably or one standard ATV. A 12-foot garage can hold two side-by-side ATVs, and a 14–16 foot garage fits most full-size UTVs. Weight capacity is critical — most toy hauler garage floors are rated between 1,500 and 3,500 lbs. Always check the floor rating against the combined weight of everything you plan to load.",
  },
  {
    question: "Can I live in a toy hauler full-time?",
    answer: "Yes, and it's a growing lifestyle. The garage converts to usable indoor living space in the off-season, essentially giving you a bonus room. Look for models with a full residential kitchen, solid-surface counters, and a full bathroom with a separate shower and toilet. The biggest consideration for full-time living is that garages often have fuel-fill ports for generators built into the exterior, and the garage can retain fumes if you've recently had vehicles inside — always ventilate thoroughly before sleeping in that area.",
  },
];

export function ToyHaulersForSale() {
  return (
    <CategoryListingsPage
      rvType="toy_hauler"
      title="Toy Haulers for Sale | New & Used | MatchRV"
      h1="Toy Haulers for Sale"
      metaDescription="Browse new and used toy haulers for sale. Travel trailer and fifth wheel toy haulers with garage space for ATVs, motorcycles, and side-by-sides. Find the best deal with AI pricing."
      canonical="/toy-haulers-for-sale"
      introCopy="Toy haulers give outdoor enthusiasts the best of both worlds: a fully equipped RV living space and a dedicated garage for your powersports gear. Whether you're hauling dirt bikes to Moab, ATVs to the dunes, or kayaks to a lake access point, toy haulers let you camp right where the action is. Browse our inventory of travel trailer and fifth wheel toy haulers with live deal scoring."
      faqs={FAQS}
      relatedLinks={RELATED_LINKS}
    />
  );
}
