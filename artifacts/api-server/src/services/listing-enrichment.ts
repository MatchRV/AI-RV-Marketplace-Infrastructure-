import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const ENRICHMENT_VERSION = 1;

const ENRICHMENT_SYSTEM_PROMPT = `You are an RV feature extraction assistant. Given an RV listing's details, extract structured boolean and enum fields from the title, description, features list, and specs.

Return ONLY valid JSON in this exact format — no prose, no explanation:
{
  "outdoor_kitchen": true|false|null,
  "solar_ready": true|false|null,
  "solar_installed": true|false|null,
  "bed_size": "king"|"queen"|"full"|"twin"|"other"|"unknown"|null,
  "has_fireplace": true|false|null,
  "pet_friendly": true|false|null,
  "rear_bedroom": true|false|null,
  "rear_living": true|false|null,
  "front_kitchen": true|false|null,
  "theater_seating": true|false|null,
  "island_kitchen": true|false|null,
  "walk_around_bed": true|false|null,
  "outdoor_shower": true|false|null,
  "outdoor_speakers": true|false|null,
  "backup_camera": true|false|null,
  "hydraulic_jacks": true|false|null,
  "power_awning": true|false|null,
  "enclosed_underbelly": true|false|null,
  "heated_tanks": true|false|null,
  "four_season": true|false|null,
  "hitch_type": "bumper_pull"|"gooseneck"|"fifth_wheel"|"none"|null
}

Rules:
- Use true only when clearly confirmed in the text
- Use false when clearly NOT present or explicitly absent
- Use null when the text gives no information
- bed_size: look for "king bed", "queen bed", "full bed", "twin beds" in description/features
- solar_ready vs solar_installed: "solar prep" or "solar ready" = solar_ready; "solar panels" or "solar installed" = solar_installed
- rear_bedroom: floorplan description mentions rear bedroom, RBQ, RBL etc
- theater_seating: "theater seating", "theater seats", "theater chairs"
- hydraulic_jacks: "hydraulic leveling", "hydraulic jacks", "auto-level hydraulic"
- power_awning: "power awning", "electric awning", "motorized awning"
- enclosed_underbelly: "enclosed underbelly", "enclosed belly", "fully enclosed"
- four_season: "four season", "4-season", "all season", "winter package", "arctic package"
- pet_friendly: "pet friendly", "pet door", "outdoor pet shower", pets mentioned in listing`;

interface RawListing {
  id: number;
  title: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  type: string | null;
  description: string | null;
  features: string[] | null;
  generator: boolean | null;
  solar_installed: boolean | null;
  solar_ready: boolean | null;
  fresh_water: number | null;
  grey_water: number | null;
  black_water: number | null;
  enclosed_underbelly: boolean | null;
  heated_tanks: boolean | null;
  four_season: boolean | null;
  enrichment_version: number | null;
}

interface EnrichmentFields {
  outdoor_kitchen: boolean | null;
  solar_ready: boolean | null;
  solar_installed: boolean | null;
  bed_size: string | null;
  has_fireplace: boolean | null;
  pet_friendly: boolean | null;
  rear_bedroom: boolean | null;
  rear_living: boolean | null;
  front_kitchen: boolean | null;
  theater_seating: boolean | null;
  island_kitchen: boolean | null;
  walk_around_bed: boolean | null;
  outdoor_shower: boolean | null;
  outdoor_speakers: boolean | null;
  backup_camera: boolean | null;
  hydraulic_jacks: boolean | null;
  power_awning: boolean | null;
  enclosed_underbelly: boolean | null;
  heated_tanks: boolean | null;
  four_season: boolean | null;
  hitch_type: string | null;
  boondocking_score: number;
  enrichment_version: number;
  enriched_at: string;
}

function inferHitchType(rvType: string | null, aiHitchType: string | null): string | null {
  if (aiHitchType && aiHitchType !== null) return aiHitchType;
  if (!rvType) return null;
  const t = rvType.toLowerCase();
  if (t.includes("fifth_wheel") || t.includes("fifth wheel")) return "fifth_wheel";
  if (t.includes("travel_trailer") || t.includes("toy_hauler") || t.includes("popup")) return "bumper_pull";
  if (t.includes("class_a") || t.includes("class_b") || t.includes("class_c")) return "none";
  return null;
}

