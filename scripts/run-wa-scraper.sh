#!/usr/bin/env bash
# One-shot WA RV inventory scrape + DB sync.
# Run from the workspace root:
#   bash scripts/run-wa-scraper.sh
# Optional: pass --max-pages-per-dealer N to limit pagination (0 = unlimited).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DEALERS_FILE="${DEALERS_FILE:-$ROOT/wa-dealers.json}"
OUTPUT_FILE="${SCRAPER_OUTPUT:-$ROOT/output/wa-rv-inventory.json}"

echo "[scraper] Starting WA RV inventory scrape at $(date)"
echo "[scraper] Dealers file: $DEALERS_FILE"
echo "[scraper] Output file:  $OUTPUT_FILE"

cd "$ROOT"
python3 -m rv_inventory_scraper.cli \
  --dealers "$DEALERS_FILE" \
  --output "$OUTPUT_FILE" \
  --verbose \
  "$@"

echo "[scraper] Done at $(date)"
