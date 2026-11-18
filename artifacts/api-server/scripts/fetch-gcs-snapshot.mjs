#!/usr/bin/env node
/**
 * Off unless INVENTORY_GCS_ENABLED is 1/true (default off: exits 0 immediately, committed snapshot is used).
 * Pre-start: download the Google Cloud inventory export to INVENTORY_SNAPSHOT_PATH, validated, atomically.
 * Reads gs://$INVENTORY_GCS_BUCKET/$INVENTORY_GCS_OBJECT plus the manifest next to it, checks sha256 against the
 * manifest, checks the header shape (schemaVersion, builtAt, datasetNote, stats, units[]) and a unit floor
 * (INVENTORY_MIN_UNITS) without inflating the whole file. Any failure leaves the previous file (or none) in place, so agent-inventory.ts falls
 * back to the committed snapshot. No dependencies: service-account JWT -> OAuth token -> GCS JSON API. Always exits 0.
 * Does not change any MCP tool, input, or the /mcp URL; only which snapshot file is loaded at start.
 */
import { createSign, createHash } from "node:crypto";
import { writeFileSync, renameSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createGunzip } from "node:zlib";

const { INVENTORY_GCS_BUCKET: bucket, INVENTORY_GCS_OBJECT: object = "exports/inventory.snapshot.json.gz",
  INVENTORY_SNAPSHOT_PATH: dest, GCP_SA_KEY_JSON: keyJson, INVENTORY_MIN_UNITS: minUnits = "100000" } = process.env;
const log = (m) => console.log(`[gcs-snapshot] ${m}`);

async function token(key) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: key.client_email, scope: "https://www.googleapis.com/auth/devstorage.read_only", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${sig}` }) });
  if (!r.ok) throw new Error(`token HTTP ${r.status}`);
  return (await r.json()).access_token;
}
async function get(tok, name) {
  const r = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(name)}?alt=media`, { headers: { authorization: `Bearer ${tok}` } });
  if (!r.ok) throw new Error(`GET ${name} HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const enabled = ["1", "true"].includes((process.env.INVENTORY_GCS_ENABLED ?? "").trim().toLowerCase());
try {
  if (!enabled) { log("INVENTORY_GCS_ENABLED is off; using the committed snapshot"); process.exit(0); }
  if (!bucket || !dest || !keyJson) { log("not configured; using the committed snapshot"); process.exit(0); }
  const tok = await token(JSON.parse(keyJson));
  const manifest = JSON.parse((await get(tok, object.replace(/\.json\.gz$/, ".manifest.json"))).toString("utf8"));
  const gz = await get(tok, object);
  const sha = createHash("sha256").update(gz).digest("hex");
  if (sha !== manifest.sha256) throw new Error(`sha256 mismatch (${sha} vs manifest ${manifest.sha256})`);
  if (manifest.errors?.length) throw new Error(`export reported validation errors`);
  // The export job already round-trip validated the full file (count, ids, per-unit keys) before writing the manifest;
  // here we only check the bytes match that manifest and the header shape, without inflating ~400 MB on a small instance.
  if (!(manifest.units >= Number(minUnits))) throw new Error(`manifest unit count ${manifest.units} below floor ${minUnits}`);
  const head = await new Promise((res, rej) => {
    const z = createGunzip(); let got = "";
    z.on("data", (c) => { got += c.toString("latin1"); if (got.length > 200000) { z.destroy(); res(got); } });
    z.on("end", () => res(got)); z.on("error", (e) => (got.length ? res(got) : rej(e)));
    z.end(gz);
  });
  if (!/^\{"schemaVersion":\d+,"builtAt":"[^"]+","datasetNote":"/.test(head) || !head.includes('"units":[{'))
    throw new Error("unexpected snapshot header shape");
  if (!head.includes(`"units":${manifest.units},`)) throw new Error("stats.units does not match the manifest");
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(`${dest}.tmp`, gz);
  renameSync(`${dest}.tmp`, dest);
  log(`loaded ${manifest.units} units built ${manifest.builtAt} -> ${dest}`);
} catch (e) {
  log(`skipped (${e.message}); using the previous file or the committed snapshot`);
}
process.exit(0);
