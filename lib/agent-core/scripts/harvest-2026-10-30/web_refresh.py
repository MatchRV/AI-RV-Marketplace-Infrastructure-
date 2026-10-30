"""Collect-only dealer-website harvest using the repo's rv_inventory_scraper.InventoryScraper.
- Targets: dealer domains not in the live snapshot (>= MIN_COUNT listings per Marketcheck facets).
- Politeness: robots.txt enforced per URL, 1 s delay, 2 detail workers, no proxy (Bright Data disabled),
  no headless-browser fallback, Cloudflare-challenged pages are skipped (never bypassed).
- Output: websites/<domain>.jsonl (one raw listing per line). No DB, no dedupe, no prod writes."""
import json, os, sys, time, logging, urllib.robotparser
from urllib.parse import urlparse
from datetime import datetime
for k in list(os.environ):
    if k.startswith("BRIGHT_DATA"): os.environ.pop(k)
sys.path.insert(0, os.environ.get("REPO", "/workspace/scrape-2026-10-26/repo-src"))
from rv_inventory_scraper.scraper import InventoryScraper, listing_to_dict
from rv_inventory_scraper.models import Dealer
BASE = os.path.dirname(os.path.abspath(__file__))
MIN_COUNT = int(os.getenv("WEB_MIN_COUNT", "100"))
PER_DEALER_MAX_SEC = int(os.getenv("WEB_PER_DEALER_MAX_SEC", "12600"))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("web_harvest")
UA_TOKEN = "*"
robots = {}
def allowed(url):
    p = urlparse(url); host = f"{p.scheme}://{p.netloc}"
    rp = robots.get(host)
    if rp is None:
        rp = urllib.robotparser.RobotFileParser(host + "/robots.txt")
        try:
            import requests
            r = requests.get(host + "/robots.txt", timeout=15, headers={"User-Agent": "Mozilla/5.0 MatchRV-collector"})
            rp.parse(r.text.splitlines() if r.status_code == 200 else [])
        except Exception:
            rp.parse([])
        robots[host] = rp
    return rp.can_fetch(UA_TOKEN, url)
class PoliteScraper(InventoryScraper):
    deadline = None
    def fetch(self, url, *, optional=False):
        if self.deadline and time.time() > self.deadline:
            return None
        if not allowed(url):
            self.skip_reasons["robots_disallowed"] += 1
            return None
        html = super().fetch(url, optional=optional)
        if self.skip_reasons.get("fetch_blocked", 0) >= 3:
            log.warning("BOT CHECK / blocked repeatedly on %s - stopping this dealer", url)
            self.skip_reasons["stopped_bot_check"] = 1
            self.deadline = 0.001
        return html
targets = json.load(open(os.path.join(BASE, "web_targets_network.json")))
targets.sort(key=lambda t: -t["count"])
SHARD, NSH = int(os.getenv("SHARD", "0")), int(os.getenv("NSHARDS", "1"))
targets = [t for i, t in enumerate(targets) if i % NSH == SHARD]
done_path = os.path.join(BASE, "web", "_done.jsonl")
done = {json.loads(l)["domain"] for l in open(done_path)} if os.path.exists(done_path) else set()
for t in targets:
    dom = t["item"]
    if dom in done: continue
    scraper = PoliteScraper(delay_seconds=1.5, detail_workers=1, bright_data=False, browser_fallback=False, timeout=25)
    scraper.deadline = time.time() + PER_DEALER_MAX_SEC
    started = time.time(); n = 0; err = None
    url = t.get("url") or f"https://{dom}/"
    try:
        listings = scraper.scrape_dealer(Dealer(name=dom, city="", url=url))
        with open(os.path.join(BASE, "web", f"{dom}.jsonl"), "w") as f:
            ts = datetime.now().astimezone().isoformat()
            for l in listings:
                f.write(json.dumps({"_harvest": {"method": "dealer_website_rv_inventory_scraper", "harvested_at": ts, "dealer_domain": dom}, **listing_to_dict(l)}, default=str) + "\n"); n += 1
    except Exception as e:
        err = repr(e)[:300]; log.exception("dealer %s failed", dom)
    rec = {"domain": dom, "records": n, "snapshot_units": t["count"], "secs": round(time.time() - started), "error": err,
           "skip_reasons": dict(getattr(scraper, "skip_reasons", {}) or {}), "finished_at": datetime.now().astimezone().isoformat()}
    with open(done_path, "a") as f: f.write(json.dumps(rec) + "\n")
    log.info("DEALER DONE %s", json.dumps(rec))
log.info("ALL TARGETS DONE")
