import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";

type QuickReportResult = {
  reportId: string;
  website: string;
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
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
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
        body: JSON.stringify({ website, city, state }),
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
        body: JSON.stringify({ reportId: result.reportId, email }),
      });
      const payload = await response.json();
      setEmailStatus(response.ok ? "Your PDF has been sent. Check your inbox." : payload.message || "We could not send the PDF right now.");
    } catch { setEmailStatus("We could not send the PDF right now. Please try again later."); }
    finally { setEmailBusy(false); }
  }

  return <div className="quick-report">
    <p className="brand-eyebrow">Free website sample report</p>
    <h2>Get a sample report of your website now, for free.</h2>
    <p>Enter your dealership website and location. We’ll check a sample of your public pages and ask Gemini one real RV shopper question near your dealership. No account or card required.</p>
    <form onSubmit={run} className="quick-report-form">
      <label>Dealership website<input type="text" value={website} onChange={event => setWebsite(event.target.value)} placeholder="tacomarv.com" autoComplete="url" maxLength={300} required disabled={busy} /></label>
      <label>City<input value={city} onChange={event => setCity(event.target.value)} placeholder="Tacoma" autoComplete="address-level2" maxLength={80} required disabled={busy} /></label>
      <label>State<input value={state} onChange={event => setState(event.target.value)} placeholder="Washington" autoComplete="address-level1" maxLength={80} required disabled={busy} /></label>
      <button className="brand-button" type="submit" disabled={busy || !ready}>{busy ? "Checking your website…" : ready === null ? "Checking availability…" : ready ? "Get my free sample report" : "Free report is offline"}</button>
    </form>
    {ready === false && <p className="brand-fine" role="status">The live AI check is being connected. You can still <Link href="/book">book a report call</Link>.</p>}
    {busy && <div className="quick-report-wait" role="status"><div><strong>Your check is running.</strong><p>We’re sampling public inventory pages and asking Gemini a shopper question near {city}, {state}. Watch this short video while you wait; the result will appear as soon as it is ready.</p></div><video controls autoPlay muted playsInline preload="metadata" aria-label="The Invisible RV Market video"><source src="/websitevideo.mp4" type="video/mp4" /></video></div>}
    {error && <p className="brand-error" role="alert">{error}</p>}
    {result && <section className="quick-report-result" aria-label="Your free quick report" aria-live="polite">
      <p className="brand-eyebrow">Your free quick report · {new Date(result.checkedAt).toLocaleDateString()}</p>
      <h2>What we found for {new URL(result.website).hostname.replace(/^www\./, "")} · {result.location}</h2>
      <p>We checked {result.pages.length} public {result.pages.length === 1 ? "page" : "pages"} on <a href={result.website} target="_blank" rel="noopener noreferrer">{new URL(result.website).hostname}</a>.</p>
      <h3>Inventory information on sampled pages</h3>
      <ul>{result.findings.map(finding => <li key={finding.field} className={finding.missing === 0 ? "quick-report-finding-positive" : undefined}>{finding.missing === 0 ? <><strong>✓ {finding.checked} of {finding.checked}</strong> exposed {finding.field}.</> : <><strong>{finding.missing} of {finding.checked}</strong> missing {finding.field}.</>}</li>)}</ul>
      {result.ai.question && <><h3>Shopper question based on sampled inventory</h3><blockquote>{result.ai.question}</blockquote><p className="brand-fine">Model: {result.ai.model} · Asked {new Date(result.checkedAt).toLocaleString()} · Search-enabled sample</p></>}
      {result.ai.answer ? <><h3>Gemini’s cited answer</h3><p className="quick-report-answer">{result.ai.answer}</p></> : <p>{result.ai.message || "Gemini did not return a usable answer. The website findings above are still available."}</p>}
      <p><strong>Your site was cited:</strong> {result.ai.siteWasCited === true ? "Yes" : result.ai.siteWasCited === false ? "No, not in this sample" : "Could not determine from this sample"}</p>
      {result.ai.sources.length > 0 && <><h3>Sources in the AI answer</h3><ul>{result.ai.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></li>)}</ul></>}
      <details><summary>Pages checked</summary><ul>{result.pages.map(page => <li key={page.url}><a href={page.url} target="_blank" rel="noopener noreferrer">{page.title || page.url}</a></li>)}</ul></details>
      <p className="brand-fine">{result.note}</p>
      {emailReady && <div className="quick-report-email"><h3>Email me the PDF</h3><p>Optional. Your report is already shown above.</p><form onSubmit={sendPdf}><label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@dealership.com" required maxLength={254}/></label><button className="brand-button" disabled={emailBusy}>{emailBusy ? "Sending…" : "Email my PDF"}</button></form>{emailStatus && <p role="status">{emailStatus}</p>}</div>}
      <Link href="/book" className="brand-button">Discuss the full audit →</Link>
    </section>}
  </div>;
}

