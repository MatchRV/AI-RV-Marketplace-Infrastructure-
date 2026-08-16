import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, listingsTable, matchReportLeadsTable } from "@workspace/db";
import { and, gte, lte, inArray, isNull, or, sql, desc, asc, eq } from "drizzle-orm";
import { notifyLead } from "../lib/notify-lead";

const router: IRouter = Router();

type QuizAnswers = {
  useCase?: string;
  travelers?: string;
  hasKids?: boolean;
  hasPets?: boolean;
  driveType?: "towable" | "drivable" | "either";
  rvType?: string | null;
  towVehicle?: string;
  towCapacity?: number;
  budgetMin?: number;
  budgetMax?: number;
  lengthMin?: number;
  lengthMax?: number;
  campingStyle?: string;
  mustHaves?: string[];
  experience?: string;
  activities?: string[];
  intendedUse?: string;
};

const TOWABLE_TYPES = ["travel_trailer", "fifth_wheel", "toy_hauler", "popup_camper", "truck_camper"] as const;
const DRIVABLE_TYPES = ["class_a", "class_b", "class_c"] as const;
const ALL_TYPES = [...TOWABLE_TYPES, ...DRIVABLE_TYPES] as const;

// Map common buyer phrasings to a canonical RV type. Returns null when the
// input can't be confidently recognized (so we apply NO type filter rather than
// filtering to a non-existent type, which would return zero rows).
function normalizeRvType(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if ((ALL_TYPES as readonly string[]).includes(raw)) return raw;
  const s = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!s) return null;

  if (/\bdiesel pusher\b/.test(s) || /\bclass a\b/.test(s) || /\bgas motorhome\b/.test(s) || /\bmotorhome class a\b/.test(s)) return "class_a";
  if (/\bfifth wheel\b/.test(s) || /\b5th wheel\b/.test(s) || /\bfiver\b/.test(s)) return "fifth_wheel";
  if (/\btoy hauler\b/.test(s)) return "toy_hauler";
  if (/\bpop ?up\b/.test(s)) return "popup_camper";
  if (/\btruck camper\b/.test(s)) return "truck_camper";
  if (/\bclass b\b/.test(s) || /\bcamper ?van\b/.test(s) || /\bvan\b/.test(s)) return "class_b";
  if (/\bclass c\b/.test(s)) return "class_c";
  if (/\btravel trailer\b/.test(s) || /\btt\b/.test(s) || /\btrailer\b/.test(s)) return "travel_trailer";
  if (s === "a") return "class_a";
  if (s === "b") return "class_b";
  if (s === "c") return "class_c";

  return null;
}

// Sensible budget ceiling when the buyer never gave a dollar figure. A flat
// $100K silently filtered out entire categories (a Class A diesel pusher almost
// always costs more), so the default is RV-type-aware.
function defaultBudgetMax(rvType: string | null): number {
  switch (rvType) {
    case "class_a": return 400000;
    case "class_b":
    case "class_c": return 200000;
    case "fifth_wheel":
    case "toy_hauler": return 150000;
    default: return 120000;
  }
}

type Listing = typeof listingsTable.$inferSelect;