function calcBoondockingScore(listing: RawListing, enriched: Partial<EnrichmentFields>): number {
  let score = 0;

  const hasGenerator = listing.generator === true;
  const hasSolarInstalled = enriched.solar_installed === true || listing.solar_installed === true;
  const hasSolarReady = enriched.solar_ready === true || listing.solar_ready === true;

  if (hasGenerator || hasSolarInstalled) score += 25;
  else if (hasSolarReady) score += 15;

  const freshWater = listing.fresh_water ?? 0;
  if (freshWater >= 60) score += 30;
  else if (freshWater >= 40) score += 20;

  const enclosedUnderbelly = enriched.enclosed_underbelly === true;
  if (enclosedUnderbelly) score += 10;

  const heatedTanks = enriched.heated_tanks === true;
  if (heatedTanks) score += 10;

  const fourSeason = enriched.four_season === true;
  if (fourSeason) score += 10;

  const greyWater = listing.grey_water ?? 0;
  if (greyWater >= 40) score += 5;

  const blackWater = listing.black_water ?? 0;
  if (blackWater >= 30) score += 5;

  return Math.min(score, 100);
}

export async function enrichListing(listing: RawListing): Promise<EnrichmentFields | null> {
  if ((listing.enrichment_version ?? 0) >= ENRICHMENT_VERSION) return null;

  const features = Array.isArray(listing.features) ? listing.features.slice(0, 50) : [];
  const description = (listing.description ?? "").slice(0, 1500);

  const userContent = `RV LISTING:
Title: ${listing.title ?? ""}
Make: ${listing.make ?? ""} | Model: ${listing.model ?? ""} | Year: ${listing.year ?? ""}
Type: ${listing.type ?? ""}

Description:
${description}

Features (first 50):
${features.join("\n")}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: ENRICHMENT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const rawText = response.content[0]?.type === "text" ? response.content[0].text : "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");

    const extracted = JSON.parse(jsonMatch[0]) as Partial<EnrichmentFields>;

    const hitchType = inferHitchType(listing.type, extracted.hitch_type ?? null);
    const boondockingScore = calcBoondockingScore(listing, extracted);

    return {
      outdoor_kitchen: extracted.outdoor_kitchen ?? null,
      solar_ready: extracted.solar_ready ?? null,
      solar_installed: extracted.solar_installed ?? null,
      bed_size: extracted.bed_size ?? null,
      has_fireplace: extracted.has_fireplace ?? null,
      pet_friendly: extracted.pet_friendly ?? null,
      rear_bedroom: extracted.rear_bedroom ?? null,
      rear_living: extracted.rear_living ?? null,
      front_kitchen: extracted.front_kitchen ?? null,
      theater_seating: extracted.theater_seating ?? null,
      island_kitchen: extracted.island_kitchen ?? null,
      walk_around_bed: extracted.walk_around_bed ?? null,
      outdoor_shower: extracted.outdoor_shower ?? null,
      outdoor_speakers: extracted.outdoor_speakers ?? null,
      backup_camera: extracted.backup_camera ?? null,
      hydraulic_jacks: extracted.hydraulic_jacks ?? null,
      power_awning: extracted.power_awning ?? null,
      enclosed_underbelly: extracted.enclosed_underbelly ?? null,
      heated_tanks: extracted.heated_tanks ?? null,
      four_season: extracted.four_season ?? null,
      hitch_type: hitchType,
      boondocking_score: boondockingScore,
      enrichment_version: ENRICHMENT_VERSION,
      enriched_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[enrichment] Failed for listing ${listing.id}:`, err);
    return null;
  }
}

function toSqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

export interface EnrichmentRunResult {
  processed: number;
  enriched: number;
  skipped: number;
  errors: number;
  remaining: number;
}

