import { z } from "zod/v4";

export function suppliedVin(message: string): string | null {
  const candidates = message.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) ?? [];
  return candidates.find(value => /[0-9]/.test(value) && /[A-Z]/.test(value)) ?? null;
}

export const towVinSchema = z.object({
  vin: z.string().trim().toUpperCase().regex(/^[A-HJ-NPR-Z0-9]{17}$/, "Enter a 17-character VIN without I, O or Q."),
  modelYear: z.number().int().min(1981).max(new Date().getFullYear() + 2).optional(),
});

export function decodeVpicFacts(record: Record<string, unknown>, sourceUrl: string) {
  const names = { year: "ModelYear", make: "Make", model: "Model", trim: "Trim", engineModel: "EngineModel", engineManufacturer: "EngineManufacturer", displacementLitres: "DisplacementL", cylinders: "EngineCylinders", fuelType: "FuelTypePrimary", drivetrain: "DriveType", transmission: "TransmissionStyle", gvwrClass: "GVWR" };
  const facts: Record<string, { value: string | null; status: string; source: string }> = {};
  for (const [name, field] of Object.entries(names)) {
    const raw = record[field];
    const value = typeof raw === "string" && raw.trim() && !/^not applicable|^unknown$/i.test(raw) ? raw.trim() : null;
    facts[name] = { value, status: value ? "source_verified" : "unknown", source: sourceUrl };
  }
  for (const name of ["towPackage", "axleRatio", "towCapacityLbs", "payloadLbs", "gcwrLbs", "hitchRatingLbs"]) {
    facts[name] = { value: null, status: "unknown", source: "Not established by this basic VIN lookup" };
  }
  return facts;
}

export async function lookupTowVin(input: z.infer<typeof towVinSchema>) {
  const parsed = towVinSchema.parse(input);
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${parsed.vin}?format=json${parsed.modelYear ? `&modelyear=${parsed.modelYear}` : ""}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": "MatchRV/1.0 (+https://matchrv.com)" } });
  if (!response.ok) throw new Error(`VIN source returned HTTP ${response.status}`);
  const data = await response.json() as { Results?: Array<Record<string, unknown>> };
  const record = data.Results?.[0];
  if (!record) throw new Error("VIN source returned no record.");
  const codes = String(record.ErrorCode ?? "").split(",").map(x => x.trim());
  return {
    status: codes.some(code => code && code !== "0") ? "partial_decode" : "decoded",
    source: "NHTSA vPIC", sourceUrl: url, decoderUrl: "https://vpic.nhtsa.dot.gov/decoder/", checkedAt: new Date().toISOString(),
    sourceNotice: String(record.ErrorText ?? ""), facts: decodeVpicFacts(record, url),
    nextQuestion: "Can you confirm the factory tow package and axle ratio from the build sheet, and the payload from the driver's door label?",
    limitations: "Basic VIN decoding is vehicle identification, not a factory option build sheet or towing approval. It does not establish current modifications, loaded weights, or exact towing capacity. Do not use a GVWR class as an exact weight limit.",
  };
}
