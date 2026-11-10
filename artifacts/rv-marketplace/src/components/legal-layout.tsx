import type { ReactNode } from "react";
import { SiteLayout } from "@/components/site/site-layout";
import { SEO } from "@/components/seo";
import { SITE } from "@/config/site";

export function LegalLayout({ title, canonical, children }: { title: string; canonical: string; children: ReactNode }) {
  return <SiteLayout>
    <SEO title={title} description={`${title} for MatchRV’s dealership auditing, inventory services, and AI shopping tools.`} canonical={canonical}/>
    <section className="page-hero page-hero--compact" aria-labelledby="page-title">
      <div className="page-hero__bg" aria-hidden="true"></div>
      <div className="container container--narrow">
        <p className="eyebrow">MatchRV</p>
        <h1 id="page-title" className="display display--sm">{title}</h1>
        <p className="muted">Last updated: October 18, 2026</p>
        <p>Support and compliance: <a className="text-link" href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
      </div>
    </section>
    <article className="section section--tight-top theme-paper">
      <div className="container container--narrow prose legal-content">{children}</div>
    </article>
  </SiteLayout>;
}
