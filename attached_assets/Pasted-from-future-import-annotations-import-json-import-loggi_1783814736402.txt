from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from collections import Counter, deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from typing import Iterable
from urllib.parse import parse_qs, urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter

from .models import Dealer, Listing
from .normalize import clean_text, dealer_domain, infer_type_from_text, parse_int, parse_price, parse_title_parts

LOGGER = logging.getLogger(__name__)

LISTING_URL_HINTS = (
    "for-sale",
    "stock-",
    "/rvs/",
    "inventory",
    "new-rvs",
    "used-rvs",
)

PAGE_PARAM_NAMES = ("page", "paged", "pg", "pagenumber")

# Query params that identify a single unit on dealer SaaS platforms.
DETAIL_QUERY_PARAMS = {
    "vehicleid",
    "vehicle_id",
    "stocknumber",
    "stock_number",
    "stocknum",
    "stockno",
    "stock",
    "unit",
    "unitid",
    "unit_id",
    "inventoryid",
    "inventory_id",
    "vid",
    "vin",
}

# Path fragments that mark a single-unit detail page on the platforms in
# wa-dealers.json (/inventory/unit/12345, /new/rvs/detail/stock/A12345, ...).
DETAIL_PATH_RE = re.compile(
    r"""
    /(unit|detail|vehicle)s?/         # /unit/, /detail/, /vehicle/ segments
    | stock[-=/][a-z0-9]              # stock-K12345, stock=A99, /stock/A12345
    | -i\d{3,}(?:/|$)                 # InteractRV-style trailing unit id: ...-i123456
    | --x?inventorydetail             # InteractRV detail handler pages
    """,
    re.IGNORECASE | re.VERBOSE,
)

# Year-prefixed slug used by /rv-for-sale/2024-keystone-cougar-29rks style URLs.
YEAR_SLUG_RE = re.compile(r"/(19|20)\d{2}-[a-z0-9][a-z0-9-]{4,}", re.IGNORECASE)

# Pagination path suffixes (/page/2/, /inventory/3/).
PAGINATION_PATH_RE = re.compile(r"/(page/)?\d+/?$")

# Sitemap / feed locations commonly exposed by dealer SaaS platforms. The
# /rv-search platform (EasyDealerWebsite-style) publishes /rv-search.xml;
# WordPress dealers publish /sitemap.xml or /wp-sitemap.xml; most others have
# a standard /sitemap.xml or a sitemap index.
FEED_CANDIDATE_PATHS = (
    "/rv-search.xml",
    "/inventory-sitemap.xml",
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/wp-sitemap.xml",
    "/sitemap/sitemap.xml",
)

# Speculative JSON inventory endpoints exposed by some dealer platforms.
JSON_FEED_CANDIDATE_PATHS = (
    "/api/inventory",
    "/api/inventory/search",
    "/rv-search.json",
)

# Child sitemaps worth recursing into when a sitemap index is found.
FEED_CHILD_HINTS = ("inventory", "unit", "product", "stock", "listing", "rv", "vehicle", "page")

# Non-inventory site pages that dealer sitemaps list with inventory-style
# query params (e.g. sumnerrv.com/creditapp?UnitId=3098865). The UnitId param
# alone would make looks_like_detail_url() accept them, so the PATH is checked
# against this denylist first. `^` is correct here even with re.search():
# without re.MULTILINE, `^` matches only at the start of the string, and each
# alternative carries its own anchor, so e.g. `/apply-for-credit/contact` is
# matched (starts with /apply...) while `/inventory/contact-form-unit` is not.
NON_INVENTORY_PATH_RE = re.compile(
    r"""
    ^/credit(?:app|-app|-application)  # /creditapp, /credit-app
    | ^/financ                          # /financing, /finance
    | ^/apply(?:/|$|-)                  # /apply, /apply-for-credit
    | ^/contact                         # /contact, /contact-us, /contact-us-trade-ins
    | ^/trade-?in                       # /trade-in, /tradein
    | ^/service(?:s)?(?:/|$|-)          # /service, /services, /service-department
    | ^/parts(?:/|$|-)                  # /parts
    | ^/schedule                        # /schedule-service
    | ^/about(?:/|$|-)                  # /about, /about-us
    | ^/blog(?:/|$|-)                   # /blog
    | ^/news(?:/|$|-)                   # /news
    | ^/careers?(?:/|$|-)               # /careers
    | ^/warranty(?:/|$|-)               # /warranty
    | ^/testimonials?(?:/|$|-)          # /testimonials
    | ^/directions?(?:/|$|-)            # /directions
    | ^/insurance(?:/|$|-)              # /insurance
    | ^/rv-shows?(?:/|$|-)              # /rv-shows
    | ^/events?(?:/|$|-)                # /events
    | ^/gallery(?:/|$|-)                # /gallery
    | ^/privacy                         # /privacy-policy
    | ^/terms                           # /terms-of-use
    | ^/sitemap                         # /sitemap pages
    | ^/employment                      # /employment
    | ^/login | ^/account | ^/cart      # account/commerce chrome
    """,
    re.IGNORECASE | re.VERBOSE,
)

# `window.__INITIAL_STATE__ = {...}` style hydration blobs on React/Vue/Next
# dealer sites (Blue Compass, Tacoma RV, ...). The JSON object that follows
# the `=` is decoded with json.JSONDecoder().raw_decode.
STATE_BLOB_RE = re.compile(
    r"window\.(?:__INITIAL_STATE__|__PRELOADED_STATE__|__NEXT_DATA__|__APOLLO_STATE__|__props|__PRELOADED__)\s*=\s*",
)

# Image URLs embedded in <script> JSON (allows JSON-escaped slashes `\/`).
SCRIPT_IMG_URL_RE = re.compile(
    r"""https?:(?:\\/\\/|//)[^"'\s\\)<>]+?\.(?:jpe?g|png|webp)(?:\?[^"'\s\\)<>]*)?""",
    re.IGNORECASE,
)

# --- Photo quality filters -------------------------------------------------
# Site chrome that must never be stored as a unit photo. Verified against
# junk found in production galleries (nav icons, social logos, badges,
# InteractRV floorplan tech drawings, tiny size-suffixed nav thumbs).
PHOTO_JUNK_RE = re.compile(
    r"""(?xi)
    icon | logo | sprite | badge | placeholder | comingsoon | avatar | favicon |
    social | instagram | facebook | linkedin | youtube | twitter | tiktok |
    unit_tech_drawing | banner | /common/ | /flags/ | /themes/ |
    /wp-content/themes/ | /wp-content/plugins/ |
    loading | spinner | pixel | blank\.(?:gif|png) | 1x1 |
    -\d{2,3}x\d{2}\.(?:webp|png|jpg)      # e.g. trailer-icon-1-240x88.webp
    """
)

# Known unit-photo URL shapes per dealer platform. Matching URLs are promoted
# to the front of the gallery and exempted from the junk check (except tech
# drawings, handled above).
PLATFORM_PHOTO_RES = (
    re.compile(r"/cdn/prod/\d+-\d+-[a-f0-9]+_l\.jpg", re.I),           # Poulsbo/NetSource
    re.compile(r"/cdn/prod/[\w-]+-Stock-[\w-]+(?:-\d+)?\.jpg", re.I),  # Poulsbo slug photos
    re.compile(r"assets-cdn\.interactcp\.com/.+/unit_photo/", re.I),   # InteractRV
    re.compile(r"cloudfront\.net/s3/img\.rv/", re.I),                  # RVUSA-style CDN
    re.compile(r"cloudfront\.net/\d+-\d+\.jpg", re.I),                 # Lazydays
)

