"""
Tests for AI preference extraction. The Gemini API is faked with
httpx.MockTransport, so these tests never make real API calls.
"""

import json

import httpx
import pytest

from app.ai import rules
from app.ai.gemini_client import GeminiClient
from app.main import app
from app.routers.ai import get_ai_client

EXAMPLE = "I need a laptop under ₹70,000 for Java development, college work and occasional gaming. Battery life is important."
TEST_KEY = "test-key-not-real"
MODEL = "gemini-3.5-flash-lite"

GOOD_REPLY = {
    "category": "laptops",
    "min_budget_inr": None,
    "max_budget_inr": 70000,
    "use_cases": ["Java development", "college work", "occasional gaming"],
    "priorities": ["Battery life"],
    "hardware_preferences": [
        {"spec": "ram", "preference": "At least 16 GB", "reason": "IDEs and multitasking"},
        {"spec": "graphics", "preference": "Entry-level dedicated graphics", "reason": "Occasional gaming"},
    ],
    "brands": [],
}


def gemini_payload(content, finish="STOP") -> dict:
    text = content if isinstance(content, str) else json.dumps(content)
    return {
        "candidates": [{"content": {"role": "model", "parts": [{"text": text}]}, "finishReason": finish}],
        "modelVersion": MODEL,
    }


class FakeGemini:
    """Returns queued replies for generateContent and records the requests."""

    def __init__(self, *replies):
        self.replies = list(replies)
        self.requests: list[httpx.Request] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.method == "GET":  # status check: models.get
            return httpx.Response(200, json={"name": f"models/{MODEL}", "supportedGenerationMethods": ["generateContent", "countTokens"]})
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, httpx.Response):
            return reply
        return httpx.Response(200, json=gemini_payload(reply))

    def body(self, i: int) -> dict:
        return json.loads(self.requests[i].content)


def make_client(handler, api_key=TEST_KEY) -> GeminiClient:
    return GeminiClient(api_key=api_key, model=MODEL, timeout=5, base_url="https://gemini.test/v1beta",
                        transport=httpx.MockTransport(handler))


@pytest.fixture()
def fake(client):
    """Install a fake Gemini for the API. Use: fake(reply1, reply2, ...)."""

    def install(*replies):
        f = FakeGemini(*replies)
        app.dependency_overrides[get_ai_client] = lambda: make_client(f.handler)
        return f

    yield install
    app.dependency_overrides.pop(get_ai_client, None)


def extract(client, query=EXAMPLE):
    res = client.post("/api/ai/preferences", json={"query": query})
    assert res.status_code == 200, res.json()
    return res.json()


# ---------------------------------------------------------------------------
# Rule parser (also used to check the AI)
# ---------------------------------------------------------------------------
def test_rules_parse_example():
    r = rules.parse(EXAMPLE)
    assert r.category == "laptops"
    assert r.max_budget_inr == 70000
    assert "Programming" in r.use_cases and "College work" in r.use_cases and "Gaming" in r.use_cases
    assert r.priorities == ["Battery life"]


@pytest.mark.parametrize("text, expected", [
    ("phone under 50k", (None, 50000)),
    ("laptop between ₹40,000 and ₹80,000", (40000, 80000)),
    ("budget of 1.5 lakh", (None, 150000)),
    ("above ₹60,000 phone", (60000, None)),
])
def test_rules_budgets(text, expected):
    r = rules.parse(text)
    assert (r.min_budget_inr, r.max_budget_inr) == expected


# ---------------------------------------------------------------------------
# Successful extraction
# ---------------------------------------------------------------------------
def test_extracts_example(client, fake):
    f = fake(GOOD_REPLY)
    body = extract(client)
    prefs = body["preferences"]
    assert body["source"] == "ai" and body["model"] == MODEL
    assert prefs["category"] == "laptops"
    assert prefs["max_budget_inr"] == 70000
    assert prefs["use_cases"] == ["Java development", "College work", "Occasional gaming"]
    assert prefs["priorities"] == ["Battery life"]
    assert [h["spec"] for h in prefs["hardware_preferences"]] == ["ram", "graphics"]
    assert body["search"] == {"category": "laptops", "min_price": None, "max_price": 70000, "brand": []}
    assert body["warnings"] == []


