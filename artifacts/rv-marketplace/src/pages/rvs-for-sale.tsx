import { CategoryListingsPage } from "@/components/category-listings-page";

const RV_TYPE_LINKS = [
  { href: "/travel-trailers-for-sale", label: "Travel Trailers" },
  { href: "/fifth-wheels-for-sale", label: "Fifth Wheels" },
  { href: "/class-a-rvs-for-sale", label: "Class A Motorhomes" },
  { href: "/class-b-rvs-for-sale", label: "Class B Campervans" },
  { href: "/class-c-rvs-for-sale", label: "Class C Motorhomes" },
  { href: "/toy-haulers-for-sale", label: "Toy Haulers" },
];

const FAQS = [
  {
    question: "What types of RVs can I find on MatchRV?",
    answer: "MatchRV carries a full inventory of new and used RVs including travel trailers, fifth wheels, Class A motorhomes, Class B campervans, Class C motorhomes, and toy haulers. Listings are sourced directly from dealers across Washington State and kept up to date as new inventory arrives.",
  },
  {
    question: "How does MatchRV's deal scoring work?",
    answer: "Each listing is scored by our AI engine, which compares its price against comparable units sold recently in the same region. A 'Great Deal' means the price is significantly below market rate — typically saving buyers thousands of dollars. You can filter by deal score to surface the best-value listings instantly.",
  },
  {
    question: "Can I find RVs from private sellers on MatchRV?",
    answer: "Currently, MatchRV primarily aggregates dealer inventory to give buyers verified, accurate listings. Private seller listings are in development. In the meantime, our dealer network covers all major brands and price points — from entry-level travel trailers under $15,000 to luxury diesel pushers over $500,000.",
  },
];

export function RvsForSale() {
  return (
    <CategoryListingsPage
      title="RVs for Sale | Browse Listings | MatchRV"
      h1="RVs for Sale"
      metaDescription="Browse thousands of new and used RVs for sale. Travel trailers, motorhomes, fifth wheels, toy haulers, and more. AI deal scoring helps you find the best value."
      canonical="/rvs-for-sale"
      introCopy="Shop thousands of new and used RVs from dealers across the country. Our AI-powered deal scoring engine analyzes every listing so you can find the best value — whether you're looking for a weekend travel trailer or a full-time luxury motorhome."
      faqs={FAQS}
      relatedLinks={RV_TYPE_LINKS}
    />
  );
}
