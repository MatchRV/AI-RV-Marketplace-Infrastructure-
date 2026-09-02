/**
 * Lightweight in-process observability for the agent tool layer.
 * Counters + latency stats per operation; no user-identifying data.
 */

interface OpStats {
  calls: number;
  errors: number;
  totalMs: number;
  maxMs: number;
  zeroResults?: number;
}

const ops = new Map<string, OpStats>();
const startedAt = new Date().toISOString();

export function recordAgentOp(
  op: string,
  ms: number,
  outcome: { error?: boolean; zeroResults?: boolean } = {},
): void {
  const s = ops.get(op) ?? { calls: 0, errors: 0, totalMs: 0, maxMs: 0, zeroResults: 0 };
  s.calls += 1;
  if (outcome.error) s.errors += 1;
  if (outcome.zeroResults) s.zeroResults = (s.zeroResults ?? 0) + 1;
  s.totalMs += ms;
  s.maxMs = Math.max(s.maxMs, ms);
  ops.set(op, s);
}

export function agentMetricsSnapshot(): Record<string, unknown> {
  const out: Record<string, unknown> = { since: startedAt };
  for (const [op, s] of ops.entries()) {
    out[op] = {
      calls: s.calls,
      errors: s.errors,
      avgMs: s.calls ? Math.round((s.totalMs / s.calls) * 10) / 10 : 0,
      maxMs: Math.round(s.maxMs * 10) / 10,
      ...(s.zeroResults ? { zeroResults: s.zeroResults } : {}),
    };
  }
  return out;
}

/** Wrap a handler body with timing + error accounting. */
export async function timedAgentOp<T>(
  op: string,
  fn: () => Promise<T> | T,
  isZero?: (result: T) => boolean,
): Promise<T> {
  const t0 = performance.now();
  try {
    const result = await fn();
    recordAgentOp(op, performance.now() - t0, {
      zeroResults: isZero ? isZero(result) : false,
    });
    return result;
  } catch (err) {
    recordAgentOp(op, performance.now() - t0, { error: true });
    throw err;
  }
}
