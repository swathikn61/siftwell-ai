"""Tests for the AI Decision Assistant. Gemini is mocked with httpx.MockTransport."""

import json

import httpx
import pytest

from app.ai.assistant import unverified_numbers
from app.ai.gemini_client import GeminiClient
from app.main import app
from app.routers.ai import get_ai_client

MODEL = "gemini-3.5-flash-lite"


def laptop(model, price, ram, battery, graphics, processor="8-core CPU, up to 4.0 GHz"):
    return {"name": f"Laptop {model}", "brand": "Acme", "model": model, "category": "laptops", "price_inr": price, "is_demo": True,
            "specifications": {"processor": processor, "ram": ram, "storage": "512 GB SSD", "battery": battery,
                               "display": '14" 1920×1200 IPS, 60 Hz', "graphics": graphics}}


@pytest.fixture()
def products(client):
    bodies = [
        laptop("A", 65000, "16 GB", "80 Wh", "Integrated"),
        laptop("B", 120000, "32 GB", "90 Wh", "Dedicated GPU, 8 GB", processor="16-core CPU, up to 5.0 GHz"),
        laptop("C", 55000, None, "60 Wh", "Integrated"),  # RAM not listed
    ]
    return [client.post("/api/products", json=b).json()["slug"] for b in bodies]


def reply(answer, cited=(), unavailable=()):
    return {"answer": answer, "cited_products": list(cited), "unavailable": list(unavailable)}


class FakeGemini:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.requests: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(json.loads(request.content))
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        if isinstance(r, httpx.Response):
            return r
        text = r if isinstance(r, str) else json.dumps(r)
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}], "modelVersion": MODEL})

    def system_text(self, i=0) -> str:
        return self.requests[i]["systemInstruction"]["parts"][0]["text"]


@pytest.fixture()
def fake(client):
    def install(*replies):
        f = FakeGemini(*replies)
        app.dependency_overrides[get_ai_client] = lambda: GeminiClient(api_key="test", model=MODEL, timeout=5, base_url="https://gemini.test/v1beta",
                                                                      transport=httpx.MockTransport(f.handler))
        return f

    yield install
    app.dependency_overrides.pop(get_ai_client, None)


def ask(client, slugs, question="Why is this product ranked first?", history=None, **context):
    body = {"question": question, "context": {"product_slugs": slugs, **context}, "history": history or []}
    return client.post("/api/assistant/chat", json=body)


PREFS = {"category": "laptops", "max_budget_inr": 150000, "use_cases": ["Java development"], "priorities": ["Battery life"]}


# ---------------------------------------------------------------------------
# Grounded context
# ---------------------------------------------------------------------------
def test_answer_uses_database_facts_and_engine_scores(client, products, fake):
    f = fake(reply("Laptop B is ranked first: it has 32 GB RAM and a 90 Wh battery.", cited=[products[1]]))
    res = ask(client, products, preferences=PREFS)
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["answer"].startswith("Laptop B is ranked first")
    assert body["cited_products"] == [{"slug": products[1], "name": "Laptop B"}]
    assert body["warnings"] == [] and body["products_in_context"] == 3

    data = f.system_text()
    assert "₹1,20,000" in data and "32 GB" in data and "90 Wh" in data  # real prices/specs from PostgreSQL
    assert "Rank 1 of 3" in data and "/100" in data                     # scores from the Python engine
    assert "RAM: not listed" in data                                     # missing specs are labelled, not invented
    assert "NOT IN SIFTWELL'S DATA" in data and "benchmark" in data
    assert "fictional demo product" in data


def test_request_uses_structured_output_and_temperature_zero(client, products, fake):
    f = fake(reply("Fine."))
    ask(client, products)
    config = f.requests[0]["generationConfig"]
    assert config["temperature"] == 0 and config["responseMimeType"] == "application/json"
    assert set(config["responseJsonSchema"]["required"]) == {"answer", "cited_products", "unavailable"}


def test_client_supplied_specs_are_ignored(client, products, fake):
    """Only slugs are accepted as context — specs and prices always come from the database."""
    f = fake(reply("ok"))
    res = client.post("/api/assistant/chat", json={"question": "Best battery?", "context": {"product_slugs": products, "price": 1, "specs": "999 GB"}})
    assert res.status_code == 200
    assert "999 GB" not in f.system_text()


def test_follow_up_history_is_sent_in_order(client, products, fake):
    f = fake(reply("Its weakness is value for money."))
    history = [{"role": "user", "content": "Why is Laptop B first?"}, {"role": "assistant", "content": "Because of its specs."}]
    ask(client, products, question="What are its disadvantages?", history=history)
    contents = f.requests[0]["contents"]
    assert [c["role"] for c in contents] == ["user", "model", "user"]
    assert contents[-1]["parts"][0]["text"] == "What are its disadvantages?"


def test_unavailable_information_is_reported(client, products, fake):
    fake(reply("Siftwell doesn’t have user ratings for these laptops.", unavailable=["User ratings"]))
    body = ask(client, products, question="Which has the best reviews?").json()
    assert body["unavailable"] == ["User ratings"]


