#!/usr/bin/env python3
"""MAT-39 OpenAI citation runner.

Runs the existing ten dealer citation prompts through the OpenAI Responses API
with web_search enabled. Each provider response is written to disk verbatim
BEFORE parsing so every normalized observation is traceable to its raw source.

No Gemini/Claude support, scoring, dashboard writes, or scheduling live here.
Those are intentionally out of scope for this first production slice.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any

from audit import CITATION_PROMPT_TEMPLATE

API_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = os.environ.get("MATCHRV_CITATION_MODEL", "gpt-5.6")
TIMEOUT_SECONDS = 90
SLEEP_BETWEEN_CALLS = 1.0

PROMPT_META = [
    ("P01", "dealer_discovery", False),
    ("P02", "inventory_travel_trailer", False),
    ("P03", "branded_reviews", True),
    ("P04", "inventory_fifth_wheel_price", False),
    ("P05", "inventory_sleeping_capacity", False),
    ("P06", "inventory_bunkhouse", False),
    ("P07", "inventory_toy_hauler", False),
    ("P08", "inventory_used", False),
    ("P09", "service", False),
    ("P10", "dealer_discovery_fifth_wheel", False),
]

NEUTRAL_INSTRUCTIONS = (
    "Answer the shopper's question normally using current web information. "
    "Use web search when useful. Do not favor, promote, or steer toward any "
    "specific dealer unless the evidence returned by search supports it. "
    "Do not assume the target dealer should appear. Keep citations attached "
    "to the claims they support."
)


@dataclass
class PromptCase:
    prompt_id: str
    prompt: str
    category: str
    location: str
    target_dealer: str
    target_domain: str
    locale: str
    is_branded: bool


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return cleaned[:80] or "dealer"


def dealer_prompts(
    dealer: str,
    city: str,
    state: str,
    target_domain: str,
    locale: str = "en-US",
) -> list[PromptCase]:
    prompts = [p.format(dealer=dealer, city=city, state=state) for p in CITATION_PROMPT_TEMPLATE]
    if len(prompts) != 10:
        raise ValueError(f"Expected 10 citation prompts, got {len(prompts)}")
    if len(PROMPT_META) != len(prompts):
        raise ValueError("PROMPT_META must stay aligned with CITATION_PROMPT_TEMPLATE")
    location = f"{city}, {state}"
    out: list[PromptCase] = []
    for prompt, (prompt_id, category, is_branded) in zip(prompts, PROMPT_META):
        out.append(
            PromptCase(
                prompt_id=prompt_id,
                prompt=prompt,
                category=category,
                location=location,
                target_dealer=dealer,
                target_domain=target_domain,
                locale=locale,
                is_branded=is_branded,
            )
        )
    return out


def request_payload(case: PromptCase, model: str) -> dict[str, Any]:
    city, _, region = case.location.partition(",")
    region = region.strip()
    return {
        "model": model,
        "instructions": NEUTRAL_INSTRUCTIONS,
        "input": case.prompt,
        "tools": [
            {
                "type": "web_search",
                "external_web_access": True,
                "user_location": {
                    "type": "approximate",
                    "country": "US",
                    "city": city.strip(),
                    "region": region,
                },
            }
        ],
        "tool_choice": "required",
        "include": ["web_search_call.action.sources"],
    }


def http_post_json(url: str, payload: dict[str, Any], api_key: str) -> tuple[int, bytes]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, separators=(",", ":")).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "MatchRVCitationRunner/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
            return int(response.status), response.read()
    except urllib.error.HTTPError as exc:
        return int(exc.code), exc.read()


def write_raw_response(path: pathlib.Path, body: bytes) -> None:
    """Persist provider bytes before JSON parsing.

    Responses from the provider are expected to be JSON, including structured
    errors. We deliberately write the exact bytes returned by the provider.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        f.write(body)
        f.flush()
        os.fsync(f.fileno())


def walk(node: Any):
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk(value)


