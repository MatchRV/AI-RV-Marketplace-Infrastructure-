/**
 * Human-side actions on the shared shopping session. Same server API, same
 * state, different actor — this is what keeps the person and the agent
 * looking at one truth.
 */

import type { Constraints } from "@workspace/agent-core";
import { agentApi, type LeadPreviewDto } from "./api";
import {
  applySearchOutcome,
  describeConstraints,
  getSession,
  logLedger,
  setComparison,
  setFocusedUnit,
  setSearching,
  updateLeadPreview,
} from "./session";

export async function humanSearch(next: Constraints, changeText: string): Promise<void> {
  setSearching(true);
  logLedger("human", changeText, describeConstraints(next));
  const res = await agentApi.search(next, 12);
  if (!res.ok) {
    setSearching(false);
    logLedger("system", `search rejected: ${res.error.hint ?? res.error.error}`);
    return;
  }
  applySearchOutcome({
    actor: "human",
    constraints: res.data.appliedConstraints,
    funnel: res.data.funnel,
    results: res.data.results,
    towResolution: res.data.towResolution,
    locationResolution: res.data.locationResolution,
  });
}

export async function humanCompare(unitIds: string[]): Promise<void> {
  const res = await agentApi.compare(unitIds, getSession().constraints);
  if (!res.ok) {
    logLedger("system", `compare failed: ${res.error.error}`);
    return;
  }
  setComparison(res.data, "human");
  logLedger("human", `compared ${unitIds.length} units`);
}

export async function humanFocusUnit(unitId: string): Promise<void> {
  const local = getSession().results.find((m) => m.unit.id === unitId);
  if (local) {
    setFocusedUnit(local.unit, "human");
    return;
  }
  const res = await agentApi.unit(unitId);
  if (res.ok) setFocusedUnit(res.data.unit, "human");
}

export async function humanDecideLead(preview: LeadPreviewDto, decision: "approve" | "reject"): Promise<void> {
  const res = await agentApi.leadDecide(preview.previewId, decision);
  if (!res.ok) {
    logLedger("system", `lead ${decision} failed: ${res.error.error}`);
    return;
  }
  updateLeadPreview(res.data.preview);
  logLedger(
    "human",
    decision === "approve"
      ? `approved the contact request to ${preview.dealer.name}`
      : `declined the contact request to ${preview.dealer.name}`,
  );
}
