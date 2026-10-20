/**
 * Outfitter learning — the sherpa's long-term memory.
 *
 * Hermes-style: every conversation can teach the system something durable,
 * and everything learned is consulted before answering again. Three kinds
 * of memory, all source-tagged and confidence-weighted:
 *
 *  1. Vehicle facts — an exact tow rating / door-sticker payload a shopper
 *     confirmed for their vehicle descriptor. Learned once, recalled
 *     forever (subject to persistence), and always labelled as learned —
 *     never silently promoted to a manufacturer rating.
 *  2. Unit facts — a shopper/dealer-confirmed spec for a specific unit
 *     (sleeps, GVWR, bunkhouse…) that overlays the dealer's published
 *     record with `learned` provenance. Conflicting confirmations lower
 *     confidence instead of overwriting history.
 *  3. Aggregate counters — anonymous discovery patterns (party sizes,
 *     floorplan intents) that show what buyers actually ask for.
 *
 * Pure and serialisable; the host owns persistence (file/DB) via
 * serialize()/restore().
 */

import type { CanonicalUnit, Fact } from "./types.js";

export function vehicleKey(vehicle: string): string {
  return vehicle.toLowerCase().replace(/rated\s*[\d,]+\s*(lbs?|pounds?)/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export interface LearnedVehicle {
  key: string;
  vehicle: string;
  towRatingLbs: number | null;
  payloadLbs: number | null;
  confirmations: number;
  conflicts: number;
  source: string;
  learnedAt: string;
  lastConfirmedAt: string;
}

export type LearnableUnitField = "sleeps" | "gvwrLbs" | "dryWeightLbs" | "hitchWeightLbs" | "freshWaterGal" | "bunkhouse";

export interface LearnedUnitFact {
  unitId: string;
  field: LearnableUnitField;
  value: number | boolean;
  confirmations: number;
  conflicts: number;
  source: string;
  learnedAt: string;
  lastConfirmedAt: string;
}

interface StoreShape {
  vehicles: LearnedVehicle[];
  unitFacts: LearnedUnitFact[];
  counters: Record<string, number>;
}

const now = () => new Date().toISOString();

export class LearnedStore {
  private vehicles = new Map<string, LearnedVehicle>();
  private unitFacts = new Map<string, LearnedUnitFact>();
  private counters = new Map<string, number>();

  learnVehicle(vehicle: string, facts: { towRatingLbs?: number | null; payloadLbs?: number | null }, source = "customer-stated"): LearnedVehicle | null {
    const key = vehicleKey(vehicle);
    if (!key || (facts.towRatingLbs == null && facts.payloadLbs == null)) return null;
    const existing = this.vehicles.get(key);
    if (!existing) {
      const rec: LearnedVehicle = { key, vehicle, towRatingLbs: facts.towRatingLbs ?? null, payloadLbs: facts.payloadLbs ?? null, confirmations: 1, conflicts: 0, source, learnedAt: now(), lastConfirmedAt: now() };
      this.vehicles.set(key, rec);
      return rec;
    }
    let conflict = false;
    if (facts.towRatingLbs != null) {
      if (existing.towRatingLbs != null && Math.abs(existing.towRatingLbs - facts.towRatingLbs) > 100) conflict = true;
      existing.towRatingLbs = facts.towRatingLbs;
    }
    if (facts.payloadLbs != null) {
      if (existing.payloadLbs != null && Math.abs(existing.payloadLbs - facts.payloadLbs) > 50) conflict = true;
      existing.payloadLbs = facts.payloadLbs;
    }
    existing.confirmations += 1;
    if (conflict) existing.conflicts += 1;
    existing.lastConfirmedAt = now();
    return existing;
  }

  recallVehicle(vehicle: string): LearnedVehicle | null {
    return this.vehicles.get(vehicleKey(vehicle)) ?? null;
  }

  learnUnitFact(unitId: string, field: LearnableUnitField, value: number | boolean, source = "customer-confirmed"): LearnedUnitFact {
    const id = `${unitId}|${field}`;
    const existing = this.unitFacts.get(id);
    if (!existing) {
      const rec: LearnedUnitFact = { unitId, field, value, confirmations: 1, conflicts: 0, source, learnedAt: now(), lastConfirmedAt: now() };
      this.unitFacts.set(id, rec);
      return rec;
    }
    if (existing.value !== value) { existing.value = value; existing.conflicts += 1; }
    existing.confirmations += 1;
    existing.lastConfirmedAt = now();
    return existing;
  }

  recallUnitFacts(unitId: string): LearnedUnitFact[] {
    return [...this.unitFacts.values()].filter((f) => f.unitId === unitId);
  }

  /** Overlay learned facts onto a unit. Learned never erases provenance silently — it becomes the fact, tagged `learned`. */
  applyToUnit(unit: CanonicalUnit): CanonicalUnit {
    const facts = this.recallUnitFacts(unit.id);
    if (!facts.length) return unit;
    const out: CanonicalUnit = { ...unit };
    for (const f of facts) {
      const confidence = f.conflicts > 0 ? "low" : f.confirmations >= 2 ? "high" : "medium";
      const fact = { value: f.value as never, source: "learned" as const, confidence, note: `Confirmed ${f.confirmations}× (${f.source}); last ${f.lastConfirmedAt.slice(0, 10)}.` };
      if (f.field === "sleeps") out.sleeps = fact as Fact<number>;
      else if (f.field === "gvwrLbs") out.gvwrLbs = fact as Fact<number>;
      else if (f.field === "dryWeightLbs") out.dryWeightLbs = fact as Fact<number>;
      else if (f.field === "hitchWeightLbs") out.hitchWeightLbs = fact as Fact<number>;
      else if (f.field === "freshWaterGal") out.freshWaterGal = fact as Fact<number>;
      else if (f.field === "bunkhouse") out.bunkhouse = fact as Fact<boolean>;
    }
    return out;
  }

  applyToCorpus(units: CanonicalUnit[]): CanonicalUnit[] {
    if (!this.unitFacts.size) return units;
    const touched = new Set([...this.unitFacts.values()].map((f) => f.unitId));
    return units.map((u) => (touched.has(u.id) ? this.applyToUnit(u) : u));
  }

  count(kind: string, key: string): void {
    const id = `${kind}:${key}`;
    this.counters.set(id, (this.counters.get(id) ?? 0) + 1);
  }

  stats(): { vehicles: number; unitFacts: number; counters: Record<string, number>; recentVehicles: LearnedVehicle[]; recentUnitFacts: LearnedUnitFact[] } {
    return {
      vehicles: this.vehicles.size,
      unitFacts: this.unitFacts.size,
      counters: Object.fromEntries(this.counters),
      recentVehicles: [...this.vehicles.values()].sort((a, b) => b.lastConfirmedAt.localeCompare(a.lastConfirmedAt)).slice(0, 10),
      recentUnitFacts: [...this.unitFacts.values()].sort((a, b) => b.lastConfirmedAt.localeCompare(a.lastConfirmedAt)).slice(0, 10),
    };
  }

  serialize(): StoreShape {
    return { vehicles: [...this.vehicles.values()], unitFacts: [...this.unitFacts.values()], counters: Object.fromEntries(this.counters) };
  }

  restore(shape: StoreShape): void {
    this.vehicles = new Map((shape.vehicles ?? []).map((v) => [v.key, v]));
    this.unitFacts = new Map((shape.unitFacts ?? []).map((f) => [`${f.unitId}|${f.field}`, f]));
    this.counters = new Map(Object.entries(shape.counters ?? {}));
  }
}