# Full gallery embedded by the rey/Elementor theme used by Poulsbo RV:
# `var rpgGalleryData = [{"type":"image","thumbnail":...,"medium":...,"large":...}]`
RPG_GALLERY_RE = re.compile(r"rpgGalleryData\s*=\s*(\[.*?\])\s*[;\n]", re.S)

# InteractRV unit photos referenced anywhere in scripts/JSON.
INTERACTRV_PHOTO_RE = re.compile(
    r"https://assets-cdn\.interactcp\.com/[^\s\"'\\]+/unit_photo/[^\s\"'\\]+"
)

# Last-resort core-field patterns scanned across raw <script> content when the
# DOM, JSON-LD, and state blobs all failed to yield price/year/manufacturer.
SCRIPT_PRICE_RE = re.compile(
    r'"(?:price|salePrice|sale_price|sellingPrice|selling_price|listPrice|list_price|ourPrice|our_price|msrp)"'
    r'\s*:\s*"?\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)"?',
    re.IGNORECASE,
)
SCRIPT_YEAR_RE = re.compile(
    r'"(?:year|modelYear|model_year)"\s*:\s*"?((?:19|20)\d{2})"?',
    re.IGNORECASE,
)
SCRIPT_MANUFACTURER_RE = re.compile(
    r'"(?:manufacturer|manufacturerName|make|makeName|brandName|brand)"\s*:\s*"([A-Za-z][A-Za-z0-9 .&\'-]{1,40})"',
    re.IGNORECASE,
)

BLOCKED_STATUSES = (401, 403, 429)


_BRIGHT_DATA_HOST = "brd.superproxy.io"
_BRIGHT_DATA_PORT = 22225
_BRIGHT_DATA_SB_PORT = 9222

# Patterns that indicate a Cloudflare JS challenge page rather than real content.
_CF_CHALLENGE_MARKERS = (
    "cdn-cgi/challenge-platform",
    "challenges.cloudflare.com",
    "__cf_chl_rt_tk",
    "turnstile/v0",
)

# Throttle concurrent Chromium LAUNCHES (not sessions). Each launch spawns a
# Node.js driver + Chromium process tree (~50 OS threads); 8 detail workers
# launching at once exhausts the Replit container's ~1000-thread budget and
# pthread_create fails with EAGAIN. Three at a time staggers the burst; once
# launched, all 8 per-thread browsers run concurrently as before.
_BROWSER_LAUNCH_SEM = threading.Semaphore(int(os.getenv("BROWSER_LAUNCH_CONCURRENCY", "3")))


def _is_cf_challenge(html: str) -> bool:
    """Return True if the HTML is a Cloudflare challenge/Turnstile page."""
    sample = html[:8000].lower()
    return any(m in sample for m in _CF_CHALLENGE_MARKERS)


def _bright_data_proxy_url() -> str | None:
    """Build Bright Data residential proxy URL from env vars."""
    import os  # noqa: PLC0415
    username = os.getenv("BRIGHT_DATA_USERNAME")
    password = os.getenv("BRIGHT_DATA_PASSWORD")
    if username and password:
        return f"http://{username}:{password}@{_BRIGHT_DATA_HOST}:{_BRIGHT_DATA_PORT}"
    return None


def _bright_data_sb_endpoint() -> str | None:
    """Build Bright Data Scraping Browser WSS endpoint from env vars.

    Requires BRIGHT_DATA_CUSTOMER_ID + BRIGHT_DATA_SB_ZONE + BRIGHT_DATA_PASSWORD.
    The Scraping Browser zone name is typically 'scraping_browser' in the dashboard.
    """
    import os  # noqa: PLC0415
    customer_id = os.getenv("BRIGHT_DATA_CUSTOMER_ID")
    sb_zone = os.getenv("BRIGHT_DATA_SB_ZONE")
    password = os.getenv("BRIGHT_DATA_PASSWORD")
    if customer_id and sb_zone and password:
        username = f"brd-customer-{customer_id}-zone-{sb_zone}"
        return f"wss://{username}:{password}@{_BRIGHT_DATA_HOST}:{_BRIGHT_DATA_SB_PORT}"
    return None


