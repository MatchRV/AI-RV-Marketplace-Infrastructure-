import { useEffect, useState } from "react";
import { ArrowUpRight, Building2, CheckCircle2, MapPin, X } from "lucide-react";
import { sendDealerInquiry } from "@/lib/dealer-inquiry";
import { trackLead } from "@/lib/analytics";
import { trackSwipe } from "@/lib/swipe-analytics";
import { cardFacts, cardPlace, cardTitle, defaultInquiryMessage, formatPrice, inquiryFormValid, inquiryPayload, type InquiryForm, type SwipeCard } from "@/lib/swipe-deck";
import { NAVY, TEAL, TEAL_DARK, LINE } from "./tokens";

const BASE = import.meta.env.BASE_URL || "/";

interface Detail { dealer: { name: string; city: string; state: string }; hasDealerPage: boolean }

/** Detail view: reveals the dealer and lot next to the primary "See it in person" action. */
export function DetailSheet({ card, onClose, initialForm = false }: { card: SwipeCard; onClose: () => void; initialForm?: boolean }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [showForm, setShowForm] = useState(initialForm);
  const [form, setForm] = useState<InquiryForm>({ name: "", email: "", phone: "", message: defaultInquiryMessage(card) });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ status: string } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`${BASE}api/swipe/units/${encodeURIComponent(card.id)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Detail) => { if (live) setDetail(d); })
      .catch(() => { if (live) setLoadError(true); });
    return () => { live = false; };
  }, [card.id]);

  const dealerName = detail?.dealer.name ?? "the dealer";
  const lot = detail ? `${detail.dealer.city}, ${detail.dealer.state}` : null;
  const title = cardTitle(card);

  const submit = async () => {
    if (!inquiryFormValid(form) || sending) return;
    setSending(true); setError(null);
    try {
      const r = await sendDealerInquiry(inquiryPayload(card.id, form), BASE);
      if (!r.ok) { setError(r.error); return; }
      setSent({ status: r.status });
      trackSwipe("inquiry_submitted", { unitId: card.id, status: r.status });
      if (r.status !== "dry_run") trackLead("buyer_dealer_inquiry", { formId: "swipe_see_in_person", dedupeKey: card.id, metadata: { source: "swipe_deck", unitId: card.id } });
    } finally { setSending(false); }
  };

  const input = "w-full rounded-xl px-3 py-2.5 text-base bg-white";
  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label={`${title} details`} style={{ background: "rgba(11,31,58,.6)" }}>
      <div className="mt-auto w-full max-w-md mx-auto bg-white rounded-t-3xl overflow-y-auto" style={{ maxHeight: "100%" }}>
        <div className="relative">
          <div className="flex overflow-x-auto snap-x snap-mandatory" style={{ aspectRatio: "16 / 10" }}>
            {card.photos.map((p, i) => <img key={p} src={p} alt={`${title} photo ${i + 1}`} className="w-full h-full object-cover shrink-0 snap-center" />)}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow"><X size={20} color={NAVY} /></button>
        </div>
        <div className="p-5">
          <h2 className="text-xl font-extrabold leading-tight" style={{ color: NAVY }}>{title}</h2>
          <p className="mt-1 text-2xl font-black" style={{ color: TEAL_DARK }}>{formatPrice(card.priceUsd)}</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {cardFacts(card).map((f) => <li key={f} className="text-[0.8rem] font-semibold rounded-full px-3 py-1" style={{ background: "#F2F6FA", color: NAVY, border: `1px solid ${LINE}` }}>{f}</li>)}
          </ul>

          <section className="mt-4 rounded-2xl p-4" style={{ background: "#F2F6FA", border: `1px solid ${LINE}` }} aria-label="Dealer">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sold by</p>
            <p className="mt-1 flex items-center gap-2 text-lg font-extrabold" style={{ color: NAVY }} data-testid="detail-dealer"><Building2 size={18} color={TEAL_DARK} /> {detail ? detail.dealer.name : loadError ? "Dealer details unavailable" : "Loading…"}</p>
            {lot && <p className="mt-0.5 flex items-center gap-2 text-sm text-slate-600"><MapPin size={15} color={TEAL_DARK} /> Lot: {lot}{typeof card.distanceMiles === "number" ? ` · ${card.distanceMiles} mi away` : ""}</p>}
            {!showForm && !sent && (
              <button type="button" disabled={!detail} onClick={() => setShowForm(true)} className="mt-4 w-full rounded-full py-3.5 text-base font-extrabold disabled:opacity-50" style={{ background: NAVY, color: TEAL }}>See it in person</button>
            )}
            {detail?.hasDealerPage && (
              <a href={`${BASE}api/out?unit=${encodeURIComponent(card.id)}&from=swipe`} target="_blank" rel="noopener" className="mt-3 flex items-center justify-center gap-1 text-sm font-bold underline underline-offset-4" style={{ color: NAVY }}>
                View on dealer site <ArrowUpRight size={15} />
              </a>
            )}
          </section>

          {showForm && !sent && detail && (
            <form className="mt-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} aria-label="See it in person">
              <h3 className="text-base font-extrabold" style={{ color: NAVY }}>See it in person</h3>
              <p className="mt-1 mb-3 text-sm text-slate-600" data-testid="inquiry-recipient">
                Your name, contact info and message go to <strong style={{ color: NAVY }}>{dealerName}</strong> ({lot}) through MatchRV, so they can reply about this RV. Nothing is sent until you tap Send.
              </p>
              <label className="block text-xs font-bold mb-1" style={{ color: NAVY }} htmlFor="inq-name">Name</label>
              <input id="inq-name" autoComplete="name" className={input} style={{ border: `1px solid ${LINE}` }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <label className="block text-xs font-bold mt-3 mb-1" style={{ color: NAVY }} htmlFor="inq-email">Email</label>
              <input id="inq-email" type="email" autoComplete="email" className={input} style={{ border: `1px solid ${LINE}` }} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <label className="block text-xs font-bold mt-3 mb-1" style={{ color: NAVY }} htmlFor="inq-phone">Phone (optional if you gave an email)</label>
              <input id="inq-phone" type="tel" autoComplete="tel" className={input} style={{ border: `1px solid ${LINE}` }} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <label className="block text-xs font-bold mt-3 mb-1" style={{ color: NAVY }} htmlFor="inq-msg">Message</label>
              <textarea id="inq-msg" rows={3} className={`${input} resize-none`} style={{ border: `1px solid ${LINE}` }} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              {error && <p className="mt-2 text-sm text-rose-700" role="alert">{error}</p>}
              <button type="submit" disabled={!inquiryFormValid(form) || sending} className="mt-4 w-full rounded-full py-3.5 text-base font-extrabold disabled:opacity-50" style={{ background: TEAL, color: NAVY }}>
                {sending ? "Sending…" : `Send to ${dealerName}`}
              </button>
            </form>
          )}

          {sent && (
            <div className="mt-4 rounded-2xl p-4 flex gap-3" style={{ border: `1.5px solid ${TEAL}` }} role="status">
              <CheckCircle2 color={TEAL_DARK} className="shrink-0" />
              <p className="text-sm" style={{ color: NAVY }}>
                {sent.status === "dry_run"
                  ? "Test mode: your request was checked but not sent to the dealer."
                  : sent.status === "delivered"
                    ? `Sent to ${dealerName}. They'll reply to the contact info you gave.`
                    : `Received. MatchRV will pass your request to ${dealerName}.`}
              </p>
            </div>
          )}
          <p className="mt-5 text-xs text-slate-500">Price and details come from the dealer's listing. Confirm availability with the dealer.</p>
        </div>
      </div>
    </div>
  );
}
