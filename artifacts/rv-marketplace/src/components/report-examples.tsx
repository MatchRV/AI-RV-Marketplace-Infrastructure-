import { Link } from "wouter";
import reports from "@/data/report-examples.json";

export function ReportExamples({ full = false }: { full?: boolean }) {
  return <div className="report-examples">
    <p className="brand-eyebrow">Completed audits · real findings</p>
    <h2>See what the report actually finds.</h2>
    <p className="brand-muted">Examples from completed September 27, 2026 audits. Dealership names and contact details are removed. The counts and scores are unchanged; these are dated findings, not a live feed.</p>
    <div className="report-example-grid">{reports.map(report => <article className="report-example" key={report.label}>
      <span className="sample-label">Real audit · identity withheld</span>
      <h3>{report.label}</h3><p>{report.scope} · {report.auditedAt}</p>
      <h4>What the audit found</h4>
      <ul>{(full ? report.missing : report.missing.slice(0,3)).map(row => <li key={row.field}><strong>{row.missing} of {row.of}</strong> records missing {row.field.replaceAll("_", " ").toLowerCase()}.<p>On the page for shoppers is not the same as readable for AI.</p></li>)}</ul>
      <p className="brand-muted">“Missing” means absent or not extracted in the audit data. It does not prove that a specification is absent from every source.</p>
      <details open={full}><summary>Score summary and next steps</summary>
        <dl>{[["Inventory completeness",report.scores.inventory_health],["AI readability",report.scores.ai_readability],["Crawlability",report.scores.crawlability],["Query coverage",report.scores.query_coverage],["Overall",report.scores.overall]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}/100</dd></div>)}</dl>
        <h4>Prioritized improvements</h4><ol>{(full ? report.actions : report.actions.slice(0,2)).map(action=><li key={action.priority}><strong>{action.title}</strong><p>{action.why}</p>{typeof action.affected_units === "number" && <small>{action.affected_units} affected records</small>}</li>)}</ol>
      </details>
    </article>)}</div>
    <p className="brand-fine">Source: completed MatchRV inventory audits. Scores summarize inventory readiness; they do not measure ChatGPT rankings, citations, leads, or sales. Listing-level source URLs are omitted to protect dealership identity.</p>
    {!full && <Link href="/visibility-report" className="brand-text-link">View the full report examples →</Link>}
  </div>;
}