class InventoryScraper:
    def __init__(
        self,
        *,
        timeout: int = 30,
        delay_seconds: float = 0.25,
        max_pages_per_dealer: int = 0,
        detail_workers: int = 8,
        max_detail_urls_per_dealer: int = 0,
        browser_fallback: bool = False,
        bright_data: bool = True,
        session: requests.Session | None = None,
    ) -> None:
        self.timeout = timeout
        self.delay_seconds = delay_seconds
        self.max_pages_per_dealer = max_pages_per_dealer
        self.detail_workers = max(1, detail_workers)
        self.max_detail_urls_per_dealer = max_detail_urls_per_dealer
        self.browser_fallback = browser_fallback

        # Bright Data residential proxy — auto-detected from env vars.
        proxy_url = _bright_data_proxy_url() if bright_data else None
        if proxy_url:
            LOGGER.info("Bright Data residential proxy enabled (%s:%d)", _BRIGHT_DATA_HOST, _BRIGHT_DATA_PORT)
            self._proxy_session: requests.Session | None = self._build_proxy_session(proxy_url)
        else:
            self._proxy_session = None

        # Bright Data Scraping Browser (CDP) — handles Cloudflare Turnstile.
        self._sb_endpoint: str | None = _bright_data_sb_endpoint() if bright_data else None
        if self._sb_endpoint:
            LOGGER.info("Bright Data Scraping Browser enabled (%s:%d)", _BRIGHT_DATA_HOST, _BRIGHT_DATA_SB_PORT)

        self.session = session or requests.Session()
        self.session.mount(
            "http://",
            HTTPAdapter(pool_connections=self.detail_workers + 4, pool_maxsize=self.detail_workers + 4),
        )
        self.session.mount(
            "https://",
            HTTPAdapter(pool_connections=self.detail_workers + 4, pool_maxsize=self.detail_workers + 4),
        )
        self.session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )
        self.skip_reasons: Counter[str] = Counter()
        # Per-thread browser storage so ThreadPoolExecutor workers each get
        # their own Playwright browser instance (sync_playwright is not
        # thread-safe across instances).
        self._thread_local = threading.local()

    @staticmethod
    def _build_proxy_session(proxy_url: str) -> requests.Session:
        """Create a requests.Session pre-configured with the Bright Data proxy."""
        s = requests.Session()
        s.proxies = {"http": proxy_url, "https": proxy_url}
        s.verify = False  # Bright Data MITM cert — expected for proxy inspection
        s.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )
        s.mount("http://", HTTPAdapter(pool_connections=16, pool_maxsize=16))
        s.mount("https://", HTTPAdapter(pool_connections=16, pool_maxsize=16))
        return s

    # ── Browser lifecycle ────────────────────────────────────────────────────

    @staticmethod
    def _find_chromium_executable() -> str | None:
        """Return the system Chromium path, preferring NixOS-native builds."""
        import shutil  # noqa: PLC0415
        for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable"):
            path = shutil.which(name)
            if path:
                return path
        return None

    def _get_browser(self):
        """Return a Playwright Chromium browser for the current thread, lazily created.

        Concurrent LAUNCHES are gated by _BROWSER_LAUNCH_SEM so that 8 detail
        workers cold-starting at once don't spawn 8 Node.js+Chromium process
        trees simultaneously (pthread_create EAGAIN on Replit). The semaphore
        is acquired only on a cache miss and released as soon as the launch
        completes — it throttles the launch burst, not the browser session.
        """
        if not getattr(self._thread_local, "browser", None):
            try:
                from playwright.sync_api import sync_playwright  # noqa: PLC0415
            except ImportError as exc:
                raise RuntimeError(
                    "playwright is not installed. Run: python -m pip install playwright && python -m playwright install chromium"
                ) from exc

            # APScheduler worker threads can carry a running asyncio event
            # loop; Playwright's sync API refuses to start inside one, so we
            # temporarily swap in a fresh loop for the driver startup.
            import asyncio  # noqa: PLC0415
            _old_loop = None
            try:
                _old_loop = asyncio.get_event_loop()
                if _old_loop.is_running():
                    asyncio.set_event_loop(asyncio.new_event_loop())
            except RuntimeError:
                pass

            chromium_path = self._find_chromium_executable()
            launch_kwargs: dict = {
                "headless": True,
                "args": ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
            }
            if chromium_path:
                launch_kwargs["executable_path"] = chromium_path
                LOGGER.debug("Using system Chromium: %s", chromium_path)

            _BROWSER_LAUNCH_SEM.acquire()
            try:
                try:
                    pw = sync_playwright().start()
                finally:
                    if _old_loop is not None:
                        try:
                            asyncio.set_event_loop(_old_loop)
                        except Exception:
                            pass
                try:
                    browser = pw.chromium.launch(**launch_kwargs)
                except Exception:
                    # Don't leak the Node driver if the Chromium launch fails.
                    try:
                        pw.stop()
                    except Exception:
                        pass
                    raise
            finally:
                _BROWSER_LAUNCH_SEM.release()

            self._thread_local.playwright = pw
            self._thread_local.browser = browser
            LOGGER.debug("Playwright Chromium browser started (thread %s)", threading.current_thread().name)
        return self._thread_local.browser

    def _close_thread_browser(self) -> None:
        browser = getattr(self._thread_local, "browser", None)
        if browser:
            try:
                browser.close()
            except Exception:
                pass
            self._thread_local.browser = None
        pw = getattr(self._thread_local, "playwright", None)
        if pw:
            try:
                pw.stop()
            except Exception:
                pass
            self._thread_local.playwright = None

    # ── Fetch ────────────────────────────────────────────────────────────────

    def fetch(self, url: str, *, optional: bool = False) -> str | None:
        """Fetch a URL with a tiered fallback chain:
        1. Direct HTTP request
        2. Bright Data residential proxy  (bypasses IP-based blocks)
        3. Bright Data Scraping Browser   (bypasses Cloudflare Turnstile / JS challenges)
        4. Local headless Chromium        (--browser-fallback flag)

        optional=True marks speculative probes (feed/sitemap discovery): 404s
        and misses are expected, so failures are logged at DEBUG and are not
        counted in skip_reasons.
        """
        try:
            time.sleep(self.delay_seconds)
            response = self.session.get(url, timeout=self.timeout)
            if response.status_code in BLOCKED_STATUSES:
                LOGGER.info("HTTP %d for %s", response.status_code, url)
            elif _is_cf_challenge(response.text):
                LOGGER.info("Cloudflare challenge on direct fetch for %s", url)
            else:
                response.raise_for_status()
                return response.text
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if 400 <= status < 500:
                # Definitive client error (404/410/...): retrying through the
                # proxy or a browser won't change the answer.
                if optional:
                    LOGGER.debug("Optional fetch missed for %s: HTTP %d", url, status)
                else:
                    LOGGER.warning("Fetch failed for %s: HTTP %d", url, status)
                    self.skip_reasons["fetch_failed"] += 1
                return None
            if optional:
                LOGGER.debug("Optional fetch missed for %s: %s", url, exc)
                return None
            LOGGER.warning("Fetch failed for %s; trying fallbacks: %s", url, exc)
        except requests.RequestException as exc:
            if optional:
                LOGGER.debug("Optional fetch missed for %s: %s", url, exc)
                return None
            LOGGER.warning("Fetch failed for %s; trying fallbacks: %s", url, exc)

        # 1st fallback: Bright Data residential proxy
        if self._proxy_session is not None:
            result = self.fetch_with_proxy(url)
            if result is not None:
                return result

        # Speculative feed probes stop at the cheap tiers: spending a slow
        # browser round-trip on each of ~6 candidate sitemap paths per dealer
        # would blow the run-time budget. Real page fetches continue below.
        if optional:
            LOGGER.debug("Optional fetch blocked at cheap tiers for %s", url)
            return None

        # 2nd fallback: Bright Data Scraping Browser (handles Cloudflare Turnstile)
        if self._sb_endpoint is not None:
            result = self.fetch_with_scraping_browser(url)
            if result is not None:
                return result

        # 3rd fallback: local headless Chromium
        if self.browser_fallback:
            result = self.fetch_with_browser(url)
            if result is not None:
                return result

        LOGGER.warning("All fallbacks exhausted for %s", url)
        self.skip_reasons["fetch_blocked"] += 1
        return None

    def fetch_with_proxy(self, url: str) -> str | None:
        """Fetch through the Bright Data residential proxy.
        Returns None if still blocked OR if the response is a Cloudflare challenge page.
        """
        try:
            import urllib3  # noqa: PLC0415
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
            response = self._proxy_session.get(url, timeout=self.timeout + 15)
            if response.status_code in BLOCKED_STATUSES:
                LOGGER.info("Bright Data proxy blocked (HTTP %d) for %s — trying next fallback", response.status_code, url)
                self.skip_reasons["proxy_blocked"] += 1
                return None
            response.raise_for_status()
            if _is_cf_challenge(response.text):
                LOGGER.info("Bright Data proxy got Cloudflare challenge for %s — trying Scraping Browser", url)
                self.skip_reasons["proxy_cf_challenge"] += 1
                return None
            LOGGER.info("Bright Data proxy succeeded for %s (%d bytes)", url, len(response.text))
            self.skip_reasons["proxy_success"] += 1
            return response.text
        except requests.RequestException as exc:
            LOGGER.warning("Bright Data proxy failed for %s: %s", url, exc)
            self.skip_reasons["proxy_failed"] += 1
            return None

    def fetch_with_scraping_browser(self, url: str) -> str | None:
        """Fetch via Bright Data Scraping Browser (CDP).
        This runs a real browser in Bright Data's cloud and can solve Cloudflare Turnstile.
        Requires BRIGHT_DATA_CUSTOMER_ID + BRIGHT_DATA_SB_ZONE + BRIGHT_DATA_PASSWORD env vars.
        """
        try:
            from playwright.sync_api import sync_playwright  # noqa: PLC0415
        except ImportError:
            LOGGER.warning("playwright not installed — cannot use Scraping Browser")
            return None
        try:
            with sync_playwright() as pw:
                browser = pw.chromium.connect_over_cdp(self._sb_endpoint, timeout=30000)
                ctx = browser.new_context()
                page = ctx.new_page()
                try:
                    page.goto(url, wait_until="domcontentloaded", timeout=(self.timeout + 30) * 1000)
                    page.wait_for_timeout(5000)
                    html = page.content()
                    if _is_cf_challenge(html):
                        LOGGER.warning("Scraping Browser still got CF challenge for %s", url)
                        self.skip_reasons["sb_cf_challenge"] += 1
                        return None
                    LOGGER.info("Scraping Browser succeeded for %s (%d bytes)", url, len(html))
                    self.skip_reasons["sb_success"] += 1
                    return html
                finally:
                    page.close()
                    ctx.close()
                    browser.close()
        except Exception as exc:
            LOGGER.warning("Scraping Browser failed for %s: %s", url, exc)
            self.skip_reasons["sb_failed"] += 1
            return None

    def fetch_with_browser(self, url: str) -> str | None:
        """Fetch a URL using a headless Chromium browser.

        Returns None (instead of the challenge HTML) when Cloudflare serves a
        JS challenge / Turnstile page. A plain headless Chromium usually cannot
        pass managed challenges, but non-interactive JS challenges sometimes
        clear after a few seconds, so we poll briefly before giving up.
        """
        try:
            browser = self._get_browser()
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/125.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
                java_script_enabled=True,
            )
            page = context.new_page()
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=self.timeout * 1000)
                # Wait for network to go idle so SPA/AJAX inventory loads fully.
                # Many dealer sites (Blue Compass, RnR, etc.) render listings via
                # API calls after initial DOM load — networkidle catches those.
                # We cap the wait at 8 s to avoid hanging on sites that poll.
                try:
                    page.wait_for_load_state("networkidle", timeout=8000)
                except Exception:
                    pass
                # Extra fixed pause for late-resolving React/Vue renders.
                page.wait_for_timeout(2000)
                html = page.content()

                # Cloudflare detection: if we got a challenge page, give the
                # in-page JS up to ~12 s (4 × 3 s) to solve a non-interactive
                # challenge and redirect to the real content.
                attempts = 0
                while _is_cf_challenge(html) and attempts < 4:
                    attempts += 1
                    page.wait_for_timeout(3000)
                    html = page.content()
                if _is_cf_challenge(html):
                    LOGGER.info(
                        "Browser fallback got Cloudflare challenge for %s (%d bytes) — rejecting",
                        url,
                        len(html),
                    )
                    self.skip_reasons["browser_fallback_cf_challenge"] += 1
                    return None

                LOGGER.info("Browser fallback succeeded for %s (%d bytes)", url, len(html))
                self.skip_reasons["browser_fallback_success"] += 1
                return html
            finally:
                page.close()
                context.close()
        except Exception as exc:
            LOGGER.warning("Browser fallback failed for %s: %s", url, exc)
            self.skip_reasons["browser_fallback_failed"] += 1
            return None

    # ── Dealer scraping ──────────────────────────────────────────────────────

    def scrape_dealers(self, dealers: Iterable[Dealer]) -> list[Listing]:
        listings: list[Listing] = []
        for dealer in dealers:
            LOGGER.info("Scraping %s (%s)", dealer.name, dealer.url)
            try:
                listings.extend(self.scrape_dealer(dealer))
            except Exception as exc:
                LOGGER.exception("Dealer %s failed; continuing with next dealer: %s", dealer.name, exc)
                self.skip_reasons["dealer_failed"] += 1
        # Clean up the main-thread browser if it was started.
        self._close_thread_browser()
        return listings

    def scrape_dealer(self, dealer: Dealer) -> list[Listing]:
        started = time.monotonic()
        detail_urls: set[str] = set()

        # Prefer public inventory feeds (rv-search.xml / sitemaps / JSON APIs):
        # these are usually served without Cloudflare protection, so they work
        # for the ~60 dealers whose HTML pages return challenges.
        feed_urls = self.discover_feed_detail_urls(dealer.url)
        if feed_urls:
            LOGGER.info("Dealer %s: %d detail URLs from public feed", dealer.name, len(feed_urls))
            self.skip_reasons["feed_discovery_success"] += 1
            detail_urls.update(feed_urls)
        else:
            page_urls = self.discover_inventory_pages(dealer.url)
            for page_url in page_urls:
                html = self.fetch(page_url)
                if not html:
                    continue
                detail_urls.update(self.extract_listing_urls(html, page_url))

        ordered_detail_urls = sorted(detail_urls)

        # Lazydays.com: their sitemap mixes individual listing pages (e.g.
        # /rvs/tampa-fl/class-a/used/2024/make-model-1234567) with model/category
        # pages (e.g. /rvs/2025-forest-river-grand-design) that always return 403.
        # Individual listings always end in a 6+-digit numeric stock ID (optionally
        # followed by 1-2 alpha chars). Filtering to those cuts the URL pool from
        # ~3005 → ~1400 and prevents the per-dealer timeout from firing.
        if "lazydays.com" in dealer.url.lower():
            _stock_re = re.compile(r"-\d{6,}[a-z]{0,2}$", re.IGNORECASE)
            before = len(ordered_detail_urls)
            ordered_detail_urls = [
                u for u in ordered_detail_urls
                if _stock_re.search(urlparse(u).path)
            ]
            LOGGER.info(
                "Dealer %s: lazydays stock-ID filter reduced %d → %d URLs",
                dealer.name,
                before,
                len(ordered_detail_urls),
            )

        if self.max_detail_urls_per_dealer and len(ordered_detail_urls) > self.max_detail_urls_per_dealer:
            LOGGER.warning(
                "Dealer %s found %d detail URLs; limiting to %d by --max-detail-urls-per-dealer",
                dealer.name,
                len(ordered_detail_urls),
                self.max_detail_urls_per_dealer,
            )
            ordered_detail_urls = ordered_detail_urls[: self.max_detail_urls_per_dealer]

        results: list[Listing] = []
        if ordered_detail_urls:
            with ThreadPoolExecutor(max_workers=self.detail_workers) as executor:
                futures = {
                    executor.submit(self.scrape_listing_detail, detail_url, dealer): detail_url
                    for detail_url in ordered_detail_urls
                }
                for index, future in enumerate(as_completed(futures), start=1):
                    listing = future.result()
                    if listing is not None:
                        results.append(listing)
                    if index % 100 == 0:
                        LOGGER.info(
                            "Dealer %s: parsed %d/%d detail pages, %d valid listings",
                            dealer.name,
                            index,
                            len(ordered_detail_urls),
                            len(results),
                        )
            # Clean up any per-thread browsers spawned by the pool workers.
            executor.shutdown(wait=True)

        elapsed = time.monotonic() - started
        LOGGER.info(
            "Dealer %s: %d listings after validation from %d detail URLs in %.1fs",
            dealer.name,
            len(results),
            len(ordered_detail_urls),
            elapsed,
        )
        return results

    def scrape_listing_detail(self, detail_url: str, dealer: Dealer) -> Listing | None:
        html = self.fetch(detail_url)
        if not html:
            self.skip_reasons["fetch_failed"] += 1
            return None
        try:
            return self.parse_listing(html, detail_url, dealer)
        except Exception as exc:
            LOGGER.warning("Listing parse failed for %s: %s", detail_url, exc)
            self.skip_reasons["listing_parse_failed"] += 1
            return None

    # ── Public feed discovery ────────────────────────────────────────────────

    def discover_feed_detail_urls(self, start_url: str) -> set[str]:
        """Find listing detail URLs from public feeds instead of HTML scraping.

        Probes, in order:
        1. XML feeds / sitemaps (/rv-search.xml, /sitemap.xml, /wp-sitemap.xml...)
           including one level of sitemap-index recursion.
        2. JSON inventory endpoints (/api/inventory, /rv-search.json).

        Returns the first non-empty set of same-domain detail URLs, or an empty
        set so the caller falls back to HTML page discovery.
        """
        parsed = urlparse(start_url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        root_domain = dealer_domain(start_url)

        for path in FEED_CANDIDATE_PATHS:
            xml = self.fetch(base + path, optional=True)
            if not xml or "<" not in xml[:200]:
                continue
            urls = self._detail_urls_from_xml_feed(xml, base, root_domain)
            if urls:
                LOGGER.info("Feed %s%s yielded %d detail URLs", base, path, len(urls))
                return urls

        for path in JSON_FEED_CANDIDATE_PATHS:
            raw = self.fetch(base + path, optional=True)
            if not raw:
                continue
            urls = self._detail_urls_from_json_feed(raw, base, root_domain)
            if urls:
                LOGGER.info("JSON feed %s%s yielded %d detail URLs", base, path, len(urls))
                return urls
        return set()

    def _detail_urls_from_xml_feed(self, xml: str, base: str, root_domain: str) -> set[str]:
        """Extract detail URLs from a sitemap / RSS-style XML feed.

        Handles both <loc> (sitemaps) and <link> (RSS / dealer feeds) entries,
        and recurses one level into child sitemaps of a sitemap index.
        """
        locs = re.findall(r"<(?:loc|link)>\s*(?:<!\[CDATA\[)?\s*(https?://[^<\]\s]+)", xml, re.IGNORECASE)
        child_maps: list[str] = []
        urls: set[str] = set()
        for raw in locs:
            url = self.safe_join(base, raw)
            if not url:
                continue
            if urlparse(url).netloc.lower().removeprefix("www.") != root_domain:
                continue
            if url.lower().rstrip("/").endswith(".xml"):
                child_maps.append(url)
            elif self.looks_like_detail_url(url):
                urls.add(url)

        if not urls and child_maps:
            # Sitemap index: fetch the child sitemaps most likely to contain
            # inventory pages (capped to keep the run fast and polite).
            ranked = sorted(
                child_maps,
                key=lambda u: 0 if any(h in u.lower() for h in FEED_CHILD_HINTS) else 1,
            )
            for child in ranked[:15]:
                child_xml = self.fetch(child, optional=True)
                if not child_xml:
                    continue
                for raw in re.findall(
                    r"<(?:loc|link)>\s*(?:<!\[CDATA\[)?\s*(https?://[^<\]\s]+)", child_xml, re.IGNORECASE
                ):
                    url = self.safe_join(base, raw)
                    if (
                        url
                        and urlparse(url).netloc.lower().removeprefix("www.") == root_domain
                        and not url.lower().rstrip("/").endswith(".xml")
                        and self.looks_like_detail_url(url)
                    ):
                        urls.add(url)
        return urls

    def _detail_urls_from_json_feed(self, raw: str, base: str, root_domain: str) -> set[str]:
        """Extract same-domain detail URLs from an arbitrary JSON payload."""
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            return set()
        urls: set[str] = set()

        def walk(value: object) -> None:
            if isinstance(value, dict):
                for child in value.values():
                    walk(child)
            elif isinstance(value, list):
                for child in value:
                    walk(child)
            elif isinstance(value, str) and ("/" in value):
                candidate = value if value.startswith("http") else (base + value if value.startswith("/") else None)
                if not candidate:
                    return
                url = self.safe_join(base, candidate)
                if (
                    url
                    and urlparse(url).netloc.lower().removeprefix("www.") == root_domain
                    and self.looks_like_detail_url(url)
                ):
                    urls.add(url)

        walk(payload)
        return urls

    # ── Page discovery ───────────────────────────────────────────────────────

    def discover_inventory_pages(self, start_url: str) -> list[str]:
        """Discover all reachable inventory pages without a listing-count cap.

        The old pipeline trusted upstream run output and treated large dealer
        payloads as errors. This crawler follows pagination links and stops only
        when no new inventory pages are found. max_pages_per_dealer is a loop
        guard, not a listing limit; 0 means unlimited.
        """
        root_domain = dealer_domain(start_url)
        queue: deque[str] = deque([self.canonical_url(start_url)])
        seen: set[str] = set()
        pages: list[str] = []

        while queue:
            if self.max_pages_per_dealer and len(seen) >= self.max_pages_per_dealer:
                LOGGER.warning("Page guard reached for %s at %d pages", start_url, len(seen))
                break
            url = queue.popleft()
            if url in seen:
                continue
            seen.add(url)
            html = self.fetch(url)
            if not html:
                continue
            pages.append(url)
            soup = BeautifulSoup(html, "html.parser")
            for link in soup.select("a[href]"):
                href = self.safe_join(url, link.get("href", ""))
                if not href:
                    continue
                parsed = urlparse(href)
                if parsed.netloc.lower().removeprefix("www.") != root_domain:
                    continue
                if href in seen:
                    continue
                if self.looks_like_inventory_page(href, link.get_text(" "), start_url):
                    queue.append(href)
        return pages

    def looks_like_inventory_page(self, url: str, link_text: str = "", start_url: str | None = None) -> bool:
        parsed = urlparse(url)
        text = f"{parsed.path} {parsed.query} {link_text}".lower()

        # Individual listing detail pages are identified by a stock number in
        # the URL (e.g. /rvs/stock-K12345 or /inventory/stock=A99). These are
        # never inventory list pages and should not be crawled for pagination.
        # NOTE: "for-sale" alone does NOT mean detail page — many dealers
        # paginate with URLs like /inventory/for-sale/page/2/ and excluding
        # them causes the scraper to stop at page 1 (~12 listings per dealer).
        if re.search(r"stock[-=][a-z0-9-]+", text):
            return False

        if start_url:
            start = urlparse(start_url)
            start_path = start.path.rstrip("/") or "/"
            current_path = parsed.path.rstrip("/") or "/"
            if not (
                current_path == start_path
                or current_path.startswith(start_path + "/")
                or re.search(r"/(page/)?\d+/?$", current_path)
            ):
                return False

        if re.search(r"/(page/)?\d+/?$", parsed.path):
            return True
        if any(name in parse_qs(parsed.query) for name in PAGE_PARAM_NAMES):
            return True
        return False

    def extract_listing_urls(self, html: str, base_url: str) -> set[str]:
        soup = BeautifulSoup(html, "html.parser")
        root_domain = dealer_domain(base_url)
        urls: set[str] = set()
        for link in soup.select("a[href]"):
            href = self.safe_join(base_url, link.get("href", ""))
            if not href:
                continue
            parsed = urlparse(href)
            if parsed.netloc.lower().removeprefix("www.") != root_domain:
                continue
            if self.looks_like_detail_url(href):
                urls.add(href)
        return urls

    def is_category_page(self, url: str) -> bool:
        """Return True for inventory LIST/category pages, which must never be
        queued as single-listing detail pages.

        Examples: /new-rvs-for-sale, /used-rvs-for-sale/page/2/, /--inventory,
        /rv-search, /rvs-for-sale/fife-wa-inventory/, ...--xAllInventory.
        """
        parsed = urlparse(url)
        path = parsed.path.lower().rstrip("/")
        query = parse_qs(parsed.query)

        # Strong detail signals override everything else — /inventory/unit/12345
        # ends in digits but is a unit page, not pagination.
        if DETAIL_PATH_RE.search(url) or any(name.lower() in DETAIL_QUERY_PARAMS for name in query):
            return False
        # Pagination is always a list page.
        if PAGINATION_PATH_RE.search(parsed.path) or any(name in query for name in PAGE_PARAM_NAMES):
            return True
        # Known platform landing/list paths.
        last = path.rsplit("/", 1)[-1]
        if path.endswith(("/--inventory", "/rv-search")) or path in ("/--inventory", "/rv-search"):
            return True
        if "xallinventory" in path or "brands-inventory" in path:
            return True
        # "...-for-sale" / "...inventory" segments with no digits anywhere in
        # the path are category pages (e.g. /rvs-for-sale/dealer/tacoma-washington).
        if ("for-sale" in path or "for_sale" in path or "inventory" in path or last in ("rvs", "inventory")) and not re.search(
            r"\d", path
        ):
            return True
        return False

    def looks_like_detail_url(self, url: str, link_text: str = "") -> bool:
        """Return True if the URL points at a single-unit listing detail page.

        Covers the URL shapes used by the platforms in wa-dealers.json:
        - /rvs/stock-K12345, /inventory?stock=A99       (stock-number pages)
        - /inventory/unit/12345, /new/rvs/detail/stock/A12345
        - ?vehicleId=..., ?stockNumber=..., ?unit=...   (query-param platforms)
        - /rv-for-sale/2024-keystone-cougar-29rks       (year-slug pages)
        - ...-i123456, ...--xInventoryDetail            (InteractRV /--inventory platform)
        Category/list pages are explicitly excluded first.
        """
        if self.is_category_page(url):
            return False
        parsed = urlparse(url)
        path = parsed.path
        query = parse_qs(parsed.query)

        # Sitemap pollution guard: credit apps / contact forms / service pages
        # that carry a UnitId-style query param are NOT listings. Checked
        # before the query-param test below, which would otherwise accept them.
        if NON_INVENTORY_PATH_RE.search(path):
            return False

        if DETAIL_PATH_RE.search(url):
            return True
        if any(name.lower() in DETAIL_QUERY_PARAMS for name in query):
            return True
        if YEAR_SLUG_RE.search(path) and any(
            hint in path.lower() for hint in ("for-sale", "inventory", "rv", "product")
        ):
            return True
        # Long alphanumeric slug under an inventory-ish path: detail pages on
        # most dealer SaaS sites end in a slug that mixes letters and digits
        # (model/floorplan codes), while category slugs are digit-free.
        last = path.rstrip("/").rsplit("/", 1)[-1]
        if (
            len(last) >= 8
            and re.search(r"\d", last)
            and re.search(r"[a-z]", last, re.IGNORECASE)
            and any(hint in path.lower() for hint in ("for-sale", "for_sale", "/inventory/", "/rvs/", "/rv/"))
        ):
            return True
        haystack = f"{url} {link_text}".lower()
        return bool(re.search(r"stock[-=][a-z0-9-]+", haystack))

    # ── Listing parsing ──────────────────────────────────────────────────────

    def parse_listing(self, html: str, url: str, dealer: Dealer) -> Listing | None:
        soup = BeautifulSoup(html, "html.parser")
        structured = self.extract_structured_data(soup)
        title = (
            self.meta_content(soup, "og:title")
            or clean_text(soup.title.string if soup.title else None)
            or clean_text(structured.get("name"))
            or url
        )
        title = re.sub(r"\s*\|\s*.*$", "", title)
        title_parts = parse_title_parts(title)
        specs = self.extract_specs(soup)

        price = (
            parse_price(structured.get("price"))
            or parse_price(self.meta_content(soup, "product:price:amount"))
            or parse_price(specs.get("price"))
            or self._price_from_page_text(soup)
        )
        photos = self.extract_photos(soup, structured, url)
        description = (
            clean_text(structured.get("description"))
            or self.meta_content(soup, "description")
            or self.extract_description(soup)
        )

        rv_type = (
            infer_type_from_text(specs.get("type"), specs.get("rv type"), title, url)
            or infer_type_from_text(structured.get("@type"))
        )
        manufacturer = clean_text(
            specs.get("manufacturer")
            or specs.get("make")
            or specs.get("brand")
            or structured.get("brand")
            or title_parts["manufacturer"]
        )
        brand = clean_text(specs.get("brand") or structured.get("brand") or manufacturer)
        model = clean_text(specs.get("model") or structured.get("model") or title_parts["model"])
        floorplan = clean_text(
            specs.get("floorplan")
            or specs.get("floor plan")
            or specs.get("trim")
            or title_parts["floorplan"]
        )
        year = parse_int(specs.get("year")) or parse_int(structured.get("year")) or title_parts["year"]
        vin = clean_text(specs.get("vin") or structured.get("vin"))
        stock = clean_text(
            specs.get("stock") or specs.get("stock #") or specs.get("stock number") or structured.get("stock")
        )
        condition = clean_text(specs.get("condition") or structured.get("condition"))

        # Last resort: if the DOM, JSON-LD, and state blobs all failed to
        # produce the fields the validation gates require, regex-scan the raw
        # <script> content before giving up on this listing.
        if price is None or year is None or not manufacturer:
            fallback = self.scan_scripts_for_core_fields(soup)
            if price is None:
                price = fallback.get("price")  # already validated by parse_price
            if year is None:
                year = fallback.get("year")
            if not manufacturer:
                manufacturer = clean_text(fallback.get("manufacturer"))
                brand = brand or manufacturer

        listing = Listing(
            dealer_name=dealer.name,
            dealer_domain=dealer.domain,
            dealer_location=dealer.city,
            source_url=url,
            title=title,
            rv_type=rv_type,
            condition=condition,
            year=year if isinstance(year, int) else None,
            manufacturer=manufacturer,
            brand=brand,
            model=model,
            floorplan=floorplan,
            price=price,
            vin=vin,
            stock_number=stock,
            description=description,
            photos=photos,
            specs=specs,
        )

        if not listing.has_required_media():
            self.skip_reasons["zero_photos"] += 1
            return None
        if not listing.has_required_core_fields():
            self.skip_reasons["missing_required_core_fields"] += 1
            return None
        return listing

    # ── HTML extraction helpers ──────────────────────────────────────────────

    def extract_structured_data(self, soup: BeautifulSoup) -> dict[str, object]:
        """Extract a product-like data node from the page, trying in order:
        1. <script type="application/ld+json"> (JSON-LD Product/Vehicle)
        2. <script type="application/json"> blocks (incl. Next.js __NEXT_DATA__)
        3. window.__INITIAL_STATE__ / __PRELOADED_STATE__ / __NEXT_DATA__ /
           __APOLLO_STATE__ / __props assignment blobs inside plain <script>s
        """
        # 1. JSON-LD
        for script in soup.select('script[type="application/ld+json"]'):
            raw = script.string or script.get_text()
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            candidates = payload if isinstance(payload, list) else [payload]
            for item in candidates:
                found = self.find_product_json(item)
                if found:
                    return self._normalize_product_node(found)

        # 2. application/json blocks (Next.js hydration data and friends)
        for script in soup.select('script[type="application/json"]'):
            raw = script.string or script.get_text()
            if not raw:
                continue
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            found = self.find_product_json(payload)
            if found:
                return self._normalize_product_node(found)
            node = self._find_listing_like_node(payload)
            if node:
                return self._normalize_state_node(node)

        # 3. window.__STATE__-style assignment blobs in plain scripts
        for script in soup.find_all("script"):
            raw = script.string or script.get_text() or ""
            if not raw or "window." not in raw:
                continue
            for match in STATE_BLOB_RE.finditer(raw):
                payload = self._decode_json_at(raw, match.end())
                if payload is None:
                    continue
                found = self.find_product_json(payload)
                if found:
                    return self._normalize_product_node(found)
                node = self._find_listing_like_node(payload)
                if node:
                    return self._normalize_state_node(node)
        return {}

    def _normalize_product_node(self, found: dict[str, object]) -> dict[str, object]:
        """Flatten a JSON-LD Product/Vehicle node into the shape parse_listing expects."""
        offers = found.get("offers") if isinstance(found.get("offers"), dict) else {}
        brand = found.get("brand")
        if isinstance(brand, dict):
            brand = brand.get("name")
        return {
            **found,
            "price": offers.get("price") or found.get("price"),
            "brand": brand,
        }

    def _decode_json_at(self, text: str, idx: int) -> object | None:
        """Decode the JSON value starting at text[idx] (`window.X = {...};` blobs).

        raw_decode tolerates the trailing `;` and any code that follows the
        object, so we don't need to find the closing brace ourselves.
        """
        while idx < len(text) and text[idx] in " \t\r\n":
            idx += 1
        if idx >= len(text) or text[idx] not in "{[":
            return None
        try:
            payload, _ = json.JSONDecoder().raw_decode(text, idx)
        except (json.JSONDecodeError, ValueError):
            return None
        return payload if isinstance(payload, (dict, list)) else None

    # Keys that mark a dict inside a state blob as "this is the vehicle".
    _PRICE_KEYS = (
        "price", "saleprice", "sale_price", "sellingprice", "selling_price",
        "listprice", "list_price", "ourprice", "our_price", "msrp",
    )
    _MEDIA_OR_ID_KEYS = (
        "images", "photos", "image", "gallery", "imageurls", "image_urls",
        "vin", "stocknumber", "stock_number", "stockno",
    )

    def _find_listing_like_node(self, value: object, depth: int = 0) -> dict[str, object] | None:
        """Recursively find a dict that looks like a single-vehicle record:
        it has a price-ish key AND an images/VIN/stock-ish key."""
        if depth > 10:
            return None
        if isinstance(value, dict):
            keys = {str(k).lower() for k in value}
            if keys.intersection(self._PRICE_KEYS) and keys.intersection(self._MEDIA_OR_ID_KEYS):
                return value
            for child in value.values():
                found = self._find_listing_like_node(child, depth + 1)
                if found:
                    return found
        elif isinstance(value, list):
            for child in value[:100]:
                found = self._find_listing_like_node(child, depth + 1)
                if found:
                    return found
        return None

    def _normalize_state_node(self, node: dict[str, object]) -> dict[str, object]:
        """Map a state-blob vehicle dict onto the keys parse_listing reads."""
        lowered = {str(k).lower(): v for k, v in node.items()}

        def get(*names: str) -> object | None:
            for name in names:
                if name in lowered and lowered[name] not in (None, "", []):
                    return lowered[name]
            return None

        return {
            "name": get("name", "title", "adtitle", "ad_title"),
            "price": get(*self._PRICE_KEYS),
            "image": get("images", "photos", "gallery", "imageurls", "image_urls", "image"),
            "brand": get("brand", "brandname", "make", "makename", "manufacturer", "manufacturername"),
            "model": get("model", "modelname"),
            "year": get("year", "modelyear", "model_year"),
            "vin": get("vin"),
            "stock": get("stocknumber", "stock_number", "stockno", "stock"),
            "description": get("description", "comments"),
            "condition": get("condition", "newused", "new_used"),
        }

    def _price_from_page_text(self, soup: BeautifulSoup) -> int | None:
        """Find a $-anchored price in the rendered page text.

        The old fallback ran parse_price() over the whole page text, which
        returned the FIRST number >= 1000 — almost always the model year in
        the title ("2022 Keystone Cougar..." -> price=2022). Requiring a
        leading dollar sign avoids that; "Call for Price" pages return None.
        """
        text = soup.get_text(" ", strip=True)
        for match in re.finditer(r"\$\s?([0-9][0-9,]*(?:\.[0-9]+)?)", text):
            price = parse_price(match.group(1))
            if price is not None:
                return price
        return None

    def scan_scripts_for_core_fields(self, soup: BeautifulSoup) -> dict[str, object]:
        """Best-effort regex scan of raw <script> content for price / year /
        manufacturer when every structured source came up empty. Only called
        as a last resort from parse_listing."""
        out: dict[str, object] = {}
        for script in soup.find_all("script"):
            raw = script.string or script.get_text() or ""
            if not raw or len(raw) < 20:
                continue
            if "price" not in out:
                match = SCRIPT_PRICE_RE.search(raw)
                if match:
                    price = parse_price(match.group(1))
                    if price is not None:
                        out["price"] = price
            if "year" not in out:
                match = SCRIPT_YEAR_RE.search(raw)
                if match:
                    year = parse_int(match.group(1))
                    if year is not None:
                        out["year"] = year
            if "manufacturer" not in out:
                match = SCRIPT_MANUFACTURER_RE.search(raw)
                if match:
                    value = clean_text(match.group(1))
                    if value and value.lower() not in ("null", "none", "undefined", "true", "false"):
                        out["manufacturer"] = value
            if len(out) == 3:
                break
        return out

    def find_product_json(self, value: object) -> dict[str, object] | None:
        if isinstance(value, dict):
            type_value = value.get("@type")
            types = type_value if isinstance(type_value, list) else [type_value]
            if any(str(t).lower() in {"product", "vehicle", "car"} for t in types if t):
                return value
            for child in value.values():
                found = self.find_product_json(child)
                if found:
                    return found
        elif isinstance(value, list):
            for child in value:
                found = self.find_product_json(child)
                if found:
                    return found
        return None

    def extract_specs(self, soup: BeautifulSoup) -> dict[str, object]:
        specs: dict[str, object] = {}
        for row in soup.select("tr"):
            cells = [clean_text(c.get_text(" ")) for c in row.select("th,td")]
            cells = [c for c in cells if c]
            if len(cells) >= 2:
                specs[self.spec_key(cells[0])] = cells[1]
        for dl in soup.select("dl"):
            terms = dl.select("dt")
            values = dl.select("dd")
            for term, value in zip(terms, values):
                key = self.spec_key(term.get_text(" "))
                specs[key] = clean_text(value.get_text(" "))
        text = soup.get_text("\n", strip=True)
        patterns = {
            "vin": r"\bVIN[:\s#-]+([A-Z0-9]{8,})",
            "stock": r"\bStock(?:\s*#|\s*Number)?[:\s#-]+([A-Z0-9-]+)",
            "length": r"\bLength[:\s]+([0-9'\" .-]+)",
            "slides": r"\bSlides?[:\s]+(\d+)",
            "sleeps": r"\bSleeps[:\s]+(\d+)",
            "year": r"\bYear[:\s]+(20\d{2}|19\d{2})",
        }
        for key, pattern in patterns.items():
            if key not in specs:
                match = re.search(pattern, text, re.IGNORECASE)
                if match:
                    specs[key] = clean_text(match.group(1))
        return specs

    def extract_description(self, soup: BeautifulSoup) -> str | None:
        selectors = [
            ".description",
            ".product-description",
            "#description",
            ".woocommerce-product-details__short-description",
            "[itemprop='description']",
        ]
        for selector in selectors:
            node = soup.select_one(selector)
            if node:
                return clean_text(node.get_text(" "))
        return None

    @staticmethod
    def _is_junk_photo(url: str) -> bool:
        """True when a URL is site chrome rather than a unit photo."""
        low = url.lower()
        if low.startswith("data:") or low.endswith(".svg") or ".svg?" in low:
            return True
        if "unit_tech_drawing" in low:
            return True
        # Known platform unit-photo shapes are never junk.
        for pat in PLATFORM_PHOTO_RES:
            if pat.search(url):
                return False
        if PHOTO_JUNK_RE.search(url):
            return True
        if not re.search(r"\.(jpe?g|png|webp|avif)(\?|$)", url, re.IGNORECASE):
            return True
        return False

    @staticmethod
    def _photo_variant_key(url: str) -> str:
        """Dedupe key ignoring size-variant suffixes (_l/_s/_m, -800x600) and query."""
        return re.sub(r"(_[lsm]|-\d{2,4}x\d{2,4})(?=\.\w+)", "", url.split("?")[0]).lower()

    def extract_photos(self, soup: BeautifulSoup, structured: dict[str, object], base_url: str) -> list[str]:
        seen: set[str] = set()
        photos: list[str] = []

        def add(value: object | None) -> None:
            if not value:
                return
            url = self.safe_join(base_url, value)
            if not url or self._is_junk_photo(url):
                return
            key = self._photo_variant_key(url)
            if key not in seen:
                seen.add(key)
                photos.append(url)

        script_texts = [
            raw for script in soup.find_all("script")
            if (raw := (script.string or script.get_text() or "")) and len(raw) >= 40
        ]

        # 1. Platform-embedded full galleries — highest fidelity. Dealer sites
        #    (Poulsbo etc.) render only the hero image as an <img>; the full
        #    gallery lives in rpgGalleryData / script JSON.
        for raw in script_texts:
            if "rpgGalleryData" not in raw:
                continue
            for blob in RPG_GALLERY_RE.finditer(raw):
                try:
                    items = json.loads(blob.group(1))
                except (json.JSONDecodeError, ValueError):
                    continue
                for item in items:
                    if isinstance(item, dict) and item.get("type") in (None, "image"):
                        add(item.get("large") or item.get("medium") or item.get("thumbnail"))
        for raw in script_texts:
            if "interactcp.com" in raw:
                for match in INTERACTRV_PHOTO_RE.finditer(raw.replace("\\/", "/")):
                    add(match.group(0))

        # 2. Structured data (JSON-LD image, or images/photos list from a state blob)
        image_value = structured.get("image")
        if isinstance(image_value, list):
            for item in image_value:
                if isinstance(item, dict):
                    add(item.get("url") or item.get("src") or item.get("imageUrl") or item.get("image_url"))
                else:
                    add(item)
        elif isinstance(image_value, dict):
            add(image_value.get("url") or image_value.get("src"))
        else:
            add(image_value)

        # 3. Image URLs embedded in <script> JSON (React/SPA galleries that
        #    never render <img> tags server-side). Runs BEFORE the <img> scan
        #    so embedded galleries aren't crowded out of the cap by page
        #    chrome; the junk filter keeps this safe to run unconditionally.
        for raw in script_texts:
            if "rpgGalleryData" in raw:
                continue  # already consumed at full resolution in step 1
            for match in SCRIPT_IMG_URL_RE.finditer(raw):
                add(match.group(0).replace("\\/", "/"))
            if len(photos) >= 24:
                break

        # 4. <img>/<source> tags — direct, lazy-load, and srcset variants
        for image in soup.select(
            "img[src], img[data-src], img[data-lazy-src], img[data-lazy], img[data-original], "
            "img[srcset], img[data-srcset], source[srcset], source[data-srcset]"
        ):
            add(
                image.get("src")
                or image.get("data-src")
                or image.get("data-lazy-src")
                or image.get("data-lazy")
                or image.get("data-original")
            )
            srcset = image.get("srcset") or image.get("data-srcset")
            if srcset:
                # "url1 640w, url2 1280w" — take the URL part of each entry.
                for entry in str(srcset).split(","):
                    candidate = entry.strip().split(" ")[0]
                    add(candidate)

        # 5. CSS background-image in inline style attributes
        for node in soup.select('[style*="background"]'):
            style = node.get("style") or ""
            for match in re.finditer(r"url\(\s*['\"]?([^'\")\s]+)['\"]?\s*\)", style):
                add(match.group(1))

        # 6. og:image as the final fallback only — it is usually a duplicate
        #    of photo #1 or a share card, never a gallery.
        if not photos:
            add(self.meta_content(soup, "og:image"))

        # Order: known platform unit photos first, generic survivors after.
        platform: list[str] = []
        generic: list[str] = []
        for url in photos:
            if any(pat.search(url) for pat in PLATFORM_PHOTO_RES):
                platform.append(url)
            else:
                generic.append(url)
        return (platform + generic)[:24]

    def meta_content(self, soup: BeautifulSoup, name: str) -> str | None:
        node = soup.select_one(f"meta[property='{name}'], meta[name='{name}']")
        return clean_text(node.get("content")) if node and node.get("content") else None

    def spec_key(self, value: object) -> str:
        text = clean_text(value) or ""
        return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()

    def canonical_url(self, url: str) -> str:
        parsed = urlparse(url)
        parsed = parsed._replace(fragment="")
        return urlunparse(parsed)

    def safe_join(self, base_url: str, href: object | None) -> str | None:
        try:
            value = str(href or "").strip()
            if not value or value.startswith(("mailto:", "tel:", "javascript:")):
                return None
            return self.canonical_url(urljoin(base_url, value))
        except ValueError:
            self.skip_reasons["malformed_url"] += 1
            return None

    def spec_int(self, listing: Listing, *keys: str) -> int | None:
        for key in keys:
            val = listing.specs.get(key)
            if val is not None:
                result = parse_int(val)
                if result is not None:
                    return result
        return None

    def spec_number(self, listing: Listing, *keys: str) -> float | None:
        for key in keys:
            val = listing.specs.get(key)
            if val is not None:
                match = re.search(r"[\d.]+", str(val))
                if match:
                    try:
                        return float(match.group(0))
                    except ValueError:
                        pass
        return None


def listing_to_dict(listing: Listing) -> dict[str, object]:
    return asdict(listing)