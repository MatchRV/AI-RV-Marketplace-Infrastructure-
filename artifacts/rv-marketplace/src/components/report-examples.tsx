import { useState } from "react";
import { Link } from "wouter";

const examples = [
  { id: "full", title: "Full AI Visibility Report", file: "matchrv-ai-visibility-report-tacoma-rv", copy: "Scorecard, dealership snapshot, shopper questions, inventory health, listing spot-checks and five ranked fixes." },
  { id: "free", title: "Free Visibility Snapshot", file: "matchrv-teaser-tacoma-rv", copy: "A one-page overview with the readiness score, three key findings and a short shopper-question table." },
];

export function ReportExamples({ full = false }: { full?: boolean }) {
  const [selected, setSelected] = useState("full");
  const example = examples.find(item => item.id === selected)!;
  return <div className="report-examples">
    <p className="brand-eyebrow">The MatchRV report standard</p>
    <h2>See the full report and the free snapshot.</h2>
    <p className="brand-muted">Tacoma RV Center · Fife, WA · Website observed September 21, 2026. These completed reports show the format used for full audits and free snapshots. Each new report uses that dealership’s own evidence.</p>
    <div className="report-reference-cards">{examples.map(item => <article key={item.id}>
      <h3>{item.title}</h3><p>{item.copy}</p>
      <div className="quick-report-delivery"><a className="brand-button" href={`/reports/${item.file}.pdf`} target="_blank" rel="noopener noreferrer">View PDF</a><a className="brand-button secondary" href={`/reports/${item.file}.pdf`} download>Download PDF</a></div>
    </article>)}</div>
    {full ? <>
      <div className="report-preview-tabs" role="tablist" aria-label="Report previews">{examples.map(item => <button key={item.id} role="tab" id={`tab-${item.id}`} aria-selected={selected === item.id} aria-controls="report-preview" onClick={() => setSelected(item.id)}>{item.title}</button>)}</div>
      <div role="tabpanel" id="report-preview" aria-labelledby={`tab-${selected}`}><iframe key={selected} title={`${example.title} — Tacoma RV Center`} src={`/reports/${example.file}.html`} className="report-reference-preview" /><p className="brand-fine">Prefer a separate page? <a href={`/reports/${example.file}.html`} target="_blank" rel="noopener noreferrer">Open the {example.title.toLowerCase()}</a>.</p></div>
    </> : <Link href="/visibility-report" className="brand-text-link">Explore both report examples →</Link>}
  </div>;
}
