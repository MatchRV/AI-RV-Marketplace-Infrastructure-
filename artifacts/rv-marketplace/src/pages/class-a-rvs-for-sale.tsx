import { CategoryListingsPage } from "@/components/category-listings-page";

const RELATED_LINKS = [
  { href: "/class-b-rvs-for-sale", label: "Class B Campervans" },
  { href: "/class-c-rvs-for-sale", label: "Class C Motorhomes" },
  { href: "/fifth-wheels-for-sale", label: "Fifth Wheels" },
  { href: "/travel-trailers-for-sale", label: "Travel Trailers" },
];

const FAQS = [
  {
    question: "What is a Class A motorhome?",
    answer: "Class A motorhomes are the largest and most luxurious RVs on the road. They're built on a dedicated motorhome chassis with a flat front face — either a gas-powered Ford or Workhorse chassis or a diesel pusher with the engine in the rear. Class A coaches typically range from 26 to 45 feet long and offer floor plans with multiple slide-outs, full kitchens, king beds, and residential bathrooms. Diesel pushers offer better fuel economy, longer range, and quieter operation at the cost of a higher purchase price.",
  },
  {
    question: "What does a used Class A motorhome cost?",
    answer: "Used Class A gas motorhomes can start as low as $30,000–$60,000 for older models from brands like Coachmen or Forest River. Mid-range units from Tiffin, Fleetwood, or Entegra in the 2015–2020 range typically run $80,000–$175,000. Luxury diesel pushers from Tiffin Allegro Bus, Newmar, or Prevost start around $200,000 and can exceed $1,000,000 for high-end coaches. MatchRV's deal scoring identifies when any listing is priced below market, so you can find the best value regardless of budget.",
  },
  {
    question: "How hard is a Class A motorhome to drive?",
    answer: "A Class A is surprisingly manageable after a brief learning curve. Modern coaches have power steering, backup cameras, and many now include front and side cameras. The main adjustments are accounting for the height (typically 12–13 feet), the length when turning, and the wider stopping distance. Most first-time owners feel comfortable within the first few hours. If you're concerned, many RV dealers offer an orientation drive, and several companies offer motorhome driving instruction courses specifically for new owners.",
  },
];

export function ClassARvsForSale() {
  return (
    <CategoryListingsPage
      rvType="class_a"
      title="Class A Motorhomes for Sale | New & Used | MatchRV"
      h1="Class A Motorhomes for Sale"
      metaDescription="Browse new and used Class A motorhomes for sale. Gas and diesel pusher coaches from top brands. AI deal scoring to find the best value on luxury Class A RVs."
      canonical="/class-a-rvs-for-sale"
      introCopy="Class A motorhomes represent the pinnacle of RV travel — full-size coaches with residential kitchens, walk-in closets, king beds, and every amenity you'd want for extended travel or full-time living. Browse our inventory of gas motorhomes and diesel pushers from brands like Tiffin, Newmar, Entegra, Fleetwood, and Winnebago. Our AI deal scoring highlights the best-value units so you never overpay."
      faqs={FAQS}
      relatedLinks={RELATED_LINKS}
    />
  );
}
