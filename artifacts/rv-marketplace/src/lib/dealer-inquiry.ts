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
}
export type DealerInquiryResult =
  | { ok: true; inquiryId: string; status: string; statusDetail: string }
  | { ok: false; error: string };

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
    const { inquiry } = (await sent.json()) as { inquiry?: { inquiryId: string; status: string; statusDetail: string } };
    if (!inquiry) return { ok: false, error: "Unable to send message. Please try again." };
    if (inquiry.status === "failed") return { ok: false, error: inquiry.statusDetail || "We couldn't reach the dealership right now. Please contact them directly." };
    return { ok: true, inquiryId: inquiry.inquiryId, status: inquiry.status, statusDetail: inquiry.statusDetail };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}
