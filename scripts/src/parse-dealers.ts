import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const inputFile = process.argv[2];
const outputFile = process.argv[3] ?? resolve(import.meta.dirname, "dealers.json");

if (!inputFile) {
  console.error("Usage: tsx parse-dealers.ts <tinyfish-output.json> [dealers.json]");
  process.exit(1);
}

const raw = readFileSync(inputFile, "utf-8");

let dealers: unknown[] = [];

try {
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    dealers = parsed;
  } else if (parsed.result) {
    const inner = parsed.result
      .replace(/^```json\s*/i, "")
      .replace(/```\s*$/, "")
      .trim();
    dealers = JSON.parse(inner);
  } else if (parsed.resultJson) {
    dealers = Array.isArray(parsed.resultJson)
      ? parsed.resultJson
      : JSON.parse(parsed.resultJson);
  }
} catch (err) {
  console.error("Failed to parse input:", err);
  process.exit(1);
}

writeFileSync(outputFile, JSON.stringify(dealers, null, 2), "utf-8");
console.log(`Saved ${dealers.length} dealers to ${outputFile}`);