def test_request_uses_structured_output(client, fake):
    f = fake(GOOD_REPLY)
    extract(client)
    request = f.requests[0]
    assert request.url.path == f"/v1beta/models/{MODEL}:generateContent"
    sent = f.body(0)
    config = sent["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    assert config["responseJsonSchema"]["type"] == "object"
    assert config["temperature"] == 0
    assert "systemInstruction" in sent and sent["contents"][0]["role"] == "user"


def test_api_key_sent_in_header_not_url(client, fake):
    f = fake(GOOD_REPLY)
    extract(client)
    request = f.requests[0]
    assert request.headers["x-goog-api-key"] == TEST_KEY
    assert TEST_KEY not in str(request.url)


def test_api_key_never_in_responses(client, fake):
    fake(httpx.Response(400, json={"error": {"code": 400, "message": "API key not valid. Please pass a valid API key."}}))
    body = client.post("/api/ai/preferences", json={"query": EXAMPLE}).text
    assert TEST_KEY not in body
    assert TEST_KEY not in repr(make_client(lambda r: httpx.Response(200)))


def test_messy_values_are_tidied(client, fake):
    reply = {**GOOD_REPLY, "category": "Laptop", "max_budget_inr": "₹70,000", "use_cases": "Java development",
             "hardware_preferences": [{"spec": "memory", "preference": "16 GB", "reason": ""}, {"spec": "keyboard", "preference": "backlit", "reason": ""}]}
    prefs = extract(client, fake(reply) and EXAMPLE)["preferences"]
    assert prefs["category"] == "laptops"
    assert prefs["max_budget_inr"] == 70000
    assert prefs["use_cases"] == ["Java development"]
    assert [h["spec"] for h in prefs["hardware_preferences"]] == ["ram"]  # unknown spec dropped


# ---------------------------------------------------------------------------
# Invalid AI responses
# ---------------------------------------------------------------------------
def test_malformed_json_is_retried(client, fake):
    f = fake("{not valid json", GOOD_REPLY)
    body = extract(client)
    assert body["source"] == "ai"
    assert len(f.requests) == 2
    assert any("asked again" in w for w in body["warnings"])


def test_invalid_values_are_retried_with_feedback(client, fake):
    bad = {**GOOD_REPLY, "max_budget_inr": 999_999_999}  # above ₹1 crore -> fails validation
    f = fake(bad, GOOD_REPLY)
    body = extract(client)
    assert body["source"] == "ai" and body["preferences"]["max_budget_inr"] == 70000
    retry = f.body(1)["contents"]
    assert [c["role"] for c in retry] == ["user", "model", "user"]  # earlier reply sent back as the model's turn
    assert "problems" in retry[-1]["parts"][0]["text"]


def test_falls_back_to_rules_after_two_bad_replies(client, fake):
    fake("nope", "still nope")
    body = extract(client)
    assert body["source"] == "rules" and body["model"] is None
    assert body["preferences"]["category"] == "laptops" and body["preferences"]["max_budget_inr"] == 70000
    assert any("basic text matching" in w for w in body["warnings"])


def test_cut_off_reply_is_handled(client, fake):
    truncated = httpx.Response(200, json=gemini_payload('{"category": "lap', finish="MAX_TOKENS"))
    body = extract(client, fake(truncated, truncated) and EXAMPLE)
    assert body["source"] == "rules"
    assert any("cut off" in w for w in body["warnings"])


def test_empty_candidates_handled(client, fake):
    empty = httpx.Response(200, json={"candidates": []})
    assert extract(client, fake(empty, empty) and EXAMPLE)["source"] == "rules"


def test_blocked_reply_is_not_retried(client, fake):
    blocked = httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}})
    f = fake(blocked)
    body = extract(client)
    assert body["source"] == "rules" and len(f.requests) == 1
    assert any("declined" in w for w in body["warnings"])


def test_reply_that_is_not_an_object(client, fake):
    fake([1, 2, 3], ["still a list"])
    assert extract(client)["source"] == "rules"


# ---------------------------------------------------------------------------
# Nothing invented
# ---------------------------------------------------------------------------
def test_made_up_budget_is_replaced(client, fake):
    fake({**GOOD_REPLY, "max_budget_inr": 85000})
    body = extract(client)
    assert body["preferences"]["max_budget_inr"] == 70000
    assert any("isn’t in your request" in w for w in body["warnings"])


def test_budget_not_in_request_is_removed(client, fake):
    fake({**GOOD_REPLY, "max_budget_inr": 60000})
    body = extract(client, "Laptop for Java development")
    assert body["preferences"]["max_budget_inr"] is None


def test_invented_brand_removed_but_named_brand_kept(client, fake):
    client.post("/api/products", json={"name": "Aurora Book", "brand": "Northwind", "model": "AB1", "category": "laptops", "price_inr": 60000, "is_demo": True})
    fake({**GOOD_REPLY, "brands": ["Dell", "Northwind"]})
    body = extract(client, "Northwind laptop under ₹70,000")
    assert body["preferences"]["brands"] == ["Northwind"]
    assert any("Dell" in w for w in body["warnings"])


