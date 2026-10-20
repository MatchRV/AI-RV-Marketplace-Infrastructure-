import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import { AiShoppingFuture } from "@/components/ai-shopping-future";
import "@/styles/shop.css";

export function Shop() {
  return <BrandLayout>
    <SEO
      title="The Future of AI RV Shopping"
      description="Your next RV search starts by talking to AI. See how MatchRV is building a bridge between shopper conversations and RV inventory."
      canonical="/shop"
    />
    <div className="brand-container shop-content"><AiShoppingFuture/></div>
  </BrandLayout>;
}
