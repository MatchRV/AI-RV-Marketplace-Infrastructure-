import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { SiteLayout } from "@/components/site/site-layout";
import { SEO } from "@/components/seo";
import { Icon } from "@/components/site/icon";
import { SITE } from "@/config/site";
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
  return <SiteLayout>
    <SEO title="Contact MatchRV — Dealer Services & Support" description="Talk to Jonathan about dealership AI visibility audits, monthly inventory services, LotAI, MCP support, or compliance." canonical="/contact"/>
    <section className="page-hero" aria-labelledby="page-title">
      <div className="page-hero__bg" aria-hidden="true">
        <div className="grain"></div>
      </div>
      <div className="container">
        <p className="eyebrow eyebrow--live"><Icon name="mail"/> Dealer services and support</p>
        <h1 id="page-title" className="display display--md"><span className="line"><span>Let’s talk about</span></span> <span className="line"><span><em>your inventory.</em></span></span></h1>
        <p className="lead">Ask about an audit, monthly inventory services, LotAI, or your MatchRV connection.</p>
      </div>
    </section>
    <section className="section section--tight-top" aria-labelledby="contact-title" data-page="dealer-contact">
      <div className="container booking">
        <div className="booking__info" data-reveal>
          <h2 id="contact-title" className="h2">Send a message</h2>
          <p>Support and compliance:<br/><a className="text-link" href={`mailto:${SITE.email}`}>{SITE.email}</a></p>
          <p>Call the MatchRV team:<br/><a className="text-link" href={SITE.phoneHref}>{SITE.phone}</a></p>
          <p className="notice">Prefer to talk it through? <Link className="text-link" href="/book">Book a call with Jonathan.</Link></p>
        </div>
        <div className="snapshot__panel" data-reveal>
          {submitted ? <div className="confirm" role="status">
            <span className="confirm__icon"><Icon name="check"/></span>
            <h2 className="h3">Your message has been sent.</h2>
            <p>Jonathan will review your request and respond using the contact information you provided.</p>
            <Link className="btn btn--primary" href="/book">Book a conversation <Icon name="arrow"/></Link>
          </div> : <form id="dealer_contact" className="form" onSubmit={submit} aria-busy={busy}>
            <div className="form__grid">
              <label className="field" htmlFor="contact-name"><span>Name</span><input id="contact-name" autoComplete="name" value={form.name} onChange={event => update("name", event.target.value)} minLength={2} maxLength={120} required disabled={busy}/></label>
              <label className="field" htmlFor="contact-email"><span>Work email</span><input id="contact-email" type="email" autoComplete="email" value={form.email} onChange={event => update("email", event.target.value)} maxLength={254} required disabled={busy}/></label>
              <label className="field field--wide" htmlFor="contact-subject"><span>Subject</span><input id="contact-subject" value={form.subject} onChange={event => update("subject", event.target.value)} maxLength={200} required disabled={busy}/></label>
              <label className="field field--wide" htmlFor="contact-message"><span>How can we help?</span><textarea id="contact-message" rows={6} value={form.message} onChange={event => update("message", event.target.value)} maxLength={5000} required disabled={busy}/></label>
            </div>
            <p className="fine">We use these details to respond to your request. See our <Link className="text-link" href="/privacy">Privacy Policy</Link>. Please leave passwords and private customer information out of your message.</p>
            {error && <p className="form__status is-error" role="alert">{error}</p>}
            <button className="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}><span>{busy ? "Sending…" : "Send message"}</span> <Icon name="arrow"/></button>
          </form>}
        </div>
      </div>
    </section>
  </SiteLayout>;
}
