/**
 * The shared-session rail: live constraints (human-editable), the search
 * funnel, and the activity ledger. Dark "control room" styling makes the
 * agent layer visually distinct from the listings themselves.
 */

import { useState } from "react";
import { X, Radar, ListChecks, CircleDot } from "lucide-react";
import type { Constraints, FeatureKey } from "@workspace/agent-core";
import { useAgentSession, describeConstraints } from "@/agent/session";
import { humanSearch } from "@/agent/human-actions";
import { ActorBadge } from "./bits";

const FEATURE_SHORT: Record<FeatureKey, string> = {
  bunkhouse: "Bunkhouse",
  solar: "Solar",
  solar_prep: "Solar-ready",
  lithium: "Lithium",
  generator: "Generator",
  four_season: "Four-season",
  outdoor_kitchen: "Outdoor kitchen",
  two_entry_doors: "2 entry doors",
};

function Chip({ text, onRemove, tone }: { text: string; onRemove?: () => void; tone: "hard" | "soft" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border ${
        tone === "hard"
          ? "bg-[#00CED1]/10 border-[#00CED1]/40 text-[#7ee8ea]"
          : "bg-white/5 border-white/15 text-white/70"
      }`}
    >
      {text}
      {onRemove && (
        <button onClick={onRemove} aria-label={`Remove ${text}`} className="hover:text-white transition-colors">
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}

export function SessionRail() {
  const s = useAgentSession();
  const c = s.constraints;
  const [budgetDraft, setBudgetDraft] = useState<string>("");

  const update = (next: Constraints, text: string) => void humanSearch(next, text);
  const drop = (key: keyof Constraints, label: string) => {
    const next = { ...c };
    delete next[key];
    update(next, `removed ${label}`);
  };

  const chips: { text: string; tone: "hard" | "soft"; onRemove: () => void }[] = [];
  if (c.rvTypes?.length) chips.push({ text: c.rvTypes.map((t) => t.replace(/_/g, " ")).join(" / "), tone: "hard", onRemove: () => drop("rvTypes", "RV type") });
  if (c.priceMaxUsd != null) chips.push({ text: `≤ $${c.priceMaxUsd.toLocaleString()}`, tone: "hard", onRemove: () => drop("priceMaxUsd", "budget cap") });
  if (c.lengthMaxFt != null) chips.push({ text: `≤ ${c.lengthMaxFt} ft`, tone: "hard", onRemove: () => drop("lengthMaxFt", "length cap") });
  if (c.sleepsMin != null) chips.push({ text: `sleeps ${c.sleepsMin}+`, tone: "hard", onRemove: () => drop("sleepsMin", "sleeping capacity") });
  if (c.towVehicle) chips.push({ text: `tow: ${c.towVehicle}`, tone: "hard", onRemove: () => drop("towVehicle", "tow vehicle") });
  if (c.maxWeightLbs != null) chips.push({ text: `≤ ${c.maxWeightLbs.toLocaleString()} lbs`, tone: "hard", onRemove: () => drop("maxWeightLbs", "weight cap") });
  if (c.location) chips.push({ text: `${c.location.radiusMiles} mi of ${c.location.place}`, tone: "hard", onRemove: () => drop("location", "location") });
  if (c.freshWaterMinGal != null) chips.push({ text: `fresh ≥ ${c.freshWaterMinGal} gal`, tone: "hard", onRemove: () => drop("freshWaterMinGal", "fresh water minimum") });
  for (const f of c.mustHave ?? []) {
    chips.push({
      text: `must: ${FEATURE_SHORT[f]}`,
      tone: "hard",
      onRemove: () => update({ ...c, mustHave: (c.mustHave ?? []).filter((x) => x !== f) }, `dropped must-have ${FEATURE_SHORT[f]}`),
    });
  }
  for (const f of c.prefer ?? []) {
    chips.push({
      text: `prefer: ${FEATURE_SHORT[f]}`,
      tone: "soft",
      onRemove: () => update({ ...c, prefer: (c.prefer ?? []).filter((x) => x !== f) }, `dropped preference ${FEATURE_SHORT[f]}`),
    });
  }
  if (c.boondocking) chips.push({ text: "boondocking priority", tone: "soft", onRemove: () => drop("boondocking", "boondocking priority") });

  const togglePrefer = (f: FeatureKey) => {
    const has = (c.prefer ?? []).includes(f);
    const prefer = has ? (c.prefer ?? []).filter((x) => x !== f) : [...(c.prefer ?? []), f];
    update({ ...c, prefer }, `${has ? "dropped" : "added"} preference: ${FEATURE_SHORT[f]}`);
  };

  const commitBudget = () => {
    const n = parseInt(budgetDraft.replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(n) && n >= 1000) {
      update({ ...c, priceMaxUsd: n }, `set budget cap to $${n.toLocaleString()}`);
      setBudgetDraft("");
    }
  };

  return (
    <aside className="bg-[#0B1117] text-white rounded-[1.25rem] border border-white/10 overflow-hidden flex flex-col max-h-[calc(100vh-7rem)] lg:sticky lg:top-24">
      {/* Shared session header */}
      <div className="px-5 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Radar className="w-4 h-4 text-[#00CED1]" />
          <h2 className="font-display font-semibold tracking-tight text-white">Shared session</h2>
        </div>
        <p className="text-xs text-white/50 mt-1">
          You and your agent are editing the same search. Every action lands here.
        </p>
      </div>

      {/* Constraints */}
      <div className="px-5 py-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">Constraints</h3>
          {s.intentSummary && (
            <span className="text-[10px] text-[#7ee8ea] max-w-[60%] truncate" title={s.intentSummary}>
              “{s.intentSummary}”
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2 min-h-[1.75rem]">
          {chips.length === 0 ? (
            <span className="text-xs text-white/40">None yet — ask your agent, or use the controls below.</span>
          ) : (
            chips.map((chip, i) => <Chip key={`${chip.text}-${i}`} {...chip} />)
          )}
        </div>

        {/* Human quick controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg bg-white/5 border border-white/15 overflow-hidden">
            <span className="pl-2 text-xs text-white/40">$</span>
            <input
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitBudget()}
              onBlur={() => budgetDraft && commitBudget()}
              placeholder={c.priceMaxUsd ? c.priceMaxUsd.toLocaleString() : "max budget"}
              aria-label="Set maximum budget"
              className="w-24 bg-transparent px-1.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none"
              inputMode="numeric"
            />
          </div>
          {(["solar", "lithium", "outdoor_kitchen", "two_entry_doors"] as FeatureKey[]).map((f) => {
            const active = (c.prefer ?? []).includes(f);
            return (
              <button
                key={f}
                onClick={() => togglePrefer(f)}
                aria-pressed={active}
                className={`text-[11px] rounded-full px-2.5 py-1.5 border transition-colors ${
                  active
                    ? "bg-[#00CED1] text-[#0B1117] border-[#00CED1] font-semibold"
                    : "bg-transparent text-white/60 border-white/15 hover:border-white/40"
                }`}
              >
                {FEATURE_SHORT[f]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Funnel */}
      {s.funnel && (
        <div className="px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-[#00CED1]" />
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">Match funnel</h3>
          </div>
          <p className="mt-2 text-sm text-white">
            <span className="font-bold">{s.funnel.totalUnits.toLocaleString()}</span>
            <span className="text-white/50"> units searched → </span>
            <span className="font-bold text-[#7ee8ea]">{s.funnel.passedHard}</span>
            <span className="text-white/50"> verified · </span>
            <span className="font-bold text-amber-300">{s.funnel.unverified}</span>
            <span className="text-white/50"> unverified</span>
          </p>
          <ul className="mt-2 space-y-1">
            {s.funnel.excluded.slice(0, 4).map((e) => (
              <li key={e.reason} className="text-[11px] text-white/45 flex justify-between gap-2">
                <span className="truncate">✗ {e.reason}</span>
                <span className="shrink-0">{e.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Activity ledger */}
      <div className="px-5 py-4 flex-1 min-h-[8rem] overflow-y-auto">
        <div className="flex items-center gap-2">
          <CircleDot className="w-4 h-4 text-[#00CED1]" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-white/40">Activity</h3>
        </div>
        <ol className="mt-2 space-y-2.5" aria-live="polite">
          {s.ledger.length === 0 && <li className="text-xs text-white/40">Waiting for the first move…</li>}
          {[...s.ledger].reverse().map((entry) => (
            <li key={entry.id} className="flex gap-2 items-start">
              <ActorBadge actor={entry.actor} />
              <div className="min-w-0">
                <p className="text-xs text-white/85 leading-snug">{entry.text}</p>
                {entry.detail && <p className="text-[10px] text-white/40 leading-snug mt-0.5">{entry.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
