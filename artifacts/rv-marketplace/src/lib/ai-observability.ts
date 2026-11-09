import { posthog } from "@/lib/posthog";

type AiGeneration = {
  traceId: string;
  sessionId: string | null;
  spanName: string;
  latencySeconds: number;
  model?: string | null;
  provider?: string;
};

export function createAiTraceId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export function captureAiGeneration({
  traceId,
  sessionId,
  spanName,
  latencySeconds,
  model,
  provider,
}: AiGeneration): void {
  try {
    posthog.capture("$ai_generation", {
      $ai_trace_id: traceId,
      $ai_session_id: sessionId,
      $ai_span_name: spanName,
      $ai_latency: latencySeconds,
      ...(model ? { $ai_model: model } : {}),
      ...(provider ? { $ai_provider: provider } : {}),
    });
  } catch {}
}
