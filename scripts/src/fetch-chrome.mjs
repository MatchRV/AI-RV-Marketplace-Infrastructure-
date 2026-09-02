/**
 * Fetch a WebMCP-capable Chrome for Testing build (stable, ≥149) into the
 * gitignored .chrome/ directory, so the native runtime suite is two commands
 * on any machine:
 *
 *   pnpm --filter @workspace/scripts run fetch-chrome
 *   pnpm --filter @workspace/scripts run native-webmcp
 *
 * Source: Google's official Chrome for Testing endpoints. Uses curl for the
 * transfer (respects HTTPS_PROXY, present on Linux/macOS/Windows 10+).
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { platform, arch } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEST = resolve(here, "../../.chrome");

const PLATFORMS = {
  "linux-x64": { key: "linux64", bin: "chrome-linux64/chrome" },
  "darwin-arm64": { key: "mac-arm64", bin: "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" },
  "darwin-x64": { key: "mac-x64", bin: "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" },
  "win32-x64": { key: "win64", bin: "chrome-win64/chrome.exe" },
};

const plat = PLATFORMS[`${platform()}-${arch()}`] ?? null;

/** Where the fetched binary lives (imported by the native test for its default). */
export function chromeBinaryPath() {
  return plat ? resolve(DEST, plat.bin) : resolve(DEST, "chrome-not-supported-on-this-platform");
}

function main() {
  if (!plat) {
    console.error(`Unsupported platform ${platform()}-${arch()} — download Chrome ≥149 manually and set NATIVE_CHROME.`);
    process.exit(2);
  }
  const binPath = chromeBinaryPath();
  if (existsSync(binPath)) {
    console.log(`Chrome for Testing already present: ${binPath}`);
    return;
  }

  const metaJson = execFileSync("curl", [
    "-fsSL",
    "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json",
  ]).toString();
  const stable = JSON.parse(metaJson).channels.Stable;
  const major = Number(stable.version.split(".")[0]);
  if (major < 149) {
    console.error(`Stable Chrome for Testing is ${stable.version} (<149, no WebMCP) — set NATIVE_CHROME manually.`);
    process.exit(2);
  }
  const dl = stable.downloads.chrome.find((d) => d.platform === plat.key);
  console.log(`Downloading Chrome for Testing ${stable.version} (${plat.key})…`);

  mkdirSync(DEST, { recursive: true });
  const zipPath = resolve(DEST, "chrome.zip");
  execFileSync("curl", ["-fSL", "--progress-bar", "-o", zipPath, dl.url], { stdio: "inherit" });
  console.log("Extracting…");
  if (platform() === "win32") {
    execFileSync("tar", ["-xf", zipPath, "-C", DEST]);
  } else {
    execFileSync("unzip", ["-oq", zipPath, "-d", DEST]);
  }
  rmSync(zipPath);

  if (!existsSync(binPath)) {
    console.error(`Extraction finished but binary not found at ${binPath}`);
    process.exit(1);
  }
  console.log(`Ready: ${binPath}`);
  console.log("Run the native suite with: pnpm --filter @workspace/scripts run native-webmcp");
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
