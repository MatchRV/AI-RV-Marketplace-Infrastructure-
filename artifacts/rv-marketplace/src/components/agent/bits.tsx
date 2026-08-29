/** Small shared pieces for the agent shopping experience. */

import type { Fact, FactSource } from "@workspace/agent-core";
import type { LedgerActor } from "@/agent/session";

export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const filled = (score / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`${score}% match`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E2E8F0" strokeWidth={4} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#00CED1"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-[#161d1d]">
        {score}
      </span>
    </div>
  );
}

export const SOURCE_LABEL: Record<FactSource, string> = {
  dealer_listing: "dealer listing",
  derived_text: "parsed from dealer text",
  derived_model_code: "decoded from floorplan code",
  reference_table: "MatchRV reference data",
  computed: "computed",
};

export function SourceTag({ source, confidence }: { source: FactSource | null; confidence?: string | null }) {
  if (!source) {
    return <span className="text-[10px] uppercase tracking-wide text-[#b45309] bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">unknown — dealer doesn't publish</span>;
  }
  const strong = source === "dealer_listing";
  return (
    <span
      className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 border ${
        strong ? "text-[#0e7490] bg-cyan-50 border-cyan-200" : "text-[#6b7a7a] bg-[#f4fbfa] border-[#E2E8F0]"
      }`}
      title={confidence ? `confidence: ${confidence}` : undefined}
    >
      {SOURCE_LABEL[source]}
    </span>
  );
}

export function FactRow({
  label,
  fact,
  format,
}: {
  label: string;
  fact: Fact<unknown>;
  format?: (v: unknown) => string;
}) {
  const display =
    fact.value === null
      ? "Unknown"
      : format
        ? format(fact.value)
        : typeof fact.value === "boolean"
          ? fact.value
            ? "Yes"
            : "No"
          : String(fact.value);
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[#eef2f2] last:border-0">
      <span className="text-sm text-[#5c6b6b]">{label}</span>
      <span className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${fact.value === null ? "text-[#b45309]" : "text-[#161d1d]"}`}>{display}</span>
        <SourceTag source={fact.source} confidence={fact.confidence} />
      </span>
    </div>
  );
}

export function ActorBadge({ actor }: { actor: LedgerActor }) {
  const styles: Record<LedgerActor, string> = {
    agent: "bg-[#00CED1]/15 text-[#0e7490] border-[#00CED1]/40",
    human: "bg-emerald-50 text-emerald-700 border-emerald-200",
    system: "bg-slate-100 text-slate-500 border-slate-200",
  };
  const label: Record<LedgerActor, string> = { agent: "Agent", human: "You", system: "MatchRV" };
  return (
    <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wider rounded px-1.5 py-0.5 border ${styles[actor]}`}>
      {label[actor]}
    </span>
  );
}

export function VerifiedPill({ status }: { status: "pass" | "unverified" | "fail" }) {
  if (status === "pass") {
    return <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">Verified match</span>;
  }
  if (status === "unverified") {
    return <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-amber-50 text-[#b45309] border border-amber-200">Unverified — data gaps</span>;
  }
  return <span className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-red-50 text-red-700 border border-red-200">Doesn't fit</span>;
}