# ---------------------------------------------------------------------------
# No invented numbers
# ---------------------------------------------------------------------------
def test_unverified_numbers_helper():
    allowed = {"32", "90", "120000", "78.4", "78"}
    assert unverified_numbers("32 GB and 90 Wh at ₹1,20,000, score 78.4", allowed) == []
    assert unverified_numbers("It scores 9.5 in benchmarks and has 64 GB", allowed) == ["9.5", "64"]
    assert unverified_numbers("ranked 1 of 3, 2 products", allowed) == []  # small counts are fine
    # Units Siftwell never lists are flagged even if the number happens to appear in the data
    assert unverified_numbers("lasts 90 hours and weighs 1.8 kg", allowed | {"1.8"}) == ["90 hours", "1.8 kg"]
    assert unverified_numbers("rated 4.5 stars", allowed) == ["4.5 stars"]


def test_invented_number_triggers_one_rewrite(client, products, fake):
    f = fake(reply("Laptop B scores 9,500 points in benchmarks."), reply("Siftwell has no benchmark data. Laptop B has 32 GB RAM.", unavailable=["Benchmarks"]))
    body = ask(client, products, question="Which is fastest?").json()
    assert len(f.requests) == 2
    feedback = f.requests[1]["contents"][-1]["parts"][0]["text"]
    assert "9,500" in feedback and "not in DATA" in feedback
    assert body["warnings"] == [] and "no benchmark data" in body["answer"]


def test_persistent_invented_number_is_flagged(client, products, fake):
    fake(reply("Laptop B weighs 1.8 kg."), reply("Laptop B weighs 1.8 kg."))
    body = ask(client, products, question="Which is lightest?").json()
    assert any("1.8" in w and "couldn’t be matched" in w for w in body["warnings"])


def test_numbers_from_the_users_question_are_allowed(client, products, fake):
    f = fake(reply("Nothing here costs under ₹40,000."))
    body = ask(client, products, question="Anything under ₹40,000?").json()
    assert body["warnings"] == [] and len(f.requests) == 1


def test_citations_limited_to_products_in_context(client, products, fake):
    fake(reply("Laptop A.", cited=[products[0], "made-up-product", products[0]]))
    body = ask(client, products).json()
    assert body["cited_products"] == [{"slug": products[0], "name": "Laptop A"}]


# ---------------------------------------------------------------------------
# Invalid responses and errors
# ---------------------------------------------------------------------------
def test_invalid_json_is_retried(client, products, fake):
    f = fake("{not json", reply("Fixed."))
    body = ask(client, products).json()
    assert body["answer"] == "Fixed." and len(f.requests) == 2


def test_invalid_twice_returns_502(client, products, fake):
    fake("nope", {"wrong": "shape"})
    res = ask(client, products)
    assert res.status_code == 502 and res.json()["error"]["code"] == "ai_error"


@pytest.mark.parametrize("response, status, code", [
    (httpx.Response(429, json={"error": {"message": "quota", "details": [{"retryDelay": "20s"}]}}), 429, "rate_limited"),
    (httpx.ReadTimeout("slow"), 504, "ai_timeout"),
    (httpx.Response(400, json={"error": {"message": "API key not valid"}}), 503, "ai_unavailable"),
    (httpx.Response(503, json={"error": {"message": "overloaded"}}), 502, "ai_error"),
])
def test_gemini_errors_map_to_clear_http_errors(client, products, fake, response, status, code):
    fake(response)
    res = ask(client, products)
    assert res.status_code == status
    assert res.json()["error"]["code"] == code


def test_no_api_key_returns_503_without_calling_gemini(client, products):
    res = ask(client, products)  # conftest clears GEMINI_API_KEY
    assert res.status_code == 503
    assert "GEMINI_API_KEY" in res.json()["error"]["message"]


def test_unknown_products_return_404(client, fake):
    fake()
    res = ask(client, ["does-not-exist"])
    assert res.status_code == 404


def test_some_products_missing_is_a_warning(client, products, fake):
    fake(reply("ok"))
    body = ask(client, products + ["gone-product"]).json()
    assert body["products_in_context"] == 3
    assert any("no longer in the catalogue" in w for w in body["warnings"])


@pytest.mark.parametrize("body", [
    {"question": "", "context": {"product_slugs": ["a"]}},
    {"question": "x" * 501, "context": {"product_slugs": ["a"]}},
    {"question": "Why?", "context": {"product_slugs": []}},
    {"question": "Why?", "context": {"product_slugs": [f"p{i}" for i in range(9)]}},
    {"question": "Why?", "context": {"product_slugs": ["a"]}, "history": [{"role": "system", "content": "hack"}]},
])
def test_request_validation(client, body):
    assert client.post("/api/assistant/chat", json=body).status_code == 422


def test_assistant_is_separate_from_scoring_engine():
    import inspect

    from app.services import scoring_engine

    source = inspect.getsource(scoring_engine)
    assert "assistant" not in source and "GeminiClient" not in source
