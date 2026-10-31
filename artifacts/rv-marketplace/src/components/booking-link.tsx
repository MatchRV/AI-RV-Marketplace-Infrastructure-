import type { ReactNode } from "react";
import { BOOKING_URL } from "@/config/booking";
import { trackLead } from "@/lib/analytics";

/**
 * Outbound link to the Google Calendar booking page. Records one
 * book_demo_click per session per placement — an intent signal, since the
 * booking itself is confirmed by Google Calendar, not this site.
 */
export function BookingLink({ placement, className = "brand-button", children }: { placement: string; className?: string; children: ReactNode }) {
  return <a
    className={className}
    href={BOOKING_URL}
    target="_blank"
    rel="noopener noreferrer"
    onClick={() => trackLead("book_demo_click", { dedupeKey: placement, metadata: { placement } })}
  >{children}</a>;
}