export async function enrichBatch(limit = 20): Promise<EnrichmentRunResult> {
  const result: EnrichmentRunResult = { processed: 0, enriched: 0, skipped: 0, errors: 0, remaining: 0 };

  const rows = await db.execute(
    sql.raw(`SELECT id, title, make, model, year, type, description, features, generator, solar_installed, solar_ready, fresh_water, grey_water, black_water, enclosed_underbelly, heated_tanks, four_season, enrichment_version FROM listings WHERE (enrichment_version IS NULL OR enrichment_version < ${ENRICHMENT_VERSION}) ORDER BY id LIMIT ${limit}`)
  );

  const listings = ((rows as unknown as { rows?: RawListing[] }).rows ?? []) as RawListing[];
  result.processed = listings.length;

  for (const listing of listings) {
    try {
      const fields = await enrichListing(listing);
      if (!fields) { result.skipped++; continue; }

      const setClause = [
        `outdoor_kitchen = ${toSqlValue(fields.outdoor_kitchen)}`,
        `solar_ready = ${toSqlValue(fields.solar_ready)}`,
        `solar_installed = ${toSqlValue(fields.solar_installed)}`,
        `bed_size = ${toSqlValue(fields.bed_size)}`,
        `has_fireplace = ${toSqlValue(fields.has_fireplace)}`,
        `pet_friendly = ${toSqlValue(fields.pet_friendly)}`,
        `rear_bedroom = ${toSqlValue(fields.rear_bedroom)}`,
        `rear_living = ${toSqlValue(fields.rear_living)}`,
        `front_kitchen = ${toSqlValue(fields.front_kitchen)}`,
        `theater_seating = ${toSqlValue(fields.theater_seating)}`,
        `island_kitchen = ${toSqlValue(fields.island_kitchen)}`,
        `walk_around_bed = ${toSqlValue(fields.walk_around_bed)}`,
        `outdoor_shower = ${toSqlValue(fields.outdoor_shower)}`,
        `outdoor_speakers = ${toSqlValue(fields.outdoor_speakers)}`,
        `backup_camera = ${toSqlValue(fields.backup_camera)}`,
        `hydraulic_jacks = ${toSqlValue(fields.hydraulic_jacks)}`,
        `power_awning = ${toSqlValue(fields.power_awning)}`,
        `enclosed_underbelly = ${toSqlValue(fields.enclosed_underbelly)}`,
        `heated_tanks = ${toSqlValue(fields.heated_tanks)}`,
        `four_season = ${toSqlValue(fields.four_season)}`,
        `hitch_type = ${toSqlValue(fields.hitch_type)}`,
        `boondocking_score = ${toSqlValue(fields.boondocking_score)}`,
        `enrichment_version = ${ENRICHMENT_VERSION}`,
        `enriched_at = NOW()`,
      ].join(", ");
      await db.execute(sql.raw(`UPDATE listings SET ${setClause} WHERE id = ${listing.id}`));

      result.enriched++;
    } catch (err) {
      console.error(`[enrichment] Error updating listing ${listing.id}:`, err);
      result.errors++;
    }

    await new Promise(r => setTimeout(r, 200));
  }

  const countRows = await db.execute(
    sql.raw(`SELECT COUNT(*) as cnt FROM listings WHERE (enrichment_version IS NULL OR enrichment_version < ${ENRICHMENT_VERSION})`)
  );
  result.remaining = Number(((countRows as unknown as { rows?: { cnt: string }[] }).rows ?? [])[0]?.cnt ?? 0);

  return result;
}

let enrichmentTimer: ReturnType<typeof setInterval> | null = null;

export function startEnrichmentCron() {
  if (enrichmentTimer) return;
  console.log("[enrichment] Cron started — will run every hour");
  enrichmentTimer = setInterval(async () => {
    console.log("[enrichment] Hourly batch starting...");
    const r = await enrichBatch(20);
    console.log(`[enrichment] Done — enriched=${r.enriched} errors=${r.errors} remaining=${r.remaining}`);
  }, 60 * 60 * 1000);
}