function safeNum(v: unknown, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

function normalize(l: Listing) {
  return {
    id: l.id,
    title: l.title,
    make: l.make,
    model: l.model,
    year: l.year,
    type: l.type,
    price: Number(l.price),
    marketValue: Number(l.marketValue),
    dealScore: l.dealScore,
    dealSavings: Number(l.dealSavings ?? 0),
    length: l.length != null ? Number(l.length) : null,
    sleeps: l.sleeps,
    slides: l.slides ?? 0,
    location: l.location,
    state: l.state,
    dealerName: l.dealerName,
    dealerId: l.dealerId,
    images: l.images ?? [],
    daysOnMarket: l.daysOnMarket ?? 0,
    condition: l.condition,
    isNew: l.isNew,
    isFeatured: l.isFeatured,
    dryWeight: l.dryWeight != null ? Number(l.dryWeight) : null,
    gvwr: l.gvwr != null ? Number(l.gvwr) : null,
    outdoorKitchen: l.outdoorKitchen ?? false,
    washerDryer: l.washerDryer ?? false,
    generator: l.generator ?? false,
    solar: l.solar ?? false,
  };
}

type NormalizedListing = ReturnType<typeof normalize>;

function dealScoreRank(s: string): number {
  return ({ great_deal: 0, good_deal: 1, fair_deal: 2, overpriced: 3 } as Record<string, number>)[s] ?? 2;
}

function scoreFit(l: NormalizedListing, q: QuizAnswers): number {
  let score = 0;
  score += (3 - dealScoreRank(l.dealScore)) * 25;
  if (l.isFeatured) score += 5;
  const desiredSleeps = q.hasKids ? 6 : (q.travelers === "family" ? 5 : q.travelers === "couple" ? 2 : q.travelers === "solo" ? 1 : 4);
  if (l.sleeps >= desiredSleeps) score += 15;
  if (l.sleeps >= desiredSleeps + 2) score += 5;
  if (q.towCapacity && l.dryWeight && l.dryWeight * 1.15 <= q.towCapacity) score += 20;
  if (q.campingStyle === "boondocking" && (l.solar || l.generator)) score += 10;
  if (q.campingStyle === "full_hookup" && l.washerDryer) score += 5;
  if (q.mustHaves?.includes("outdoor_kitchen") && l.outdoorKitchen) score += 8;
  if (q.mustHaves?.includes("washer_dryer") && l.washerDryer) score += 8;
  if (q.mustHaves?.includes("generator") && l.generator) score += 6;
  if (q.mustHaves?.includes("solar") && l.solar) score += 6;
  if (q.lengthMin != null && q.lengthMax != null && l.length != null &&
      l.length >= q.lengthMin && l.length <= q.lengthMax) {
    score += 15;
  }
  const ageBonus = Math.max(0, 10 - (new Date().getFullYear() - l.year));
  score += ageBonus;
  return score;
}

function resolveAllowedTypes(q: QuizAnswers): readonly string[] {
  if (q.rvType && (ALL_TYPES as readonly string[]).includes(q.rvType)) return [q.rvType];
  if (q.driveType === "towable") return TOWABLE_TYPES;
  if (q.driveType === "drivable") return DRIVABLE_TYPES;
  return ALL_TYPES;
}

async function fetchCandidates(q: QuizAnswers, priceMin: number, priceMax: number): Promise<NormalizedListing[]> {
  const allowed = resolveAllowedTypes(q);
  const conds = [
    gte(listingsTable.price, priceMin),
    lte(listingsTable.price, priceMax),
    inArray(listingsTable.type, allowed as string[]),
  ];

  const onlyTowable = allowed.every((t) => (TOWABLE_TYPES as readonly string[]).includes(t));
  if (q.towCapacity && onlyTowable) {
    const cap = q.towCapacity;
    conds.push(
      or(
        isNull(listingsTable.dryWeight),
        lte(listingsTable.dryWeight, cap / 1.15),
      )!,
    );
  }

  // Length is a near-hard requirement when the buyer specified it. Keep units
  // with no recorded length (don't silently drop them) but exclude real
  // out-of-range lengths so a 40ft request never surfaces a 24ft unit.
  if (q.lengthMin != null && q.lengthMax != null) {
    conds.push(
      or(
        isNull(listingsTable.length),
        and(
          gte(listingsTable.length, q.lengthMin),
          lte(listingsTable.length, q.lengthMax),
        ),
      )!,
    );
  }

  // Never surface a no-photo unit in match results.
  conds.push(
    sql`${listingsTable.images} IS NOT NULL AND jsonb_array_length(${listingsTable.images}) > 0`,
  );

  const rows = await db
    .select()
    .from(listingsTable)
    .where(and(...conds))
    .orderBy(desc(listingsTable.isFeatured), asc(listingsTable.dealScore), asc(listingsTable.price))
    .limit(80);

  return rows.map(normalize);
}

async function generateCopy(
  q: QuizAnswers,
  picks: { tier: string; listing: NormalizedListing }[],
) {
  const profileSummary = JSON.stringify({
    use: q.useCase, travelers: q.travelers, kids: q.hasKids, pets: q.hasPets,
    drive: q.driveType, tow: q.towVehicle, towCapacity: q.towCapacity,
    budget: [q.budgetMin, q.budgetMax], style: q.campingStyle,
    mustHaves: q.mustHaves, experience: q.experience,
    activities: q.activities, intendedUse: q.intendedUse,
  });

  const picksSummary = picks.map((p) => {
    const l = p.listing;
    return `[${p.tier.toUpperCase()}] ${l.year} ${l.make} ${l.model} — ${l.type} | $${l.price.toLocaleString()} | sleeps ${l.sleeps} | ${l.length ? `${l.length}ft | ` : ""}${l.dryWeight ? `${l.dryWeight}lb dry | ` : ""}deal: ${l.dealScore}${l.dealSavings > 0 ? ` ($${l.dealSavings.toLocaleString()} below market)` : ""} | ${l.location}`;
  }).join("\n");

  const prompt = `You are a professional RV outfitter writing a personalized RV Match Report for someone who just told you about their camping lifestyle. You are NOT a salesperson — you're a trusted guide helping them understand which RVs fit their life.

Think like a professional outfitter: you understand HOW they'll use the RV and you're explaining why each pick supports THEIR specific lifestyle. Be warm, honest, and specific.

BUYER'S CAMPING PROFILE:
${profileSummary}

THE 3 RVs YOU SELECTED FOR THEM:
${picksSummary}

Tier definitions:
- BEST_OVERALL: The RV that best fits how they described their camping life
- BEST_VALUE: Smart money pick — great fit at a great price
- UPGRADE: Worth considering if they can stretch — here's what extra money buys them

For EACH pick, write:
1. "whyItFits" — 2-3 sentences explaining how THIS specific RV supports THEIR camping lifestyle. Reference their actual answers (their use case, who's coming, where they're going, their tow vehicle, etc.). Don't list features — explain how the RV enables the life they described. Sound like a knowledgeable friend, not a brochure.

2. "tradeoffs" — array of 2-3 honest things to consider. Be genuinely candid — this builds trust. Examples: "The shorter length means less storage for extended trips", "No generator means you'll need hookups or aftermarket solar", "At this price point, expect some cosmetic wear". Never say "it's perfect" — nothing is.

3. "priceContext" — 1 sentence about the deal quality. Be specific: mention savings, days on market, or how it compares to similar units.

Also write an "expertSummary" — 2-3 sentences of warm, opinionated advice that ties the whole report together. Address them directly. Sound like a friend who knows RVs inside and out giving them honest guidance. Example tone: "Based on how you described your camping trips, you don't need the biggest rig on the lot — you need something that's easy to set up Friday night and comfortable enough to enjoy all weekend."

Output ONLY valid JSON in this exact shape:
{
  "expertSummary": "...",
  "picks": [
    { "tier": "best_overall", "whyItFits": "...", "tradeoffs": ["...", "..."], "priceContext": "..." },
    { "tier": "best_value", "whyItFits": "...", "tradeoffs": ["...", "..."], "priceContext": "..." },
    { "tier": "upgrade", "whyItFits": "...", "tradeoffs": ["...", "..."], "priceContext": "..." }
  ]
}`;

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("generateCopy timeout")), 12_000)
    );
    const aiCall = anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });
    const response = await Promise.race([aiCall, timeout]);
    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("Match report copy generation failed:", err);
    return {
      expertSummary: "Based on what you told me about your camping plans, here are three RVs worth your attention. Each one fits your life a little differently — read the honest tradeoffs before reaching out to a dealer.",
      picks: picks.map((p) => ({
        tier: p.tier,
        whyItFits: `The ${p.listing.year} ${p.listing.make} ${p.listing.model} fits the way you described your camping life — it's sized right for your group and priced within your range.`,
        tradeoffs: ["Confirm tow weight compatibility with the dealer.", "Inspect the unit in person — photos don't show everything."],
        priceContext: p.listing.dealSavings > 0
          ? `Priced about $${p.listing.dealSavings.toLocaleString()} below market — that's a solid deal.`
          : `Priced near market value for this year and condition.`,
      })),
    };
  }
}

