import { canonicalBrand, brandFromTitle } from "/workspace/ro-main-latest/lib/agent-core/src/brands.ts";
import { readFileSync } from "node:fs";
const items = JSON.parse(readFileSync(0, "utf8"));
const out = {};
for (const [make, title] of items) out[make + "\u0001" + title] = [canonicalBrand(make), brandFromTitle(title)];
process.stdout.write(JSON.stringify(out));