def test_named_brand_added_when_ai_misses_it(client, fake):
    client.post("/api/products", json={"name": "Aurora Book", "brand": "Northwind", "model": "AB1", "category": "laptops", "price_inr": 60000, "is_demo": True})
    fake({**GOOD_REPLY, "brands": []})
    assert extract(client, "I like Northwind laptops under 70k")["search"]["brand"] == ["Northwind"]


def test_specific_hardware_suggestions_removed(client, fake):
    reply = {**GOOD_REPLY, "hardware_preferences": [
        {"spec": "processor", "preference": "Intel Core i7 or Ryzen 7", "reason": "fast"},
        {"spec": "graphics", "preference": "RTX 4050", "reason": "gaming"},
        {"spec": "ram", "preference": "At least 16 GB", "reason": "multitasking"},
    ]}
    body = extract(client, fake(reply) and EXAMPLE)
    assert [h["spec"] for h in body["preferences"]["hardware_preferences"]] == ["ram"]
    assert sum("named specific hardware" in w for w in body["warnings"]) == 2


def test_explicit_category_word_wins(client, fake):
    fake({**GOOD_REPLY, "category": "smartphones"})
    body = extract(client)
    assert body["preferences"]["category"] == "laptops"


# ---------------------------------------------------------------------------
# API errors, timeouts and rate limits
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("error, text", [
    (httpx.ConnectError("refused"), "Can’t reach the Gemini API"),
    (httpx.ReadTimeout("slow"), "didn’t answer within"),
])
def test_connection_errors_fall_back_to_rules(client, fake, error, text):
    f = fake(error)
    body = extract(client)
    assert body["source"] == "rules"
    assert len(f.requests) == 1  # no retry for connection problems
    assert any(text in w for w in body["warnings"])
    assert body["preferences"]["max_budget_inr"] == 70000


