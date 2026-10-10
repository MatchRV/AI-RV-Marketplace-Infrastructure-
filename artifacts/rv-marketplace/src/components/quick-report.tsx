import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";

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
    try {
      const response = await fetch("/api/dealer-tools/quick-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ website, dealership, city, state, name, email }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "The check could not finish. Please try again.");
      setResult(payload as QuickReportResult);
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
      setEmailStatus(response.ok ? "Your PDF has been sent. Check your inbox." : payload.message || "We could not send the PDF right now.");
    } catch { setEmailStatus("We could not send the PDF right now. Please try again later."); }
    finally { setEmailBusy(false); }
  }

  return <div className="quick-report">
    <p className="brand-eyebrow">Free Visibility Snapshot</p>
    <h2>Get your free Visibility Snapshot.</h2>
    <p>Enter your dealership website, location, name, and email. We’ll check public pages and ask Gemini one RV shopper question near your dealership. You’ll get a one-page snapshot with a readiness score, three findings and shopper-question results, plus a PDF to download. No account or card required.</p>
    <form onSubmit={run} className="quick-report-form">
      <label>Dealership website<input type="text" value={website} onChange={event => setWebsite(event.target.value)} placeholder="tacomarv.com" autoComplete="url" maxLength={300} required disabled={busy} /></label>
      <label>Dealership name<input value={dealership} onChange={event => setDealership(event.target.value)} placeholder="Tacoma RV Center" autoComplete="organization" maxLength={120} disabled={busy} /></label>
      <label>City<input value={city} onChange={event => setCity(event.target.value)} placeholder="Tacoma" autoComplete="address-level2" maxLength={80} required disabled={busy} /></label>
      <label>State<input value={state} onChange={event => setState(event.target.value)} placeholder="Washington" autoComplete="address-level1" maxLength={80} required disabled={busy} /></label>
      <label>Name<input value={name} onChange={event => setName(event.target.value)} placeholder="Your name" autoComplete="name" maxLength={120} minLength={2} required disabled={busy} /></label>
      <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@dealership.com" autoComplete="email" maxLength={254} required disabled={busy} /></label>
      <button className="brand-button" type="submit" disabled={busy || !ready}>{busy ? "Checking your website…" : ready === null ? "Checking availability…" : ready ? "Get my free snapshot" : "Free report is offline"}</button>
    </form>
    {ready === false && <p className="brand-fine" role="status">The live AI check is being connected. You can still <Link href="/book">book a report call</Link>.</p>}
    {busy && <div className="quick-report-wait" role="status"><div><strong>Your check is running.</strong><p>We’re sampling public inventory pages and asking Gemini a shopper question near {city}, {state}. Watch this short video while you wait; the result will appear as soon as it is ready.</p></div><video controls autoPlay muted playsInline preload="metadata" aria-label="The Invisible RV Market video"><source src="/websitevideo.mp4" type="video/mp4" /></video></div>}
    {error && <p className="brand-error" role="alert">{error}</p>}
    {result && <section className="quick-report-result" aria-label="Your free quick report" aria-live="polite">
      <article className="visibility-snapshot">
        <header className="snapshot-cover"><div className="snapshot-logo">Match<span>RV</span></div><p>AI VISIBILITY REPORTS</p><h2>Free Visibility Snapshot</h2><strong>Prepared for {result.dealership || new URL(result.website).hostname.replace(/^www\./, "")} · {result.location}</strong><p>Observed {new Date(result.checkedAt).toLocaleDateString()} · {result.pages.length} public pages checked</p></header>
        <div className="snapshot-body">
          <div className="snapshot-grid"><div className="snapshot-score"><div>{result.snapshot.score ?? "N/A"}{result.snapshot.score !== null && <span>/100</span>}</div><small>SAMPLE AI READINESS</small><strong>{result.snapshot.verdict}</strong></div><div className="snapshot-points">{result.snapshot.findings.map((finding,i)=><p key={i}><b>Finding {i+1}:</b> {finding}</p>)}</div></div>
          <h3>What shoppers asked — could your site prove it?</h3><div className="snapshot-table-wrap"><table><thead><tr><th>Shopper question</th><th>Result</th></tr></thead><tbody>{result.snapshot.questions.map(row=><tr key={row.question}><td>{row.question}</td><td>{row.result}</td></tr>)}</tbody></table></div>
          <div className="snapshot-cta"><b>Want the fix list?</b><p>The full AI Visibility Report includes your scorecard, inventory gaps, listing spot-checks and fixes ranked by impact.</p><Link href="/book" className="brand-button">Discuss the full report →</Link></div>
          <p className="brand-fine">{result.snapshot.scoreNote}</p>
        </div>
      </article>
      <details><summary>View the AI observation and source evidence</summary>
        {result.ai.question && <><h3>The shopper question sent to Gemini</h3><blockquote>{result.ai.question}</blockquote><p className="brand-fine">Model: {result.ai.model} · Asked {new Date(result.checkedAt).toLocaleString()} · Search-enabled sample</p></>}
        {result.ai.answer ? <><h3>Gemini’s answer</h3><p className="quick-report-answer">{result.ai.answer}</p></> : <p>{result.ai.message || "Gemini did not return a usable answer. The website findings remain available."}</p>}
        <p><strong>Your site was cited:</strong> {result.ai.siteWasCited === true ? "Yes" : result.ai.siteWasCited === false ? "No, not in this sample" : "Could not determine from this sample"}</p>
        {result.ai.sources.length > 0 && <><h3>Sources in the AI answer</h3><ul>{result.ai.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></>}
        <h3>Inventory field checks</h3><ul>{result.findings.map(finding=><li key={finding.field}>{finding.checked ? `${finding.checked-finding.missing} of ${finding.checked} sampled listing pages expose ${finding.field}.` : `${finding.field}: not assessed — no inventory detail pages identified.`}</li>)}</ul>
        <h3>Pages checked</h3><ul>{result.pages.map(page=><li key={page.url}><a href={page.url} target="_blank" rel="noopener noreferrer">{page.title || page.url}</a></li>)}</ul>
        <p className="brand-fine">{result.note}</p>
      </details>
      <div className="quick-report-delivery"><a className="brand-button secondary" href={`/api/dealer-tools/quick-report/pdf/${result.reportId}`} download="MatchRV-sample-report.pdf">Download PDF</a>{emailReady && <form onSubmit={sendPdf}><button className="brand-button" disabled={emailBusy}>{emailBusy ? "Sending…" : `Email PDF to ${email}`}</button></form>}</div>
      {emailStatus && <p role="status">{emailStatus}</p>}
      <Link href="/book" className="brand-button">Discuss the full audit →</Link>
    </section>}
  </div>;
}
