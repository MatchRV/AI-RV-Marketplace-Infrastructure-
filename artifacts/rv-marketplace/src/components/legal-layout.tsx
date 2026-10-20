import type { ReactNode } from "react";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";

export function LegalLayout({ title, canonical, children }: { title: string; canonical: string; children: ReactNode }) {
  return <BrandLayout><SEO title={title} description={`${title} for MatchRV’s dealership auditing, inventory services, and AI shopping tools.`} canonical={canonical}/><article className="brand-container brand-section legal-page"><p className="brand-eyebrow">MatchRV</p><h1>{title}</h1><p className="brand-muted">Last updated: October 18, 2026</p><p>Support and compliance: <a href="mailto:jonathan@matchrv.com">jonathan@matchrv.com</a></p><div className="legal-content">{children}</div></article></BrandLayout>;
}