def test_rate_limit_falls_back_with_retry_hint(client, fake):
    limited = httpx.Response(429, json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "Quota exceeded",
                                                  "details": [{"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "17s"}]}})
    f = fake(limited)
    body = extract(client)
    assert body["source"] == "rules" and len(f.requests) == 1  # don't hammer a rate-limited API
    assert any("rate limit" in w and "18 seconds" in w for w in body["warnings"])


def test_server_overload_is_retried_once(client, fake):
    f = fake(httpx.Response(503, json={"error": {"code": 503, "message": "The model is overloaded"}}), GOOD_REPLY)
    body = extract(client)
    assert body["source"] == "ai" and len(f.requests) == 2


def test_server_overload_twice_falls_back(client, fake):
    overloaded = httpx.Response(503, json={"error": {"code": 503, "message": "overloaded"}})
    body = extract(client, fake(overloaded, overloaded) and EXAMPLE)
    assert body["source"] == "rules"
    assert any("temporarily unavailable" in w for w in body["warnings"])


@pytest.mark.parametrize("status, message, text", [
    (400, "API key not valid. Please pass a valid API key.", "key was rejected"),
    (403, "Permission denied", "key was rejected"),
    (404, "models/x is not found", "model wasn’t found"),
])
def test_api_errors_fall_back(client, fake, status, message, text):
    fake(httpx.Response(status, json={"error": {"code": status, "message": message}}))
    body = extract(client)
    assert body["source"] == "rules"
    assert any(text in w for w in body["warnings"])


def test_missing_api_key_falls_back_without_calling_api(client):
    calls = []
    app.dependency_overrides[get_ai_client] = lambda: make_client(lambda r: calls.append(r) or httpx.Response(200), api_key="")
    try:
        body = extract(client)
    finally:
        app.dependency_overrides.pop(get_ai_client, None)
    assert body["source"] == "rules" and calls == []
    assert any("GEMINI_API_KEY" in w for w in body["warnings"])


def test_default_client_without_key_never_calls_api(client):
    # conftest sets GEMINI_API_KEY="" so the real client is unconfigured in tests
    body = extract(client)
    assert body["source"] == "rules"


def test_status_endpoint(client, fake):
    fake()
    body = client.get("/api/ai/status").json()
    assert body == {"provider": "gemini", "available": True, "configured": True, "model": MODEL, "message": "Ready"}


def test_status_model_without_generate_content(client):
    app.dependency_overrides[get_ai_client] = lambda: make_client(lambda r: httpx.Response(200, json={"name": "models/x", "supportedGenerationMethods": ["embedContent"]}))
    try:
        body = client.get("/api/ai/status").json()
    finally:
        app.dependency_overrides.pop(get_ai_client, None)
    assert body["available"] is False and "doesn’t support generateContent" in body["message"]


def test_status_without_key(client):
    body = client.get("/api/ai/status").json()
    assert body["available"] is False and body["configured"] is False
    assert "GEMINI_API_KEY" in body["message"]


def test_status_with_rejected_key(client):
    app.dependency_overrides[get_ai_client] = lambda: make_client(lambda r: httpx.Response(400, json={"error": {"message": "API key not valid"}}))
    try:
        body = client.get("/api/ai/status").json()
    finally:
        app.dependency_overrides.pop(get_ai_client, None)
    assert body["available"] is False and "rejected" in body["message"]


# ---------------------------------------------------------------------------
# Request validation and user edits
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("query", ["", "  ", "x" * 501])
def test_query_validation(client, query):
    assert client.post("/api/ai/preferences", json={"query": query}).status_code == 422


def test_user_edits_are_validated(client):
    client.post("/api/products", json={"name": "Lumen", "brand": "Orbis", "model": "L1", "category": "smartphones", "price_inr": 30000, "is_demo": True})
    edited = {"category": "smartphones", "min_budget_inr": 20000, "max_budget_inr": 40000, "use_cases": [" camera ", "camera"],
              "priorities": ["Battery life"], "hardware_preferences": [], "brands": ["Orbis"]}
    body = client.post("/api/ai/preferences/validate", json=edited).json()
    assert body["source"] == "user"
    assert body["preferences"]["use_cases"] == ["Camera"]  # trimmed and de-duplicated
    assert body["search"] == {"category": "smartphones", "min_price": 20000, "max_price": 40000, "brand": ["Orbis"]}


@pytest.mark.parametrize("bad", [
    {"category": "tablets"},
    {"min_budget_inr": 50000, "max_budget_inr": 10000},
    {"max_budget_inr": -5},
    {"hardware_preferences": [{"spec": "keyboard", "preference": "backlit"}]},
])
def test_invalid_user_edits_rejected(client, bad):
    res = client.post("/api/ai/preferences/validate", json=bad)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "validation_error"


# ---------------------------------------------------------------------------
# Latency controls: deadline-aware retries, diagnostics, request settings
# ---------------------------------------------------------------------------
def test_slow_server_error_is_not_retried(client, fake, monkeypatch):
    # Treat every failure as "slow": a 503 that took a long time must not be retried
    monkeypatch.setattr("app.ai.preference_extractor.FAST_FAILURE_SECONDS", 0.0)
    f = fake(httpx.Response(503, json={"error": {"message": "overloaded"}}), GOOD_REPLY)
    body = extract(client)
    assert body["source"] == "rules" and len(f.requests) == 1


def test_no_retry_when_time_budget_is_used_up(client, fake, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "gemini_total_timeout_seconds", 1.0)  # less than MIN_RETRY_SECONDS
    f = fake("{broken", GOOD_REPLY)
    body = extract(client)
    assert body["source"] == "rules" and len(f.requests) == 1


def test_diagnostics_report_tokens_and_timing(client, fake):
    reply = httpx.Response(200, json={
        **gemini_payload(GOOD_REPLY),
        "usageMetadata": {"promptTokenCount": 301, "candidatesTokenCount": 120, "thoughtsTokenCount": 0, "totalTokenCount": 421},
    }, headers={"server-timing": "gfet4t7; dur=1234"})
    fake(reply)
    d = extract(client)["diagnostics"]
    assert d["attempts"] == 1
    assert (d["prompt_tokens"], d["output_tokens"], d["thought_tokens"]) == (301, 120, 0)
    assert d["server_ms"] == 1234
    assert d["api_total_ms"] >= 0 and d["extraction_total_ms"] >= d["api_total_ms"]
    assert d["thinking_level"] == "minimal"


def test_no_diagnostics_when_ai_not_called(client):
    assert extract(client)["diagnostics"] is None  # no key -> rules only


def test_request_sets_minimal_thinking_and_output_cap(client, fake):
    f = fake(GOOD_REPLY)
    extract(client)
    config = f.body(0)["generationConfig"]
    assert config["thinkingConfig"] == {"thinkingLevel": "minimal"}
    assert config["maxOutputTokens"] <= 1024
    assert config["responseJsonSchema"]["properties"]["hardware_preferences"]["maxItems"] == 3


def test_thinking_budget_used_for_gemini_2_5():
    client = GeminiClient(api_key="k", model="gemini-2.5-flash-lite", thinking_level="minimal")
    body = client.build_body([{"role": "user", "content": "hi"}], {"type": "object"})
    assert body["generationConfig"]["thinkingConfig"] == {"thinkingBudget": 0}
