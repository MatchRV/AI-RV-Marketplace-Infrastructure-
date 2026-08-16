from __future__ import annotations

import hashlib
import re
from urllib.parse import urlparse

from .models import Listing

# All RV types use unit-level identity (VIN / stock number / source URL).
# Collapsing same-model units from one dealer loses real inventory — two units
# of the same floor plan can have different options, prices, and VINs.
DEDUPE_TYPES: set[str] = set()


def clean_text(value: object | None) -> str | None:
    if value is None:
        return None
    text = re.sub(r"\s+", " ", str(value)).strip()
    return text or None


def slug_text(value: object | None) -> str:
    text = clean_text(value) or ""
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text or "unknown"


def parse_int(value: object | None) -> int | None:
    if value is None:
        return None
    match = re.search(r"-?\d[\d,]*", str(value))
    if not match:
        return None
    try:
        return int(match.group(0).replace(",", ""))
    except ValueError:
        return None


def parse_price(value: object | None) -> int | None:
    price = parse_int(value)
    if price is None or price < 1000 or price > 2_000_000:
        return None
    return price


def normalize_type(value: object | None) -> str | None:
    if not value:
        return None
    text = str(value).lower().strip()
    normalized = text.replace("-", "_").replace(" ", "_")
    if normalized in {
        "toy_hauler",
        "fifth_wheel",
        "travel_trailer",
        "class_a",
        "class_b",
        "class_c",
        "truck_camper",
        "popup_camper",
    }:
        return normalized
    text = text.replace("_", " ").replace("-", " ")
    if "toy hauler" in text:
        return "toy_hauler"
    if "fifth wheel" in text or "5th wheel" in text or "destination trailer" in text:
        return "fifth_wheel"
    if "travel trailer" in text or text.strip() == "destination":
        return "travel_trailer"
    if "class a" in text or "diesel pusher" in text:
        return "class_a"
    if "class b+" in text or "class b plus" in text or "class b" in text:
        return "class_b"
    if "class c" in text or "super c" in text:
        return "class_c"
    if "truck camper" in text:
        return "truck_camper"
    if "popup" in text or "pop-up" in text or "pop up" in text or "tent trailer" in text:
        return "popup_camper"
    return None


def infer_type_from_text(*values: object | None) -> str | None:
    return normalize_type(" ".join(str(v) for v in values if v))


def dealer_domain(url: str) -> str:
    host = urlparse(url).netloc.lower()
    return host.removeprefix("www.")


def build_listing_identity(listing: Listing) -> str:
    """Return the stable sync identity for a listing.

    Deduplication rule:
    - Class C, fifth wheels, and travel trailers dedupe within one dealer by
      year + manufacturer + brand + model + floorplan.
    - Every other category keeps every unit, using VIN/stock/source URL as the
      unit identity so Class A, Class B, toy haulers, etc. are not collapsed.
    """
    rv_type = normalize_type(listing.rv_type)
    if rv_type in DEDUPE_TYPES:
        parts = [
            listing.dealer_domain,
            rv_type,
            listing.year,
            listing.manufacturer,
            listing.brand,
            listing.model,
            listing.floorplan,
        ]
        return "dedupe:" + "|".join(slug_text(p) for p in parts)

    unit_id = listing.vin or listing.stock_number or listing.source_url
    if not unit_id:
        digest = hashlib.sha256(
            f"{listing.title}|{listing.price}|{listing.dealer_domain}".encode("utf-8")
        ).hexdigest()[:16]
        unit_id = f"generated:{digest}"
    return "unit:" + "|".join([slug_text(listing.dealer_domain), slug_text(rv_type), slug_text(unit_id)])


def parse_title_parts(title: str) -> dict[str, object | None]:
    cleaned = clean_text(title) or ""
    year = parse_int(cleaned[:4])
    rest = re.sub(r"^\d{4}\s+", "", cleaned)
    tokens = rest.split()
    manufacturer = tokens[0] if tokens else None
    floorplan = None
    for token in reversed(tokens):
        if re.search(r"\d", token) and len(token) >= 3:
            floorplan = token.strip(",")
            break
    model = " ".join(tokens[1:]) if len(tokens) > 1 else None
    return {
        "year": year,
        "manufacturer": manufacturer,
        "brand": manufacturer,
        "model": model,
        "floorplan": floorplan,
    }
