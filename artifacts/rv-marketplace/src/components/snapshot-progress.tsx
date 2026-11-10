import { Link } from "wouter";
import { Icon } from "@/components/site/icon";
import { SITE } from "@/config/site";

export function SnapshotProgress({ website, complete = false }: { website: string; complete?: boolean }) {
  return <aside className="snap-progress" aria-label={complete ? "Snapshot next steps" : "Snapshot scan confirmation"}>
    <div role="status">
      <p className="eyebrow"><Icon name="search"/> {complete ? "Your snapshot is ready" : "Your website check has started"}</p>
      <h3 className="h4">{complete ? "Review your snapshot with Jonathan." : "We’re checking the public pages on your website."}</h3>
      <p className="snap-progress__site">{website}</p>
    </div>
    {!complete && <>
      <p>Your report will appear here when the check finishes. The scan looks for:</p>
      <ul className="ticks">
        <li><Icon name="check"/> Pages and inventory details available to a crawler</li>
        <li><Icon name="check"/> Empty page shells that may depend on client-side JavaScript</li>
        <li><Icon name="check"/> Published unit specifications and structured data</li>
        <li><Icon name="check"/> One Gemini answer to a shopper question near your dealership</li>
      </ul>
      <p className="fine">These checks follow the same evidence categories as the <Link href="/visibility-report">sample {SITE.sampleDealer} audit (57/100)</Link>. Your result is based on your own pages. A public-page check does not reproduce every crawler or run a full JavaScript-rendering audit.</p>
    </>}
    <Link href="/book" className="btn btn--primary">{complete ? "Book my one-on-one readout" : "Skip the wait — book my readout"} <Icon name="arrow"/></Link>
    <p className="fine">The snapshot stays free. Booking a call does not start a paid report or subscription.</p>
  </aside>;
}
