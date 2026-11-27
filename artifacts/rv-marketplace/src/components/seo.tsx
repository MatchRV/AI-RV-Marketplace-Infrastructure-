import { Helmet } from "react-helmet-async";
import { currentOrigin } from "@/lib/site-host";

const SITE_NAME = "MatchRV";
const DEFAULT_OG_IMAGE = "/opengraph.jpg";

interface BreadcrumbItem {
  name: string;
  href: string;
}

interface FAQItem {
  question: string;
  answer: string;
}

interface SEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
  jsonLd?: object | object[];
  noIndex?: boolean;
  breadcrumbs?: BreadcrumbItem[];
  faqs?: FAQItem[];
  type?: "website" | "article";
}

export function SEO({ title, description, canonical, ogImage, jsonLd, noIndex, breadcrumbs, faqs, type = "website" }: SEOProps) {
  const baseUrl = currentOrigin();
  const fullTitle = title ? `${title.replace(/\s*[—|]\s*MatchRV(?: for Dealers)?$/, "")} — ${SITE_NAME}` : SITE_NAME;
  const image = ogImage
    ? (/^https?:\/\//i.test(ogImage) ? ogImage : `${baseUrl}${ogImage.startsWith("/") ? ogImage : `/${ogImage}`}`)
    : `${baseUrl}${DEFAULT_OG_IMAGE}`;
  const canonicalUrl = canonical
    ? (/^https?:\/\//i.test(canonical) ? canonical : `${baseUrl}${canonical.startsWith("/") ? canonical : `/${canonical}`}`)
    : undefined;

  const baseSchemas = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  const breadcrumbSchema = breadcrumbs && breadcrumbs.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((b, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: b.name,
          item: `${baseUrl}${b.href}`,
        })),
      }
    : null;

  const faqSchema = faqs && faqs.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: f.answer,
          },
        })),
      }
    : null;

  const allSchemas = [
    ...baseSchemas,
    ...(breadcrumbSchema ? [breadcrumbSchema] : []),
    ...(faqSchema ? [faqSchema] : []),
  ];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      {description && <meta name="description" content={description} />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content={type} />
      <meta property="og:image" content={image} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image} />

      {allSchemas.map((schema, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      ))}
    </Helmet>
  );
}
