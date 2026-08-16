from __future__ import annotations

import json
import logging
import re
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


class InventoryScraper:
    def __init__(
        self,
        *,
        timeout: int = 30,
        delay_seconds: float = 0.25,
        max_pages_per_dealer: int = 0,
        detail_workers: int = 8,
        max_detail_urls_per_dealer: int = 0,
        session: requests.Session | None = None,
    ) -> None:
        self.timeout = timeout
        self.delay_seconds = delay_seconds
        self.max_pages_per_dealer = max_pages_per_dealer
        self.detail_workers = max(1, detail_workers)
        self.max_detail_urls_per_dealer = max_detail_urls_per_dealer
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

    def scrape_dealers(self, dealers: Iterable[Dealer]) -> list[Listing]:
        listings: list[Listing] = []
        for dealer in dealers:
            LOGGER.info("Scraping %s (%s)", dealer.name, dealer.url)
            try:
                listings.extend(self.scrape_dealer(dealer))
            except Exception as exc:
                LOGGER.exception("Dealer %s failed; continuing with next dealer: %s", dealer.name, exc)
                self.skip_reasons["dealer_failed"] += 1
        return listings

    def scrape_dealer(self, dealer: Dealer) -> list[Listing]:
        started = time.monotonic()
        page_urls = self.discover_inventory_pages(dealer.url)
        detail_urls: set[str] = set()
        for page_url in page_urls:
            html = self.fetch(page_url)
            if not html:
                continue
            detail_urls.update(self.extract_listing_urls(html, page_url))

        ordered_detail_urls = sorted(detail_urls)
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

    def fetch(self, url: str) -> str | None:
        try:
            time.sleep(self.delay_seconds)
            response = self.session.get(url, timeout=self.timeout)
            response.raise_for_status()
            return response.text
        except requests.RequestException as exc:
            LOGGER.warning("Fetch failed for %s: %s", url, exc)
            return None

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
        if "for-sale" in text or re.search(r"stock[-=][a-z0-9-]+", text):
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
            haystack = f"{href} {link.get_text(' ')}".lower()
            if "for-sale" in haystack or re.search(r"stock[-=][a-z0-9-]+", haystack):
                urls.add(href)
        return urls

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
            or parse_price(soup.get_text(" ", strip=True))
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
        brand = clean_text(specs.get("brand") or manufacturer)
        model = clean_text(specs.get("model") or title_parts["model"])
        floorplan = clean_text(
            specs.get("floorplan")
            or specs.get("floor plan")
            or specs.get("trim")
            or title_parts["floorplan"]
        )
        year = parse_int(specs.get("year")) or title_parts["year"]
        vin = clean_text(specs.get("vin"))
        stock = clean_text(specs.get("stock") or specs.get("stock #") or specs.get("stock number"))
        condition = clean_text(specs.get("condition"))

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

    def extract_structured_data(self, soup: BeautifulSoup) -> dict[str, object]:
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
                    offers = found.get("offers") if isinstance(found.get("offers"), dict) else {}
                    brand = found.get("brand")
                    if isinstance(brand, dict):
                        brand = brand.get("name")
                    return {
                        **found,
                        "price": offers.get("price") or found.get("price"),
                        "brand": brand,
                    }
        return {}

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

    def extract_photos(self, soup: BeautifulSoup, structured: dict[str, object], base_url: str) -> list[str]:
        seen: set[str] = set()
        photos: list[str] = []

        def add(value: object | None) -> None:
            if not value:
                return
            url = self.safe_join(base_url, value)
            if not url:
                return
            if not re.search(r"\.(jpe?g|png|webp)(\?|$)", url, re.IGNORECASE):
                return
            if any(token in url.lower() for token in ("/common/", "logo", "placeholder", "comingsoon")):
                return
            if url not in seen:
                seen.add(url)
                photos.append(url)

        image_value = structured.get("image")
        if isinstance(image_value, list):
            for item in image_value:
                add(item.get("url") if isinstance(item, dict) else item)
        elif isinstance(image_value, dict):
            add(image_value.get("url"))
        else:
            add(image_value)
        add(self.meta_content(soup, "og:image"))
        for image in soup.select("img[src], img[data-src], img[data-lazy-src]"):
            add(image.get("src") or image.get("data-src") or image.get("data-lazy-src"))
        return photos[:24]

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


def listing_to_dict(listing: Listing) -> dict[str, object]:
    return asdict(listing)