def output_text(response: dict[str, Any]) -> str:
    # Prefer the SDK-style output_text field when present.
    text = response.get("output_text")
    if isinstance(text, str) and text.strip():
        return text.strip()

    chunks: list[str] = []
    for node in walk(response.get("output", [])):
        if node.get("type") in ("output_text", "text") and isinstance(node.get("text"), str):
            chunks.append(node["text"])
    return "\n".join(x.strip() for x in chunks if x.strip()).strip()


def extract_citations(response: dict[str, Any]) -> list[dict[str, str]]:
    seen: set[tuple[str, str]] = set()
    found: list[dict[str, str]] = []

    for node in walk(response):
        if node.get("type") == "url_citation":
            url = node.get("url")
            title = node.get("title") or ""
            if isinstance(url, str) and url:
                key = (url, str(title))
                if key not in seen:
                    seen.add(key)
                    found.append({"url": url, "title": str(title)})

        annotations = node.get("annotations")
        if isinstance(annotations, list):
            for ann in annotations:
                if not isinstance(ann, dict) or ann.get("type") != "url_citation":
                    continue
                url = ann.get("url")
                title = ann.get("title") or ""
                if isinstance(url, str) and url:
                    key = (url, str(title))
                    if key not in seen:
                        seen.add(key)
                        found.append({"url": url, "title": str(title)})
    return found


def extract_search_metadata(response: dict[str, Any]) -> tuple[list[str], list[dict[str, str]]]:
    queries: list[str] = []
    sources: list[dict[str, str]] = []
    source_seen: set[tuple[str, str]] = set()

    for node in walk(response.get("output", [])):
        if node.get("type") != "web_search_call":
            continue
        action = node.get("action")
        if not isinstance(action, dict):
            continue

        for key in ("query", "search_query"):
            value = action.get(key)
            if isinstance(value, str) and value.strip() and value.strip() not in queries:
                queries.append(value.strip())

        raw_queries = action.get("queries")
        if isinstance(raw_queries, list):
            for q in raw_queries:
                if isinstance(q, str) and q.strip() and q.strip() not in queries:
                    queries.append(q.strip())

        raw_sources = action.get("sources")
        if isinstance(raw_sources, list):
            for src in raw_sources:
                if not isinstance(src, dict):
                    continue
                url = src.get("url")
                title = src.get("title") or ""
                if isinstance(url, str) and url:
                    key = (url, str(title))
                    if key not in source_seen:
                        source_seen.add(key)
                        sources.append({"url": url, "title": str(title)})
    return queries, sources


def classify_http_status(status_code: int, response: dict[str, Any] | None) -> str:
    if status_code == 429:
        return "rate_limit"
    if status_code < 200 or status_code >= 300:
        return "api_error"
    if not isinstance(response, dict):
        return "parse_error"

    text = output_text(response)
    has_search = any(
        isinstance(n, dict) and n.get("type") == "web_search_call"
        for n in walk(response.get("output", []))
    )
    if not text:
        return "empty_response"
    if not has_search:
        return "no_search"
    return "success"


def normalize_observation(
    case: PromptCase,
    model_requested: str,
    status_code: int,
    response: dict[str, Any] | None,
    raw_file: str,
    request_started_at: str,
    request_finished_at: str,
) -> dict[str, Any]:
    status = classify_http_status(status_code, response)
    citations: list[dict[str, str]] = []
    search_queries: list[str] = []
    search_sources: list[dict[str, str]] = []
    response_text = ""
    response_id = ""
    model_returned = ""

    if isinstance(response, dict):
        citations = extract_citations(response)
        search_queries, search_sources = extract_search_metadata(response)
        response_text = output_text(response)
        response_id = str(response.get("id") or "")
        model_returned = str(response.get("model") or "")

    return {
        "prompt_id": case.prompt_id,
        "prompt": case.prompt,
        "category": case.category,
        "location": case.location,
        "target_dealer": case.target_dealer,
        "target_domain": case.target_domain,
        "locale": case.locale,
        "is_branded": case.is_branded,
        "platform": "openai",
        "model_requested": model_requested,
        "model_returned": model_returned,
        "response_id": response_id,
        "tested_at": request_finished_at,
        "request_started_at": request_started_at,
        "status": status,
        "http_status": status_code,
        "response_text": response_text,
        "citation_urls": citations,
        "search_queries": search_queries,
        "search_sources": search_sources,
        "raw_response_file": raw_file,
    }


