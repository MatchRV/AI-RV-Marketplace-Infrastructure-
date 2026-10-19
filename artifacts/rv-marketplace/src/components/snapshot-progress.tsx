import { Link } from "wouter";
import { Search, ArrowRight } from "lucide-react";

export function SnapshotProgress({ website, complete = false }: { website: string; complete?: boolean }) {
  return <aside className="snapshot-progress" aria-label={complete ? "Snapshot next steps" : "Snapshot scan confirmation"}>
    <div role="status"><p className="brand-eyebrow"><Search size={16}/>{complete ? "Your snapshot is ready" : "Your website check has started"}</p><h3>{complete ? "Review your snapshot with Jonathan." : "We’re checking the public pages on your website."}</h3><p className="snapshot-submitted-site">{website}</p></div>
    {!complete && <><p>Your report will appear here when the check finishes. The scan looks for:</p><ul className="scan-checklist"><li>Pages and inventory details available to a crawler</li><li>Empty page shells that may depend on client-side JavaScript</li><li>Published unit specifications and structured data</li><li>One Gemini answer to a shopper question near your dealership</li></ul><p className="brand-fine">These checks follow the same evidence categories as the <Link href="/visibility-report">Tacoma RV Center benchmark (57/100)</Link>. Your result is based on your own pages. A public-page check does not reproduce every crawler or run a full JavaScript-rendering audit.</p></>}
    <Link href="/book" className="brand-button">{complete ? "Book my one-on-one readout" : "Skip the wait — book my readout"}<ArrowRight size={16}/></Link><p className="brand-fine">The snapshot stays free. Booking a call does not start a paid report or subscription.</p>
  </aside>;
}
