"""API tests for POST /api/recommendations (filtering, weighted scores, explanations)."""

import pytest


def laptop(model, price, ram, storage, battery, graphics, display='14" 1920×1200 IPS, 60 Hz', processor="8-core CPU, up to 4.0 GHz", brand="Acme"):
    return {"name": f"Laptop {model}", "brand": brand, "model": model, "category": "laptops", "price_inr": price, "is_demo": True,
            "specifications": {"processor": processor, "ram": ram, "storage": storage, "battery": battery, "display": display, "graphics": graphics}}


def phone(model, price, battery, display, brand="Zeta"):
    return {"name": f"Phone {model}", "brand": brand, "model": model, "category": "smartphones", "price_inr": price, "is_demo": True,
            "specifications": {"processor": "Octa-core", "ram": "8 GB", "storage": "128 GB", "battery": battery, "display": display}}


@pytest.fixture()
def catalogue(client):
    items = [
        laptop("A", 65000, "16 GB", "512 GB SSD", "80 Wh", "Integrated", brand="Northwind"),
        laptop("B", 60000, "8 GB", "256 GB SSD", "50 Wh", "Integrated", brand="Kestrel"),
        laptop("C", 69000, "16 GB", "1 TB SSD", "60 Wh", "Dedicated GPU, 4 GB", brand="Ironpeak", processor="12-core CPU, up to 4.8 GHz"),
        laptop("D", 90000, "32 GB", "1 TB SSD", "90 Wh", "Dedicated GPU, 8 GB", brand="Halcyon"),  # over budget
        laptop("E", 55000, None, "512 GB SSD", "70 Wh", "Integrated"),  # RAM not listed
        phone("P1", 30000, "5,000 mAh", '6.5" OLED, 120 Hz'),
        phone("P2", 25000, "4,000 mAh", '6.4" LCD, 90 Hz'),
    ]
    for body in items:
        assert client.post("/api/products", json=body).status_code == 201


JAVA = {
    "category": "laptops", "min_budget_inr": None, "max_budget_inr": 70000,
    "use_cases": ["Java development", "College work", "Gaming"], "priorities": ["Battery life"],
    "hardware_preferences": [
        {"spec": "ram", "preference": "At least 16 GB", "reason": "IDEs"},
        {"spec": "graphics", "preference": "Dedicated graphics", "reason": "gaming"},
    ],
    "brands": [],
}


def recommend(client, prefs, **extra):
    res = client.post("/api/recommendations", json={"preferences": prefs, **extra})
    assert res.status_code == 200, res.json()
    return res.json()


def by_name(body):
    return {i["product"]["name"]: i for i in body["items"]}


def test_filters_by_category_and_budget(client, catalogue):
    body = recommend(client, JAVA)
    names = [i["product"]["name"] for i in body["items"]]
    assert "Laptop D" not in names  # over budget
    assert all(i["product"]["category"]["slug"] == "laptops" for i in body["items"])
    assert body["total"] == 4


def test_scores_out_of_100_ranked_best_first(client, catalogue):
    items = recommend(client, JAVA)["items"]
    scores = [i["score"] for i in items]
    assert all(0 <= s <= 100 for s in scores)
    assert scores == sorted(scores, reverse=True)
    assert [i["rank"] for i in items] == [1, 2, 3, 4]


def test_each_product_explains_its_score(client, catalogue):
    item = recommend(client, JAVA)["items"][0]
    assert [b["criterion"] for b in item["breakdown"]] == ["processor", "ram", "battery", "storage", "display", "value"]
    for b in item["breakdown"]:
        assert b["detail"]
        assert (b["score"] is None) == (b["contribution"] is None)
    assert item["summary"].startswith(f"{item['score']:g}/100")
    assert isinstance(item["strengths"], list) and isinstance(item["weaknesses"], list)


def test_missing_ram_not_invented(client, catalogue):
    e = by_name(recommend(client, JAVA))["Laptop E"]
    ram = next(b for b in e["breakdown"] if b["criterion"] == "ram")
    assert ram["score"] is None and ram["value"] is None and "not listed" in ram["detail"]
    assert e["coverage"] < 100
    req = next(r for r in e["requirements"] if r["spec"] == "ram")
    assert req["met"] is None


