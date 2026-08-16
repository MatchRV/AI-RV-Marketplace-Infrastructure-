import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { SEO } from "@/components/seo";
import { ListingCard } from "@/components/listing-card";
import { useGetListings } from "@workspace/api-client-react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface FAQItem {
  question: string;
  answer: string;
}

interface CategoryListingsPageProps {
  rvType?: string;
  title: string;
  h1: string;
  metaDescription: string;
  canonical: string;
  introCopy: string;
  faqs: FAQItem[];
  relatedLinks?: { href: string; label: string }[];
}

function FAQAccordion({ faqs }: { faqs: FAQItem[] }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      {faqs.map((faq, idx) => (
        <div key={idx} className="border border-[#E2E8F0] rounded-2xl overflow-hidden bg-white">
          <button
            onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
            className="w-full text-left flex items-center justify-between px-6 py-4 font-bold text-[#161d1d] hover:bg-[#eef5f4] transition-colors"
          >
            <span>{faq.question}</span>
            {openIdx === idx ? (
              <ChevronUp className="w-5 h-5 text-[#0B1117] shrink-0 ml-3" />
            ) : (
              <ChevronDown className="w-5 h-5 text-[#6b7a7a] shrink-0 ml-3" />
            )}
          </button>
          {openIdx === idx && (
            <div className="px-6 pb-5 text-[#3b4949] text-sm leading-relaxed border-t border-[#E2E8F0] pt-4">
              {faq.answer}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function CategoryListingsPage({
  rvType,
  title,
  h1,
  metaDescription,
  canonical,
  introCopy,
  faqs,
  relatedLinks = [],
}: CategoryListingsPageProps) {
  const params: Record<string, string> = { limit: "12" };
  if (rvType) params.type = rvType;

  const { data, isLoading } = useGetListings(params);
  const listings = data?.listings ?? [];
  const total = data?.total ?? 0;

  const browseUrl = rvType ? `/browse?type=${rvType}` : "/browse";

  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: "RVs for Sale", href: "/rvs-for-sale" },
    ...(rvType ? [{ name: h1, href: canonical }] : []),
  ];

  return (
    <Layout>
      <SEO
        title={title}
        description={metaDescription}
        canonical={canonical}
        breadcrumbs={breadcrumbs}
        faqs={faqs}
      />

      <div className="bg-gradient-to-br from-[#0B1117] to-[#002829] text-white py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <nav className="text-[#00CED1]/70 text-sm mb-4 flex items-center justify-center gap-2">
            <Link href="/" className="hover:text-[#00CED1] transition-colors">Home</Link>
            <span>/</span>
            {rvType ? (
              <>
                <Link href="/rvs-for-sale" className="hover:text-[#00CED1] transition-colors">RVs for Sale</Link>
                <span>/</span>
                <span className="text-[#00CED1]">{h1}</span>
              </>
            ) : (
              <span className="text-[#00CED1]">RVs for Sale</span>
            )}
          </nav>
          <h1 className="font-display font-black text-3xl md:text-5xl mb-4 leading-tight">{h1}</h1>
          {!isLoading && total > 0 && (
            <p className="text-[#00CED1] text-lg font-medium mb-2">
              Browse {total.toLocaleString()} listings
            </p>
          )}
          <p className="text-white/80 text-base max-w-2xl mx-auto leading-relaxed">{introCopy}</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="h-[420px] rounded-[1.5rem] bg-[#eef5f4] animate-pulse" />
            ))}
          </div>
        ) : listings.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-[#6b7a7a] text-lg">No listings found. Check back soon!</p>
          </div>
        )}

        <div className="mt-12 text-center">
          <Link href={browseUrl}>
            <button className="inline-flex items-center gap-2 bg-[#0B1117] text-white px-8 py-4 rounded-2xl font-bold text-base hover:bg-[#002829] transition-colors shadow-lg shadow-[#0B1117]/20">
              Browse All {total > 0 ? `${total.toLocaleString()} ` : ""}{h1}
              <ArrowRight className="w-5 h-5" />
            </button>
          </Link>
        </div>

        {relatedLinks.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display font-black text-2xl text-[#161d1d] mb-6">Browse by RV Type</h2>
            <div className="flex flex-wrap gap-3">
              {relatedLinks.map((link) => (
                <Link key={link.href} href={link.href}>
                  <span className="inline-block px-5 py-2.5 rounded border-2 border-[#0B1117] text-[#0B1117] font-bold text-sm hover:bg-[#0B1117] hover:text-white transition-colors">
                    {link.label}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="mt-16">
          <h2 className="font-display font-black text-2xl text-[#161d1d] mb-8">Frequently Asked Questions</h2>
          <FAQAccordion faqs={faqs} />
        </div>

        <div className="mt-16 bg-gradient-to-r from-[#0B1117] to-[#002829] rounded-[2rem] p-10 text-center text-white">
          <h2 className="font-display font-black text-2xl md:text-3xl mb-3">Ready to find your RV?</h2>
          <p className="text-white/80 mb-6 max-w-md mx-auto">Browse thousands of listings with AI-powered deal scoring to find the best value for your budget.</p>
          <Link href={browseUrl}>
            <button className="bg-white text-[#0B1117] px-8 py-3.5 rounded font-black text-sm hover:bg-[#eef5f4] transition-colors">
              Shop All RVs
            </button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}
