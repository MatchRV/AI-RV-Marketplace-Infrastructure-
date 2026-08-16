from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass(frozen=True)
class Dealer:
    name: str
    city: str
    url: str

    @property
    def domain(self) -> str:
        from urllib.parse import urlparse

        host = urlparse(self.url).netloc.lower()
        return host.removeprefix("www.")


@dataclass
class Listing:
    dealer_name: str
    dealer_domain: str
    dealer_location: str | None
    source_url: str
    title: str
    rv_type: str | None
    condition: str | None
    year: int | None
    manufacturer: str | None
    brand: str | None
    model: str | None
    floorplan: str | None
    price: int | None
    vin: str | None = None
    stock_number: str | None = None
    description: str | None = None
    photos: list[str] = field(default_factory=list)
    specs: dict[str, Any] = field(default_factory=dict)
    first_seen_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_seen_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def has_required_media(self) -> bool:
        # Photo-exclusion rule: listings with zero usable photos never enter sync.
        return any(p.startswith("http") for p in self.photos)

    def has_required_core_fields(self) -> bool:
        return bool(self.source_url and self.title and self.price and self.year and self.manufacturer)