router.post("/match-report/lead", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "A valid email is required." });
    }
    const reportId = typeof req.body?.reportId === "string" ? req.body.reportId : null;
    const quiz = req.body?.quiz && typeof req.body.quiz === "object" ? (req.body.quiz as Record<string, unknown>) : {};
    const source = typeof req.body?.source === "string" ? req.body.source : "match_report";

    // Insert + duplicate check are done atomically: an advisory transaction lock
    // keyed on the (lowercased) email serializes concurrent requests so exactly
    // one submission per email per 24h wins the notification.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const { lead, hadRecentLead } = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${email}))`);
      const [prior] = await tx
        .select({ id: matchReportLeadsTable.id })
        .from(matchReportLeadsTable)
        .where(and(
          eq(matchReportLeadsTable.email, email),
          gte(matchReportLeadsTable.createdAt, dayAgo),
        ))
        .limit(1);
      const [inserted] = await tx
        .insert(matchReportLeadsTable)
        .values({ email, reportId, quiz, source })
        .returning({ id: matchReportLeadsTable.id });
      return { lead: inserted, hadRecentLead: !!prior };
    });

    // Notify sales (email/SMS/CRM) — fire-and-forget so the response stays fast.
    void (async () => {
      try {
        if (hadRecentLead) {
          console.log(`[match-report/lead] Skipping notification — recent lead already exists for this email`);
          return;
        }

        const q = quiz as Record<string, unknown>;
        const fmt = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v != null && v !== "" ? String(v) : null);
        const money = (v: unknown) => {
          const n = Number(v);
          return v != null && Number.isFinite(n) ? `$${n.toLocaleString()}` : null;
        };
        const budgetMax = money(q.budgetMax);
        const budgetMin = money(q.budgetMin);
        const budget = budgetMax ? `${budgetMin ? `${budgetMin} – ` : "up to "}${budgetMax}` : null;
        const summaryParts = [
          fmt(q.useCase) && `Use: ${fmt(q.useCase)}`,
          fmt(q.travelers) && `Travelers: ${fmt(q.travelers)}`,
          fmt(q.rvType) && `RV type: ${fmt(q.rvType)}`,
          fmt(q.towVehicle) && `Tow vehicle: ${fmt(q.towVehicle)}`,
          fmt(q.campingStyle) && `Camping style: ${fmt(q.campingStyle)}`,
          fmt(q.mustHaves) && `Must-haves: ${fmt(q.mustHaves)}`,
          reportId && `Report ID: ${reportId}`,
        ].filter(Boolean).join(" | ");

        await notifyLead({
          leadSource: source,
          contactEmail: email,
          message: `Match Report email captured (${source}).${summaryParts ? ` ${summaryParts}` : ""}`,
          buyerProfile: {
            ...(budget ? { budget } : {}),
            ...(fmt(q.experience) ? { experience: fmt(q.experience) } : {}),
            ...(fmt(q.campingStyle) ? { campingStyle: fmt(q.campingStyle) } : {}),
            summary: summaryParts || "Quiz answers unavailable",
          },
        });
      } catch (err) {
        console.error("[match-report/lead] notification failed:", err);
      }
    })();

    return res.json({ ok: true, id: lead?.id ?? null });
  } catch (err) {
    console.error("[match-report/lead] failed", err);
    return res.status(500).json({ error: "Could not save your email. Please try again." });
  }
});

