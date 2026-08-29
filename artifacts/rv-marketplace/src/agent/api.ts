/**
 * Typed fetch wrappers for /api/agent/*. Non-2xx responses resolve (not
 * throw) with the server's structured error body so tool handlers can hand
 * agents something they can self-correct from.
 */

import type {
  CompareResult,
  Constraints,
  CanonicalUnit,
  SearchFunnel,
  TowFitResult,
  TowResolution,
  UnitMatch,
} from "@workspace/agent-core";

const BASE = import.meta.env.BASE_URL ?? "/";

export interface AgentApiError {
  error: string;
  issues?: string[];
  hint?: string;
  guidance?: string;
  detail?: string;
  status: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: AgentApiError };

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`${BASE}api/agent${path}`, {
      headers: { "content-type": "application/json" },
      ...init,
    });
    const body = (await res.json().catch(() => ({ error: "invalid_response" }))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: { status: res.status, ...(body as object) } as AgentApiError };
    }
    return { ok: true, data: body as T };
  } catch {
    return {
      ok: false,
      error: { status: 0, error: "network_error", guidance: "The MatchRV API is unreachable — tell the human the page lost its connection." },
    };
  }
}

export interface SearchResponse {
  funnel: SearchFunnel;
  towResolution: TowResolution | null;
  locationResolution: { place: string; lat: number; lng: number } | null;
  appliedConstraints: Constraints;
  results: UnitMatch[];
  shownToAgent: number;
}

export const agentApi = {
  search: (constraints: Constraints, limit?: number) =>
    call<SearchResponse>("/search", { method: "POST", body: JSON.stringify({ constraints, limit }) }),

  unit: (id: string) => call<{ unit: CanonicalUnit }>(`/units/${encodeURIComponent(id)}`),

  availability: (id: string) =>
    call<{ availability: Record<string, unknown> }>(`/units/${encodeURIComponent(id)}/availability`),

  explain: (unitId: string, constraints: Constraints) =>
    call<{ match: UnitMatch }>("/explain", {
      method: "POST",
      body: JSON.stringify({ unit_id: unitId, constraints }),
    }),

  compare: (unitIds: string[], constraints: Constraints) =>
    call<{ comparison: CompareResult; units: CanonicalUnit[] }>("/compare", {
      method: "POST",
      body: JSON.stringify({ unit_ids: unitIds, constraints }),
    }),

  towFit: (vehicle: string, unitIds: string[]) =>
    call<{ resolution: TowResolution; fits: (TowFitResult & { title: string })[] }>("/tow-fit", {
      method: "POST",
      body: JSON.stringify({ vehicle, unit_ids: unitIds }),
    }),

  leadPreview: (args: {
    unit_id: string;
    name: string;
    email: string;
    phone?: string;
    message?: string;
    constraints: Constraints;
  }) =>
    call<{ preview: LeadPreviewDto; approvalToken: string }>("/leads/preview", {
      method: "POST",
      body: JSON.stringify(args),
    }),

  leadDecide: (previewId: string, decision: "approve" | "reject", approvalToken: string) =>
    call<{ preview: LeadPreviewDto }>(`/leads/${encodeURIComponent(previewId)}/${decision}`, {
      method: "POST",
      body: JSON.stringify({ approval_token: approvalToken }),
    }),

  leadSubmit: (previewId: string) =>
    call<{ receipt: LeadReceiptDto; preview: LeadPreviewDto }>("/leads/submit", {
      method: "POST",
      body: JSON.stringify({ preview_id: previewId }),
    }),

  meta: () => call<{ dataset: { units: number; dealers: number; builtAt: string; note: string } }>("/meta"),
};

export interface LeadPreviewDto {
  previewId: string;
  createdAt: string;
  status: "awaiting_human_approval" | "approved" | "rejected" | "submitted" | "expired";
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

export interface LeadReceiptDto {
  leadId: number | string;
  recordedAt: string;
  delivery: string;
  unit: string;
  dealer: string;
}
