/**
 * Dealer-contact (lead) state machine for the agent tool layer.
 *
 * The write path is deliberately two-phase and human-gated, enforced
 * SERVER-side (never by trusting the model):
 *
 *   prepare (agent) → awaiting_human_approval
 *   approve/reject (human click in the page UI) → approved | rejected
 *   submit (agent) → submitted, only from `approved`
 *
 * A submit against anything but an approved preview returns a structured
 * refusal the agent can relay. Duplicate protection: one submitted lead per
 * (unit, email) per server session.
 *
 * Demo posture: submitted leads are recorded in MatchRV's buyer_leads table
 * (or in memory when even the embedded DB is unavailable) and NO message is
 * delivered to a real dealership from the demo environment.
 */

import { randomBytes } from "node:crypto";
import { db, buyerLeadsTable, DB_MODE } from "@workspace/db";
import type { CanonicalUnit, Constraints } from "@workspace/agent-core";

export type PreviewStatus =
  | "awaiting_human_approval"
  | "approved"
  | "rejected"
  | "submitted"
  | "expired";

export interface LeadPreview {
  previewId: string;
  createdAt: string;
  status: PreviewStatus;
  unitId: string;
  unitTitle: string;
  unitPrice: number | null;
  dealer: { name: string; city: string; state: string; website: string | null };
  customer: { name: string; email: string; phone: string | null };
  message: string;
  consent: string;
  decidedAt: string | null;
  submittedLeadId: number | string | null;
}

const PREVIEW_TTL_MS = 30 * 60 * 1000;

const previews = new Map<string, LeadPreview>();
const submittedKeys = new Set<string>(); // `${unitId}|${email}`

function sweep(): void {
  const cutoff = Date.now() - PREVIEW_TTL_MS;
  for (const [id, p] of previews.entries()) {
    if (p.status === "awaiting_human_approval" && Date.parse(p.createdAt) < cutoff) {
      p.status = "expired";
    }
    if (Date.parse(p.createdAt) < cutoff - PREVIEW_TTL_MS) previews.delete(id);
  }
}

export const CONSENT_LINE =
  "By approving, you ask MatchRV to send your name, contact info, and this message to the dealership about this unit. Nothing is sent until you approve.";

export function draftMessage(unit: CanonicalUnit, constraints: Constraints, unknowns: string[]): string {
  const bits: string[] = [];
  bits.push(
    `Hi ${unit.dealer.name}, I'm interested in the ${unit.title} (stock ${unit.stockNumber ?? "n/a"}) listed at $${unit.priceUsd.value?.toLocaleString() ?? "—"}.`,
  );
  if (constraints.towVehicle) bits.push(`I'd be towing with a ${constraints.towVehicle}.`);
  if (unknowns.length > 0) {
    bits.push(`Could you confirm: ${unknowns.slice(0, 3).join(", ")}?`);
  }
  bits.push("Is it still available, and when could I come see it?");
  return bits.join(" ");
}

export function createPreview(args: {
  unit: CanonicalUnit;
  customer: { name: string; email: string; phone?: string | null };
  message: string;
}): LeadPreview {
  sweep();
  const preview: LeadPreview = {
    previewId: `prv_${randomBytes(9).toString("base64url")}`,
    createdAt: new Date().toISOString(),
    status: "awaiting_human_approval",
    unitId: args.unit.id,
    unitTitle: args.unit.title,
    unitPrice: args.unit.priceUsd.value,
    dealer: {
      name: args.unit.dealer.name,
      city: args.unit.dealer.city,
      state: args.unit.dealer.state,
      website: args.unit.dealer.website,
    },
    customer: {
      name: args.customer.name,
      email: args.customer.email,
      phone: args.customer.phone ?? null,
    },
    message: args.message,
    consent: CONSENT_LINE,
    decidedAt: null,
    submittedLeadId: null,
  };
  previews.set(preview.previewId, preview);
  return preview;
}

export function getPreview(id: string): LeadPreview | null {
  sweep();
  return previews.get(id) ?? null;
}

export function decidePreview(id: string, decision: "approved" | "rejected"): LeadPreview | null {
  const p = getPreview(id);
  if (!p) return null;
  if (p.status !== "awaiting_human_approval") return p;
  p.status = decision;
  p.decidedAt = new Date().toISOString();
  return p;
}

export type SubmitResult =
  | { ok: true; preview: LeadPreview; leadId: number | string; recordedAt: string; delivery: string }
  | { ok: false; code: "not_found" | "awaiting_human_approval" | "rejected" | "expired" | "already_submitted" | "duplicate"; guidance: string };

export async function submitPreview(id: string): Promise<SubmitResult> {
  const p = getPreview(id);
  if (!p) {
    return { ok: false, code: "not_found", guidance: "Unknown preview_id — call prepare_dealer_contact first." };
  }
  if (p.status === "awaiting_human_approval") {
    return {
      ok: false,
      code: "awaiting_human_approval",
      guidance:
        "The human has not approved this contact request yet. Ask them to review the preview shown on the MatchRV page and click Approve — do not retry until they say they have.",
    };
  }
  if (p.status === "rejected") {
    return { ok: false, code: "rejected", guidance: "The human declined this contact request. Do not resubmit; ask what they'd like to change." };
  }
  if (p.status === "expired") {
    return { ok: false, code: "expired", guidance: "This preview expired unapproved. Prepare a new one if the shopper still wants it." };
  }
  if (p.status === "submitted") {
    return { ok: false, code: "already_submitted", guidance: "This contact request was already submitted — no need to repeat it." };
  }

  const dedupeKey = `${p.unitId}|${p.customer.email.toLowerCase()}`;
  if (submittedKeys.has(dedupeKey)) {
    p.status = "rejected";
    return {
      ok: false,
      code: "duplicate",
      guidance: "A contact request for this unit and email was already submitted in this session. The dealership has it — don't send another.",
    };
  }

  let leadId: number | string;
  try {
    const [row] = await db
      .insert(buyerLeadsTable)
      .values({
        listingId: null,
        dealerId: null,
        listingSnapshot: {
          unitId: p.unitId,
          title: p.unitTitle,
          price: p.unitPrice,
          dealer: p.dealer,
        },
        buyerProfile: { source: "webmcp_agent" },
        contactName: p.customer.name,
        contactEmail: p.customer.email,
        contactPhone: p.customer.phone,
        message: p.message,
        leadSource: "webmcp_agent",
        status: "new",
      })
      .returning({ id: buyerLeadsTable.id });
    leadId = row.id;
  } catch (err) {
    // Even without a writable DB the demo keeps a receipt in memory.
    console.warn("[agent] lead DB write failed, keeping in-memory receipt:", err);
    leadId = `mem_${randomBytes(6).toString("base64url")}`;
  }

  p.status = "submitted";
  p.submittedLeadId = leadId;
  submittedKeys.add(dedupeKey);

  return {
    ok: true,
    preview: p,
    leadId,
    recordedAt: new Date().toISOString(),
    delivery: `Recorded in MatchRV's lead queue (${DB_MODE} database). Demo environment: nothing is delivered to the real dealership.`,
  };
}

/** Test hook: reset in-memory state. */
export function __resetLeadStore(): void {
  previews.clear();
  submittedKeys.clear();
}
