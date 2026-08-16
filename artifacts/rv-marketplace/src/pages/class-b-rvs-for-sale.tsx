import { CategoryListingsPage } from "@/components/category-listings-page";

const RELATED_LINKS = [
  { href: "/class-a-rvs-for-sale", label: "Class A Motorhomes" },
  { href: "/class-c-rvs-for-sale", label: "Class C Motorhomes" },
  { href: "/travel-trailers-for-sale", label: "Travel Trailers" },
  { href: "/toy-haulers-for-sale", label: "Toy Haulers" },
];

const FAQS = [
  {
    question: "What is a Class B campervan?",
    answer: "Class B RVs, also known as campervans, are built inside the shell of a full-size cargo van — most commonly a Mercedes Sprinter, Ford Transit, or Ram ProMaster. They're the most maneuverable, fuel-efficient, and stealthy motorhomes available. A Class B typically includes a sleeping area, compact kitchen with a two-burner cooktop, fresh water tank, and sometimes a wet bath or cassette toilet. Their biggest advantage is that they drive and park like a large van, so you can take them anywhere without worrying about clearance heights or campsite size.",
  },
  {
    question: "Can I live full-time in a Class B campervan?",
    answer: "Many people do, but it requires intentional downsizing. The key is finding a model with the features you prioritize: a fixed bed (rather than a conversion) saves nightly setup time, a dedicated toilet and shower are critical for comfort, and a strong solar and lithium battery system lets you stay off-grid for extended periods. Brands like Winnebago Travato, Thor Sequence, and Airstream Interstate are purpose-built for long-term use. The Storyteller Overland and Winnebago Revel are excellent for adventurers who camp off the beaten path.",
  },
  {
    question: "How fuel efficient are Class B motorhomes?",
    answer: "Class B campervans are the most fuel-efficient motorhomes available, typically getting 18–22 MPG on the highway in diesel Sprinter-based builds. Gas-powered Transit conversions average 14–18 MPG. This is a significant advantage over Class A motorhomes (7–12 MPG) and even Class C units (12–16 MPG). For frequent travelers who put serious miles on their rig, a Class B's fuel efficiency can offset its higher-per-square-foot cost over time.",
  },
];

export function ClassBRvsForSale() {
  return (
    <CategoryListingsPage
      rvType="class_b"
      title="Class B Campervans for Sale | New & Used | MatchRV"
      h1="Class B Campervans for Sale"
      metaDescription="Browse new and used Class B campervans and camper vans for sale. Sprinter, Transit, and ProMaster builds from top brands. Find the best deal with AI pricing analysis."
      canonical="/class-b-rvs-for-sale"
      introCopy="Class B campervans pack everything you need for comfortable travel into a van-sized package that parks in a regular space and gets 18+ MPG. From stealthy urban vans to overland adventure builds with 4x4 capability, the Class B market has exploded with options. Browse our curated inventory of Sprinter, Transit, and ProMaster-based campervans with live deal scoring on every listing."
      faqs={FAQS}
      relatedLinks={RELATED_LINKS}
    />
  );
}
