"""Offline tests for openai_citation_runner.py.

Run from tools/ai-visibility-audit:
    python test_openai_citation_runner.py
"""

import json
import os
import pathlib
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import openai_citation_runner as R

FAILURES = []


def check(name, condition, detail=""):
    print(("PASS " if condition else "FAIL ") + name + (f" - {detail}" if detail and not condition else ""))
    if not condition:
        FAILURES.append(name)


SAMPLE_RESPONSE = {
    "id": "resp_test_123",
    "model": "gpt-5.6-sol",
    "output": [
        {
            "type": "web_search_call",
            "id": "ws_1",
            "action": {
                "type": "search",
                "query": "best rv dealers Tacoma WA",
                "sources": [
                    {"type": "url", "url": "https://example-rv.com/", "title": "Example RV"},
                    {"type": "url", "url": "https://example-rv.com/inventory/123", "title": "Unit 123"},
                ],
            },
        },
        {
            "type": "message",
            "role": "assistant",
            "content": [
                {
                    "type": "output_text",
                    "text": "Example RV appears in current search results.",
                    "annotations": [
                        {
                            "type": "url_citation",
                            "url": "https://example-rv.com/",
                            "title": "Example RV",
                            "start_index": 0,
                            "end_index": 10,
                        }
                    ],
                }
            ],
        },
    ],
}


def main():
    cases = R.dealer_prompts("Example RV", "Tacoma", "WA", "example-rv.com")
    check("ten-prompts", len(cases) == 10, len(cases))
    check("branded-flag", cases[2].is_branded is True, cases[2])
    check("nonbranded-count", sum(1 for c in cases if not c.is_branded) == 9)
    check("existing-wording", cases[0].prompt == "Best RV dealers near Tacoma, WA", cases[0].prompt)

    payload = R.request_payload(cases[0], "gpt-5.6")
    tool = payload["tools"][0]
    check("responses-api-tool", tool["type"] == "web_search")
    check("live-web-access", tool["external_web_access"] is True, tool)
    check("web-search-required", payload["tool_choice"] == "required", payload["tool_choice"])
    check("approx-location", tool["user_location"] == {
        "type": "approximate", "country": "US", "city": "Tacoma", "region": "WA"
    }, tool["user_location"])
    check("sources-included", payload["include"] == ["web_search_call.action.sources"])
    check("no-target-steering", "Example RV" not in payload["instructions"], payload["instructions"])
    check("prompt-is-user-query", payload["input"] == "Best RV dealers near Tacoma, WA")

    text = R.output_text(SAMPLE_RESPONSE)
    check("extract-output-text", text == "Example RV appears in current search results.", text)

    citations = R.extract_citations(SAMPLE_RESPONSE)
    check("citation-url", citations == [{"url": "https://example-rv.com/", "title": "Example RV"}], citations)

    queries, sources = R.extract_search_metadata(SAMPLE_RESPONSE)
    check("search-query", queries == ["best rv dealers Tacoma WA"], queries)
    check("search-sources", len(sources) == 2 and sources[1]["url"].endswith("/inventory/123"), sources)

    obs = R.normalize_observation(
        case=cases[0],
        model_requested="gpt-5.6",
        status_code=200,
        response=SAMPLE_RESPONSE,
        raw_file="raw/openai/P01.json",
        request_started_at="2026-09-25T20:00:00+00:00",
        request_finished_at="2026-09-25T20:00:01+00:00",
    )
    check("success-status", obs["status"] == "success", obs["status"])
    check("raw-pointer", obs["raw_response_file"] == "raw/openai/P01.json")
    check("model-returned", obs["model_returned"] == "gpt-5.6-sol")

    no_search = {"id": "r", "output": [{"type": "message", "content": [{"type": "output_text", "text": "answer"}]}]}
    check("no-search-status", R.classify_http_status(200, no_search) == "no_search")
    check("rate-limit-status", R.classify_http_status(429, {"error": {}}) == "rate_limit")
    check("api-error-status", R.classify_http_status(500, {"error": {}}) == "api_error")
    check("parse-error-status", R.classify_http_status(200, None) == "parse_error")

    with tempfile.TemporaryDirectory() as d:
        p = pathlib.Path(d) / "raw.json"
        raw = json.dumps(SAMPLE_RESPONSE, separators=(",", ":")).encode("utf-8")
        R.write_raw_response(p, raw)
        check("raw-byte-preservation", p.read_bytes() == raw)

        rows = [obs]
        R.write_jsonl(pathlib.Path(d) / "observations.jsonl", rows)
        decoded = json.loads((pathlib.Path(d) / "observations.jsonl").read_text(encoding="utf-8"))
        check("jsonl-roundtrip", decoded["prompt_id"] == "P01")

    print(f"FAILURES: {len(FAILURES)}")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
