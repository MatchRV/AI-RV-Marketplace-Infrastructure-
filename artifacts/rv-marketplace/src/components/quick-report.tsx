import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { SnapshotProgress } from "@/components/snapshot-progress";
import { Icon } from "@/components/site/icon";
import { trackLead } from "@/lib/analytics";
import { captureAiGeneration, createAiTraceId } from "@/lib/ai-observability";

type QuickReportResult = {
  reportId: string;
  snapshot: { score: number | null; verdict: string; findings: string[]; questions: Array<{ question: string; result: string }>; scoreNote: string };
  website: string;
  dealership: string | null;
  location: string;
  checkedAt: string;
  pages: Array<{ url: string; title: string }>;
  findings: Array<{ field: string; missing: number; checked: number }>;
  ai: {
    question: string | null;
    model: string | null;
    answer: string | null;
    sources: Array<{ url: string; title: string }>;
    siteWasCited: boolean | null;
    status: "answered" | "unavailable" | "skipped";
    message?: string | null;
  };
  note: string;
};

export function QuickReport() {
  const [website, setWebsite] = useState("");
  const [dealership, setDealership] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<QuickReportResult | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  const [emailReady, setEmailReady] = useState(false);
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/dealer-tools/quick-report/status")
      .then(response => response.ok ? response.json() : { ready: false })
      .then(payload => { if (active) { setReady(Boolean(payload.ready)); setEmailReady(Boolean(payload.emailReady)); } })
      .catch(() => { if (active) setReady(false); });
    return () => { active = false; };
  }, []);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError("");
    setResult(null);
    setEmailStatus("");
    const traceId = createAiTraceId();
    const generationStartedAt = performance.now();
    try {
      const response = await fetch("/api/dealer-tools/quick-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website, dealership, city, state, name, email }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The check could not finish. Please try again.");
      const report = payload as QuickReportResult;
      if (report.ai.question && report.ai.answer) {
        captureAiGeneration({
          traceId,
          sessionId: null,
          spanName: "dealer_visibility_snapshot",
          latencySeconds: (performance.now() - generationStartedAt) / 1_000,
          model: report.ai.model,
          provider: "gemini",
        });
      }
      trackLead("snapshot_request", { formId: "visibility_snapshot", dedupeKey: report.reportId, metadata: { report_id: report.reportId } });
      setResult(report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The check could not finish. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function sendPdf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result || emailBusy) return;
    setEmailBusy(true);
    setEmailStatus("");
    try {
      const response = await fetch("/api/dealer-tools/quick-report/email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: result.reportId }),
      });
      const payload = await response.json();
      if (response.ok) trackLead("snapshot_pdf_email", { dedupeKey: result.reportId, metadata: { report_id: result.reportId } });
      setEmailStatus(response.ok ? "Your PDF has been sent. Check your inbox." : payload.message || "We could not send the PDF right now.");
    } catch { setEmailStatus("We could not send the PDF right now. Please try again later."); }
    finally { setEmailBusy(false); }
  }

  const submitLabel = busy ? "Checking your website…" : ready === null ? "Checking availability…" : ready ? "Get my free snapshot" : "Free report is offline";

  return <div className="quick-report">
    <form id="visibility_snapshot" onSubmit={run} className="form" aria-busy={busy}>
      <div className="form__grid">
        <label className="field field--wide"><span>Dealership website</span><input type="text" value={website} onChange={event => setWebsite(event.target.value)} placeholder="yourdealership.com" autoComplete="url" inputMode="url" maxLength={300} required disabled={busy} /></label>
        <label className="field"><span>Dealership name <small>optional</small></span><input value={dealership} onChange={event => setDealership(event.target.value)} placeholder="Your dealership name" autoComplete="organization" maxLength={120} disabled={busy} /></label>
        <label className="field"><span>City</span><input value={city} onChange={event => setCity(event.target.value)} placeholder="Fife" autoComplete="address-level2" maxLength={80} required disabled={busy} /></label>
        <label className="field"><span>State</span><input value={state} onChange={event => setState(event.target.value)} placeholder="Washington" autoComplete="address-level1" maxLength={80} required disabled={busy} /></label>
        <label className="field"><span>Name</span><input value={name} onChange={event => setName(event.target.value)} placeholder="Your name" autoComplete="name" maxLength={120} minLength={2} required disabled={busy} /></label>
        <label className="field field--wide"><span>Email address</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@dealership.com" autoComplete="email" maxLength={254} required disabled={busy} /></label>
      </div>
      <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy || !ready}><span>{submitLabel}</span> <Icon name="arrow"/></button>
    </form>
    {ready === false && <p className="form__status" role="status">The live AI check is being connected. You can still <Link href="/book">book a report call</Link>.</p>}
    {busy && <SnapshotProgress website={website}/>}
    {error && <p className="form__status is-error" role="alert">{error}</p>}
    {result && <section className="snap" aria-label="Your free quick report" aria-live="polite">
      <SnapshotProgress website={result.website} complete/>
      <article className="snap__report">
        <header className="snap__head">
          <p className="snap__score">{result.snapshot.score ?? "N/A"}{result.snapshot.score !== null && <small>/100</small>}</p>
          <div>
            <p className="eyebrow">Free Visibility Snapshot · sample AI readiness</p>
            <h3 className="h3">{result.snapshot.verdict}</h3>
            <p className="fine">Prepared for {result.dealership || new URL(result.website).hostname.replace(/^www\./, "")} · {result.location} · Observed {new Date(result.checkedAt).toLocaleDateString()} · {result.pages.length} public pages checked</p>
          </div>
        </header>
        <ol className="snap__findings">{result.snapshot.findings.map((finding, i) => <li key={i}><strong>Finding {i + 1}:</strong> {finding}</li>)}</ol>
        <h3 className="h4">What shoppers asked — could your site prove it?</h3>
        <div className="snap__table"><table><thead><tr><th>Shopper question</th><th>Result</th></tr></thead><tbody>{result.snapshot.questions.map(row => <tr key={row.question}><td>{row.question}</td><td>{row.result}</td></tr>)}</tbody></table></div>
        <div className="notice"><strong>Want the fix list?</strong> The full AI Visibility Report includes your scorecard, inventory gaps, listing spot-checks and fixes ranked by impact. <Link className="text-link" href="/book">Discuss the full report</Link></div>
        <p className="fine">{result.snapshot.scoreNote}</p>
      </article>
      <details className="disclosure"><summary>View the AI observation and source evidence <Icon name="chevron"/></summary>
        {result.ai.question && <><h3 className="h4">The shopper question sent to Gemini</h3><blockquote>{result.ai.question}</blockquote><p className="fine">Model: {result.ai.model} · Asked {new Date(result.checkedAt).toLocaleString()} · Search-enabled sample</p></>}
        {result.ai.answer ? <><h3 className="h4">Gemini’s answer</h3><p className="snap__answer">{result.ai.answer}</p></> : <p>{result.ai.message || "Gemini did not return a usable answer. The website findings remain available."}</p>}
        <p><strong>Your site was cited:</strong> {result.ai.siteWasCited === true ? "Yes" : result.ai.siteWasCited === false ? "No, not in this sample" : "Could not determine from this sample"}</p>
        {result.ai.sources.length > 0 && <><h3 className="h4">Sources in the AI answer</h3><ul className="snap__list">{result.ai.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></>}
        <h3 className="h4">Inventory field checks</h3><ul className="snap__list">{result.findings.map(finding => <li key={finding.field}>{finding.checked ? `${finding.checked - finding.missing} of ${finding.checked} sampled listing pages expose ${finding.field}.` : `${finding.field}: not assessed — no inventory detail pages identified.`}</li>)}</ul>
        <h3 className="h4">Pages checked</h3><ul className="snap__list">{result.pages.map(page => <li key={page.url}><a href={page.url} target="_blank" rel="noopener noreferrer">{page.title || page.url}</a></li>)}</ul>
        <p className="fine">{result.note}</p>
      </details>
      <div className="snap__actions">
        <a className="btn btn--ghost" href={`/api/dealer-tools/quick-report/pdf/${result.reportId}`} download="MatchRV-sample-report.pdf"><Icon name="download"/> Download PDF</a>
        {emailReady && <form onSubmit={sendPdf}><button className="btn btn--ghost" disabled={emailBusy}><Icon name="mail"/> {emailBusy ? "Sending…" : `Email PDF to ${email}`}</button></form>}
        <Link href="/book" className="btn btn--primary">Discuss the full audit <Icon name="arrow"/></Link>
      </div>
      {emailStatus && <p className="form__status" role="status">{emailStatus}</p>}
    </section>}
  </div>;
}
