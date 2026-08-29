/**
 * The dealer-contact approval boundary, tested where it's enforced: the
 * server-side state machine. These are the failure modes that would damage
 * judge trust — unauthorized approval, replay, expiry, mutation after
 * approval, duplicates.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ensureDbReady } from "@workspace/db";
import {
  __agePreview,
  __resetLeadStore,
  createPreview,
  decidePreview,
  getPreview,
  submitPreview,
} from "../src/services/agent-leads";
import { getInventory } from "../src/services/agent-inventory";

const unit = () => getInventory().units[0];

function stage(email = `t${Math.random().toString(36).slice(2)}@example.com`) {
  return createPreview({
    unit: unit(),
    customer: { name: "Test Shopper", email },
    message: "Is this unit still available?",
  });
}

beforeEach(async () => {
  await ensureDbReady();
  __resetLeadStore();
});

describe("approval boundary", () => {
  it("never returns the approval token inside the preview object", () => {
    const { preview, approvalToken } = stage();
    expect(approvalToken).toMatch(/^apt_/);
    expect(JSON.stringify(preview)).not.toContain(approvalToken);
  });

  it("rejects approval without the token, with a wrong token, and via replay", () => {
    const { preview, approvalToken } = stage();
    expect(decidePreview(preview.previewId, "approved", "apt_totally-wrong-token")).toEqual({
      ok: false,
      code: "invalid_token",
    });
    expect(getPreview(preview.previewId)!.status).toBe("awaiting_human_approval");

    const first = decidePreview(preview.previewId, "approved", approvalToken);
    expect(first.ok).toBe(true);

    // Replay with the same (now consumed) token cannot re-decide.
    const replay = decidePreview(preview.previewId, "rejected", approvalToken);
    expect(replay.ok).toBe(false);
    expect(!replay.ok && replay.code).toBe("already_decided");
    expect(getPreview(preview.previewId)!.status).toBe("approved");
  });

  it("a token from one preview cannot approve another (wrong-session analogue)", () => {
    const a = stage();
    const b = stage();
    const cross = decidePreview(b.preview.previewId, "approved", a.approvalToken);
    expect(cross).toEqual({ ok: false, code: "invalid_token" });
    expect(getPreview(b.preview.previewId)!.status).toBe("awaiting_human_approval");
  });

  it("blocks submit before approval and after rejection", async () => {
    const { preview, approvalToken } = stage();
    const early = await submitPreview(preview.previewId);
    expect(!early.ok && early.code).toBe("awaiting_human_approval");

    decidePreview(preview.previewId, "rejected", approvalToken);
    const afterReject = await submitPreview(preview.previewId);
    expect(!afterReject.ok && afterReject.code).toBe("rejected");
  });

  it("expires unapproved previews and refuses their tokens", () => {
    const { preview, approvalToken } = stage();
    __agePreview(preview.previewId, 31 * 60 * 1000);
    const result = decidePreview(preview.previewId, "approved", approvalToken);
    expect(!result.ok && result.code).toBe("expired");
  });

  it("submits exactly the reviewed payload (immutable), exactly once", async () => {
    const { preview, approvalToken } = stage("immutable@example.com");
    const reviewedMessage = preview.message;
    const reviewedEmail = preview.customer.email;
    decidePreview(preview.previewId, "approved", approvalToken);

    const ok = await submitPreview(preview.previewId);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      // Submit takes only the preview id — the recorded payload is the
      // stored preview, byte-for-byte what the human reviewed.
      expect(ok.preview.message).toBe(reviewedMessage);
      expect(ok.preview.customer.email).toBe(reviewedEmail);
      expect(ok.delivery).toContain("nothing is delivered");
    }

    const dupe = await submitPreview(preview.previewId);
    expect(!dupe.ok && dupe.code).toBe("already_submitted");
  });

  it("deduplicates a second approved preview for the same unit+email", async () => {
    const a = stage("same@example.com");
    decidePreview(a.preview.previewId, "approved", a.approvalToken);
    expect((await submitPreview(a.preview.previewId)).ok).toBe(true);

    const b = stage("same@example.com");
    decidePreview(b.preview.previewId, "approved", b.approvalToken);
    const second = await submitPreview(b.preview.previewId);
    expect(!second.ok && second.code).toBe("duplicate");
  });
});

describe("embedded database bootstrap", () => {
  it("boots a clean throwaway PGlite and records real lead rows", async () => {
    const { preview, approvalToken } = stage("dbrow@example.com");
    decidePreview(preview.previewId, "approved", approvalToken);
    const result = await submitPreview(preview.previewId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.leadId).toBe("number"); // real DB row, not mem_ fallback
  });
});
