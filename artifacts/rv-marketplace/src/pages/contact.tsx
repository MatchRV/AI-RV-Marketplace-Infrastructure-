import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import { Mail, CheckCircle2 } from "lucide-react";
import { trackLead } from "@/lib/analytics";

export function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]))) });
      if (!response.ok) throw new Error("Your message could not be sent. Try again or email Jonathan directly.");
      trackLead("dealer_contact_form", { formId: "dealer_contact", dedupeKey: form.email.trim().toLowerCase() });
      setSubmitted(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your message could not be sent. Please try again."); }
    finally { setBusy(false); }
  }
  return <BrandLayout><SEO title="Contact MatchRV — Dealer Services & Support" description="Talk to Jonathan about dealership AI visibility audits, inventory syndication, managed advertising, MCP support, or compliance." canonical="/contact"/>
    <section className="brand-container brand-section contact-page" data-page="dealer-contact"><p className="brand-eyebrow"><Mail size={16}/> Dealer services and support</p><h1>Let’s talk about your inventory.</h1><p className="brand-lead">Ask about an audit, monthly inventory services, the ChatGPT ads pilot, or your MatchRV connection.</p><p>Support and compliance: <a className="brand-text-link" href="mailto:jonathan@matchrv.com">jonathan@matchrv.com</a></p>
      {submitted ? <div className="contact-confirmation" role="status"><CheckCircle2 size={36}/><h2>Your message has been sent.</h2><p>Jonathan will review your request and respond using the contact information you provided.</p><Link href="/book" className="brand-button">Book a conversation</Link></div> : <form id="dealer_contact" className="brand-contact-form" onSubmit={submit} aria-busy={busy}>
        <div className="contact-input-row"><label htmlFor="contact-name">Name<input id="contact-name" autoComplete="name" value={form.name} onChange={event => update("name", event.target.value)} minLength={2} maxLength={120} required disabled={busy}/></label><label htmlFor="contact-email">Work email<input id="contact-email" type="email" autoComplete="email" value={form.email} onChange={event => update("email", event.target.value)} maxLength={254} required disabled={busy}/></label></div>
        <label htmlFor="contact-subject">Subject<input id="contact-subject" value={form.subject} onChange={event => update("subject", event.target.value)} maxLength={200} required disabled={busy}/></label>
        <label htmlFor="contact-message">How can we help?<textarea id="contact-message" value={form.message} onChange={event => update("message", event.target.value)} maxLength={5000} required disabled={busy}/></label>
        <p className="brand-fine">We use these details to respond to your request. See our <Link href="/privacy">Privacy Policy</Link>. Please leave passwords and private customer information out of your message.</p>
        {error && <p className="brand-error" role="alert">{error}</p>}<button className="brand-button" type="submit" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
      </form>}
    </section></BrandLayout>;
}
