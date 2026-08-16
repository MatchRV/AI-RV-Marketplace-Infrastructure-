import { CategoryListingsPage } from "@/components/category-listings-page";

const RELATED_LINKS = [
  { href: "/class-a-rvs-for-sale", label: "Class A Motorhomes" },
  { href: "/class-b-rvs-for-sale", label: "Class B Campervans" },
  { href: "/travel-trailers-for-sale", label: "Travel Trailers" },
  { href: "/fifth-wheels-for-sale", label: "Fifth Wheels" },
];

const FAQS = [
  {
    question: "What's the difference between a Class B and Class C motorhome?",
    answer: "A Class C is built on a cutaway truck chassis (most commonly a Ford E-450 or Ram 5500) with a distinctive cab-over bunk extending above the driver's cab. This over-cab space adds sleeping room for two, making Class C an excellent family RV. Class C motorhomes range from 20 to 38 feet and feel more like driving a large box truck than a traditional van. They offer more living space than a Class B at a lower cost than a Class A, making them the most popular motorhome category for families.",
  },
  {
    question: "How much does a used Class C motorhome cost?",
    answer: "Used Class C motorhomes are typically the most affordable motorhome option. Older, high-mileage units from the early 2010s start around $20,000–$40,000. Well-maintained 2015–2020 models from Forest River, Coachmen, or Thor average $45,000–$95,000. Luxury Class C models like the Tiffin Wayfarer or Winnebago View — which are built on Mercedes Sprinter cutaways — run $130,000–$200,000 new and hold their value well used. MatchRV's deal scoring flags listings priced below comparable sales so you can spot the best values instantly.",
  },
  {
    question: "Is a Class C motorhome good for families?",
    answer: "Class C is arguably the best family motorhome. The cab-over bunk sleeps two children and keeps them out of the main living area. Many floorplans include a rear bunkhouse that adds another two to four sleeping spaces, making Class C units that sleep 8–10 people common. Look for models with a slide-out living room, a dedicated bathroom with a shower, and an outdoor kitchen if you enjoy al fresco cooking. The Coachmen Freelander, Forest River Sunseeker, and Thor Axis are popular family choices under $80,000.",
  },
];

export function ClassCRvsForSale() {
  return (
    <CategoryListingsPage
      rvType="class_c"
      title="Class C Motorhomes for Sale | New & Used | MatchRV"
      h1="Class C Motorhomes for Sale"
      metaDescription="Browse new and used Class C motorhomes for sale. Family-friendly floorplans with cab-over bunks from Forest River, Thor, Coachmen, and more. AI deal scoring included."
      canonical="/class-c-rvs-for-sale"
      introCopy="Class C motorhomes are the sweet spot for families: more space than a campervan, easier to drive than a Class A, and typically more affordable than either. The signature cab-over bunk adds sleeping space without adding length, and many models include bunkhouse rear floorplans that sleep six to ten. Browse our full inventory with live deal scoring on every listing."
      faqs={FAQS}
      relatedLinks={RELATED_LINKS}
    />
  );
}