def write_jsonl(path: pathlib.Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def write_summary_csv(path: pathlib.Path, rows: list[dict[str, Any]]) -> None:
    fields = [
        "prompt_id",
        "prompt",
        "category",
        "location",
        "target_dealer",
        "target_domain",
        "locale",
        "is_branded",
        "platform",
        "model_requested",
        "model_returned",
        "response_id",
        "tested_at",
        "status",
        "http_status",
        "response_text",
        "citation_urls",
        "search_queries",
        "search_sources",
        "raw_response_file",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            flat = dict(row)
            for key in ("citation_urls", "search_queries", "search_sources"):
                flat[key] = json.dumps(flat[key], ensure_ascii=False)
            writer.writerow({k: flat.get(k, "") for k in fields})


def run(args: argparse.Namespace) -> int:
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        print("OPENAI_API_KEY is required.", file=sys.stderr)
        return 2

    cases = dealer_prompts(
        dealer=args.dealer,
        city=args.city,
        state=args.state,
        target_domain=args.domain,
        locale=args.locale,
    )

    started = utc_now()
    run_id = args.run_id or started.strftime("%Y%m%dT%H%M%SZ")
    root = pathlib.Path(args.outdir) / f"{slug(args.dealer)}-{run_id}"
    raw_dir = root / "raw" / "openai"
    observations: list[dict[str, Any]] = []

    manifest = {
        "run_id": run_id,
        "platform": "openai",
        "model": args.model,
        "dealer": args.dealer,
        "city": args.city,
        "state": args.state,
        "target_domain": args.domain,
        "locale": args.locale,
        "started_at": started.isoformat(),
        "prompt_count": len(cases),
        "instructions": NEUTRAL_INSTRUCTIONS,
    }
    root.mkdir(parents=True, exist_ok=True)
    (root / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    for index, case in enumerate(cases, start=1):
        payload = request_payload(case, args.model)
        request_started_at = iso_now()
        status_code, raw_body = http_post_json(API_URL, payload, api_key)
        request_finished_at = iso_now()

        raw_path = raw_dir / f"{case.prompt_id}.json"
        # Requirement: save full provider JSON bytes before any parsing.
        write_raw_response(raw_path, raw_body)

        try:
            response = json.loads(raw_body.decode("utf-8"))
        except Exception:
            response = None

        observation = normalize_observation(
            case=case,
            model_requested=args.model,
            status_code=status_code,
            response=response,
            raw_file=str(raw_path.relative_to(root)).replace("\\", "/"),
            request_started_at=request_started_at,
            request_finished_at=request_finished_at,
        )
        observations.append(observation)
        print(
            f"[{index:02d}/10] {case.prompt_id} {observation['status']} "
            f"citations={len(observation['citation_urls'])} "
            f"searches={len(observation['search_queries'])}"
        )

        # Persist normalized progress after every call without touching raw files.
        write_jsonl(root / "observations.jsonl", observations)
        write_summary_csv(root / "observations.csv", observations)

        if index < len(cases) and args.sleep > 0:
            time.sleep(args.sleep)

    complete = {
        **manifest,
        "finished_at": iso_now(),
        "status_counts": {
            status: sum(1 for row in observations if row["status"] == status)
            for status in sorted({row["status"] for row in observations})
        },
    }
    (root / "manifest.json").write_text(
        json.dumps(complete, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"Wrote citation run to {root}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Run MAT-39 OpenAI citation observations.")
    ap.add_argument("--dealer", required=True, help="Dealer display name")
    ap.add_argument("--city", required=True, help="Dealer/search city")
    ap.add_argument("--state", required=True, help="US state or region, e.g. WA")
    ap.add_argument("--domain", required=True, help="Target dealer domain, e.g. example.com")
    ap.add_argument("--locale", default="en-US")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--outdir", default="citation-runs")
    ap.add_argument("--run-id", default="")
    ap.add_argument("--sleep", type=float, default=SLEEP_BETWEEN_CALLS)
    return ap


def main(argv: list[str] | None = None) -> int:
    return run(build_parser().parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