router.post("/match-report/generate", async (req, res) => {
  try {
    const raw = (req.body?.quiz ?? {}) as Record<string, unknown>;

    // Validate & sanitize inputs
    const driveType = raw.driveType === "towable" || raw.driveType === "drivable" || raw.driveType === "either"
      ? raw.driveType
      : "either";
    const rvType = normalizeRvType(raw.rvType);
    const budgetMax = safeNum(raw.budgetMax, 5000, 2_000_000) ?? defaultBudgetMax(rvType);
    const budgetMin = safeNum(raw.budgetMin, 1000, budgetMax) ?? Math.max(10000, Math.floor(budgetMax * 0.3));
    const towCapacity = safeNum(raw.towCapacity, 1000, 50000) ?? undefined;

    // Length band (feet). Filter only kicks in when both bounds exist, so fill a
    // missing side with the sane outer bound (e.g. "under 25ft" → 8–25).
    let lengthMin = safeNum(raw.lengthMin, 8, 60) ?? undefined;
    let lengthMax = safeNum(raw.lengthMax, 8, 60) ?? undefined;
    if (lengthMin != null && lengthMax != null && lengthMin > lengthMax) {
      [lengthMin, lengthMax] = [lengthMax, lengthMin];
    }
    if (lengthMin != null && lengthMax == null) lengthMax = 60;
    if (lengthMax != null && lengthMin == null) lengthMin = 8;
    const mustHaves = Array.isArray(raw.mustHaves)
      ? raw.mustHaves.filter((x): x is string => typeof x === "string").slice(0, 12)
      : [];

    const quiz: QuizAnswers = {
      useCase: typeof raw.useCase === "string" ? raw.useCase : undefined,
      travelers: typeof raw.travelers === "string" ? raw.travelers : undefined,
      hasKids: typeof raw.hasKids === "boolean" ? raw.hasKids : undefined,
      hasPets: typeof raw.hasPets === "boolean" ? raw.hasPets : undefined,
      driveType,
      rvType,
      towVehicle: typeof raw.towVehicle === "string" ? raw.towVehicle.slice(0, 200) : undefined,
      towCapacity,
      budgetMin,
      budgetMax,
      lengthMin,
      lengthMax,
      campingStyle: typeof raw.campingStyle === "string" ? raw.campingStyle : undefined,
      mustHaves,
      experience: typeof raw.experience === "string" ? raw.experience : undefined,
      activities: Array.isArray(raw.activities) ? raw.activities.filter((x): x is string => typeof x === "string") : undefined,
      intendedUse: typeof raw.intendedUse === "string" ? raw.intendedUse : undefined,
    };

    let inBudget = await fetchCandidates(quiz, budgetMin, budgetMax);
    let relaxedNote: string | null = null;
    let effectiveBudgetMax = budgetMax;

    // ── Graceful soft fallback ──
    // Rather than dead-ending on "no matches", progressively relax the filters
    // and tell the buyer what we loosened. Only give up once even the relaxed
    // passes come back empty.
    if (inBudget.length === 0 && quiz.lengthMin != null && quiz.lengthMax != null) {
      // 1) Widen the length band (≈±6 instead of ±3); keep type + budget.
      const widened: QuizAnswers = {
        ...quiz,
        lengthMin: Math.max(8, quiz.lengthMin - 3),
        lengthMax: Math.min(60, quiz.lengthMax + 3),
      };
      inBudget = await fetchCandidates(widened, budgetMin, budgetMax);
      if (inBudget.length > 0) {
        relaxedNote = "We widened your length range a little to show strong nearby options.";
      }
    }

    if (inBudget.length === 0 && (quiz.lengthMin != null || quiz.lengthMax != null)) {
      // 2) Drop the length filter entirely; keep type + budget.
      const noLength: QuizAnswers = { ...quiz, lengthMin: undefined, lengthMax: undefined };
      inBudget = await fetchCandidates(noLength, budgetMin, budgetMax);
      if (inBudget.length > 0) {
        relaxedNote = "We looked beyond your exact length range to find strong matches in your budget and RV type.";
      }
    }

    if (inBudget.length === 0) {
      // 3) Stretch the budget ceiling by 25%; keep type (length already relaxed).
      effectiveBudgetMax = Math.floor(Math.min(budgetMax * 1.25, 2_000_000));
      const relaxedBudget: QuizAnswers = { ...quiz, lengthMin: undefined, lengthMax: undefined };
      inBudget = await fetchCandidates(relaxedBudget, budgetMin, effectiveBudgetMax);
      if (inBudget.length > 0) {
        relaxedNote = "We stretched your budget slightly to surface the closest available matches.";
      }
    }

    if (inBudget.length === 0) {
      res.status(404).json({
        error: "no_matches",
        message: "We couldn't find RVs matching your criteria right now. Try widening your budget or being more flexible on RV type — our inventory changes daily.",
      });
      return;
    }

    // Build pool of upgrade candidates (above budget)
    const upMin = Math.floor(effectiveBudgetMax * 1.15);
    const upMax = Math.floor(Math.min(effectiveBudgetMax * 1.5, 2_000_000));
    const upgradeCands = upMin < upMax ? await fetchCandidates(quiz, upMin, upMax) : [];

    // Pick distinct listings across tiers
    const usedIds = new Set<number>();

    // 1) Best overall — highest fit
    const scored = [...inBudget]
      .map((l) => ({ listing: l, score: scoreFit(l, quiz) }))
      .sort((a, b) => b.score - a.score);
    const bestOverall = scored[0]?.listing;
    if (bestOverall) usedIds.add(bestOverall.id);

    // 2) Best value — best deal score / highest savings, distinct from best overall
    const valueRanked = inBudget
      .filter((l) => !usedIds.has(l.id))
      .filter((l) => ["great_deal", "good_deal"].includes(l.dealScore) || l.dealSavings > 1000)
      .sort((a, b) => {
        const r = dealScoreRank(a.dealScore) - dealScoreRank(b.dealScore);
        if (r !== 0) return r;
        return b.dealSavings - a.dealSavings;
      });
    const bestValue = valueRanked[0]
      ?? scored.find((s) => !usedIds.has(s.listing.id))?.listing;
    if (bestValue) usedIds.add(bestValue.id);

    // 3) Upgrade — prefer above-budget pool, fallback to next-best in-budget, distinct
    const upgradeRanked = upgradeCands
      .filter((l) => !usedIds.has(l.id))
      .map((l) => ({ listing: l, score: scoreFit(l, { ...quiz, budgetMax: upMax }) }))
      .sort((a, b) => b.score - a.score);
    const upgrade = upgradeRanked[0]?.listing
      ?? scored.find((s) => !usedIds.has(s.listing.id))?.listing;
    if (upgrade) usedIds.add(upgrade.id);

    // Build picks list, only including tiers we actually have a distinct listing for
    const picks: { tier: string; listing: NormalizedListing }[] = [];
    if (bestOverall) picks.push({ tier: "best_overall", listing: bestOverall });
    if (bestValue && bestValue.id !== bestOverall?.id) picks.push({ tier: "best_value", listing: bestValue });
    if (upgrade && upgrade.id !== bestOverall?.id && upgrade.id !== bestValue?.id) {
      picks.push({ tier: "upgrade", listing: upgrade });
    }

    if (picks.length === 0) {
      res.status(404).json({
        error: "no_matches",
        message: "We couldn't find RVs matching your criteria right now. Try widening your budget or being more flexible on RV type.",
      });
      return;
    }

    const copy = await generateCopy(quiz, picks);

    const matchScoreFor = (tier: string, l: NormalizedListing): number => {
      const raw = tier === "upgrade"
        ? scoreFit(l, { ...quiz, budgetMax: upMax })
        : scoreFit(l, quiz);
      return Math.max(72, Math.min(99, Math.round(60 + raw * 0.3)));
    };

    const enrichedPicks = picks.map((p) => {
      const c = (copy.picks ?? []).find((x: { tier: string }) => x.tier === p.tier) ?? {};
      return {
        tier: p.tier,
        listing: p.listing,
        matchScore: matchScoreFor(p.tier, p.listing),
        whyItFits: c.whyItFits ?? "",
        tradeoffs: c.tradeoffs ?? [],
        priceContext: c.priceContext ?? "",
      };
    });

    res.json({
      reportId: `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      generatedAt: new Date().toISOString(),
      quiz,
      expertSummary: copy.expertSummary ?? "",
      picks: enrichedPicks,
      totalConsidered: inBudget.length,
      relaxedNote,
    });
  } catch (err) {
    console.error("Match report error:", err);
    res.status(500).json({ message: "Could not generate match report. Please try again." });
  }
});

export default router;
