/**
 * Website "Contact Dealer" → the same dealer-inquiry system the MatchRV MCP
 * uses (POST /api/inquiries). It works on the database-free deployment and
 * lands every lead in the MatchRV lead inbox (/ops/leads).
 *
 * The API is two-step (preview, then confirmed send). On the website the
 * shopper has already typed the message and pressed "Contact Dealer", which is
 * the explicit approval, so both steps run back to back here.
 */
export interface DealerInquiryInput {
  unitId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  message: string;
  /** Only when the shopper ticked "Share my payment numbers with the dealer" (off by default). */
  paymentEstimate?: import("./payment-calc").PaymentEstimatePayload | null;
}
export type DealerInquiryResult =
  | { ok: true; inquiryId: string; status: string; statusDetail: string; statusToken?: string }
  | { ok: false; error: string };

/** How often the shopper page re-reads a queued inquiry. The safety sweep is separate. */
export const SHOPPER_STATUS_POLL_MS = 60_000;

/** Shopper-facing wording. Queued is not forwarded, and forwarded is not a dealer reply. */
export function shopperInquiryStatusCopy(status: string, dealerName: string): string {
  switch (status) {
    case "forwarded":
      return `MatchRV forwarded your message to ${dealerName}. They can reply to you directly. This does not mean they have replied yet.`;
    case "delivered":
      return `Sent to ${dealerName}. Their mail server accepted it. This does not mean they have replied yet.`;
    case "queued_for_matchrv":
      return `MatchRV received your message and will forward it to ${dealerName}. It has not reached the dealership yet.`;
    case "dry_run":
      return "Test mode: your request was checked but not sent to the dealer.";
    default:
      return `MatchRV has your message and is still working on reaching ${dealerName}.`;
  }
}

export async function fetchShopperInquiryStatus(
  base: string,
  inquiryId: string,
  statusToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ status: string; statusDetail: string } | null> {
  const root = base.endsWith("/") ? base : `${base}/`;
  try {
    const res = await fetchImpl(`${root}api/inquiries/${encodeURIComponent(inquiryId)}`, {
      headers: { "x-inquiry-token": statusToken },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { inquiry?: { status?: string; statusDetail?: string } };
    if (!body.inquiry?.status) return null;
    return { status: body.inquiry.status, statusDetail: body.inquiry.statusDetail ?? "" };
  } catch {
    return null;
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const FRIENDLY: Record<string, string> = {
  invalid_contact: "Please check your name, email or phone and try again.",
  unit_not_found: "This RV is no longer listed. Please contact the dealership directly.",
  unit_unavailable: "This RV is no longer listed. Please contact the dealership directly.",
  rate_limited: "Too many messages were sent recently. Please try again later.",
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; guidance?: string; errors?: { problem?: string }[] };
    const first = body.errors?.find((e) => e?.problem)?.problem;
    return first ?? FRIENDLY[body.error ?? ""] ?? body.guidance ?? fallback;
  } catch {
    return fallback;
  }
}

export async function sendDealerInquiry(input: DealerInquiryInput, base = "/", fetchImpl: FetchLike = fetch): Promise<DealerInquiryResult> {
  const url = `${base.endsWith("/") ? base : `${base}/`}api/inquiries`;
  const headers = { "Content-Type": "application/json" };
  try {
    const prep = await fetchImpl(url, {
      method: "POST", headers,
      body: JSON.stringify({
        unit_id: input.unitId,
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        message: input.message,
        ...(input.paymentEstimate ? { payment_estimate: input.paymentEstimate } : {}),
      }),
    });
    if (!prep.ok) return { ok: false, error: await readError(prep, "Unable to send message. Please try again.") };
    const { confirmationToken } = (await prep.json()) as { confirmationToken?: string };
    if (!confirmationToken) return { ok: false, error: "Unable to send message. Please try again." };
    const sent = await fetchImpl(url, {
      method: "POST", headers,
      body: JSON.stringify({ confirmation_token: confirmationToken, confirmed: true }),
    });
    if (!sent.ok) return { ok: false, error: await readError(sent, "Unable to send message. Please try again.") };
    const body = (await sent.json()) as { inquiry?: { inquiryId: string; status: string; statusDetail: string }; statusToken?: string | null };
    const inquiry = body.inquiry;
    if (!inquiry) return { ok: false, error: "Unable to send message. Please try again." };
    if (inquiry.status === "failed") return { ok: false, error: inquiry.statusDetail || "We couldn't reach the dealership right now. Please contact them directly." };
    return {
      ok: true,
      inquiryId: inquiry.inquiryId,
      status: inquiry.status,
      statusDetail: inquiry.statusDetail,
      ...(body.statusToken ? { statusToken: body.statusToken } : {}),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