def test_weights_report_usage_adjustments(client, catalogue):
    body = recommend(client, JAVA)
    weights = {w["criterion"]: w for w in body["weights"]}
    assert round(sum(w["effective"] for w in body["weights"]), 0) == 100
    assert weights["ram"]["multiplier"] > 1 and weights["battery"]["multiplier"] > 1
    assert any(a["reason"].startswith("Use “Java development”") for a in body["adjustments"])
    assert body["adjust_for_usage"] is True


def test_custom_weights_change_the_ranking(client, catalogue):
    battery_only = {"processor": 0, "ram": 0, "battery": 100, "storage": 0, "display": 0, "value": 0}
    body = recommend(client, JAVA, weights=battery_only, adjust_for_usage=False)
    assert body["items"][0]["product"]["name"] == "Laptop A"  # largest battery within budget (80 Wh)
    assert {w["criterion"]: w["effective"] for w in body["weights"]}["battery"] == 100.0
    assert body["adjustments"] == []


def test_mandatory_requirement_filters_products(client, catalogue):
    prefs = {**JAVA, "hardware_preferences": [{**JAVA["hardware_preferences"][1], "mandatory": True}]}
    body = recommend(client, prefs)
    assert [i["product"]["name"] for i in body["items"]] == ["Laptop C"]
    excluded = {e["name"]: e["reasons"] for e in body["excluded"]}
    assert set(excluded) == {"Laptop A", "Laptop B", "Laptop E"}
    assert "not met" in excluded["Laptop A"][0]


def test_phone_scoring_reports_unscorable_processor(client, catalogue):
    body = recommend(client, {**JAVA, "category": "smartphones", "max_budget_inr": None, "hardware_preferences": []})
    assert {i["product"]["name"] for i in body["items"]} == {"Phone P1", "Phone P2"}
    assert any("Processor couldn’t be scored" in w for w in body["warnings"])
    assert body["items"][0]["product"]["name"] == "Phone P1"  # bigger battery and faster screen


def test_scales_are_published(client, catalogue):
    scales = {(s["category"], s["criterion"]): s["scale"] for s in recommend(client, JAVA)["scales"]}
    assert scales[("laptops", "ram")] == "4–32 GB (log scale)"
    assert "no AI" in recommend(client, JAVA)["method"]


def test_sort_and_pagination(client, catalogue):
    body = recommend(client, JAVA, sort="price_asc", limit=2)
    assert body["total"] == 4 and len(body["items"]) == 2
    assert [float(i["product"]["price_inr"]) for i in body["items"]] == [55000, 60000]


def test_brand_filter_is_case_insensitive_and_canonical(client, catalogue):
    body = recommend(client, {**JAVA, "brands": ["kestrel", "Nonexistent"]})
    assert body["preferences"]["brands"] == ["Kestrel"]
    assert [i["product"]["brand"] for i in body["items"]] == ["Kestrel"]
    assert any("Nonexistent" in w for w in body["warnings"])


@pytest.mark.parametrize("extra", [
    {"weights": {"ram": 150}},
    {"weights": {"ram": -1}},
    {"weights": {"processor": 0, "ram": 0, "battery": 0, "storage": 0, "display": 0, "value": 0}},
    {"weights": {"camera": 10}},
    {"sort": "random"},
])
def test_invalid_requests_rejected(client, catalogue, extra):
    assert client.post("/api/recommendations", json={"preferences": JAVA, **extra}).status_code == 422


@pytest.mark.parametrize("bad", [
    {**JAVA, "min_budget_inr": 80000, "max_budget_inr": 70000},
    {**JAVA, "category": "tablets"},
    {**JAVA, "hardware_preferences": [{"spec": "keyboard", "preference": "backlit"}]},
])
def test_invalid_preferences_rejected_before_filtering(client, catalogue, bad):
    assert client.post("/api/recommendations", json={"preferences": bad}).status_code == 422


def test_validate_endpoint_checks_catalogue(client, catalogue):
    body = client.post("/api/ai/preferences/validate", json={**JAVA, "brands": ["NORTHWIND", "Dell"]}).json()
    assert body["preferences"]["brands"] == ["Northwind"]
    assert any("Dell" in w for w in body["warnings"])


def test_empty_result(client, catalogue):
    body = recommend(client, {**JAVA, "max_budget_inr": 1000})
    assert body["items"] == [] and body["total"] == 0
