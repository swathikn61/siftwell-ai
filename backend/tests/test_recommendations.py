"""Tests for preference-aware ranking (POST /api/recommendations) and edit validation."""

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
        laptop("C", 69000, "16 GB", "1 TB SSD", "60 Wh", "Dedicated GPU, 4 GB", brand="Ironpeak"),
        laptop("D", 90000, "32 GB", "1 TB SSD", "90 Wh", "Dedicated GPU, 8 GB", brand="Halcyon"),  # over budget
        laptop("E", 55000, None, "512 GB SSD", "70 Wh", "Integrated"),  # RAM not listed
        phone("P1", 30000, "5,000 mAh", '6.5" OLED, 120 Hz'),
        phone("P2", 25000, "4,000 mAh", '6.4" LCD, 90 Hz'),
    ]
    for body in items:
        assert client.post("/api/products", json=body).status_code == 201


JAVA_PREFS = {
    "category": "laptops", "min_budget_inr": None, "max_budget_inr": 70000,
    "use_cases": ["Java development", "Gaming"], "priorities": ["Battery life"],
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


def reasons(item):
    return {r["factor"]: (r["effect"], r["text"]) for r in item["reasons"]}


def test_filters_then_ranks_with_explanations(client, catalogue):
    body = recommend(client, JAVA_PREFS)
    names = [i["product"]["name"] for i in body["items"]]
    assert "Laptop D" not in names  # over budget
    assert all(i["product"]["category"]["slug"] == "laptops" for i in body["items"])
    assert names[0] == "Laptop C"  # meets RAM + dedicated graphics
    top = reasons(body["items"][0])
    assert top["hw:ram"] == ("positive", "RAM 16 GB meets “At least 16 GB”")
    assert top["hw:graphics"][0] == "positive"


def test_threshold_miss_and_missing_spec_are_explained(client, catalogue):
    items = {i["product"]["name"]: reasons(i) for i in recommend(client, JAVA_PREFS)["items"]}
    assert items["Laptop B"]["hw:ram"] == ("negative", "RAM 8 GB is below “At least 16 GB”")
    assert items["Laptop E"]["hw:ram"][0] == "unknown"
    assert "not listed" in items["Laptop E"]["hw:ram"][1]


def test_priority_compares_listed_battery_across_results(client, catalogue):
    items = {i["product"]["name"]: reasons(i) for i in recommend(client, JAVA_PREFS)["items"]}
    battery = items["Laptop A"]["priority:battery life"]
    assert battery[0] == "positive" and "80 Wh" in battery[1]  # largest battery within budget
    assert items["Laptop B"]["priority:battery life"][0] == "negative"


def test_ranking_factors_and_not_used_are_reported(client, catalogue):
    body = recommend(client, {**JAVA_PREFS, "priorities": ["Battery life", "Portability"]})
    sources = {f["label"]: f["source"] for f in body["ranking_factors"]}
    assert sources["RAM: At least 16 GB"] == "suggestion"
    assert sources["Battery life"] == "priority"
    not_used = {n["label"]: n["reason"] for n in body["not_used"]}
    assert "Weight isn’t listed" in not_used["Portability"]
    assert any(label.startswith("Uses:") for label in not_used)
    assert "not verified requirements" in body["method"]


def test_phone_graphics_and_camera_not_used(client, catalogue):
    prefs = {"category": "smartphones", "min_budget_inr": None, "max_budget_inr": None, "use_cases": [], "priorities": ["Great camera"],
             "hardware_preferences": [{"spec": "graphics", "preference": "Dedicated graphics", "reason": ""},
                                      {"spec": "battery", "preference": "5,000 mAh or more", "reason": ""}], "brands": []}
    body = recommend(client, prefs)
    reasons_by = {n["label"]: n["reason"] for n in body["not_used"]}
    assert "don’t include graphics" in reasons_by["Graphics: Dedicated graphics"]
    assert "Camera specs aren’t listed" in reasons_by["Great camera"]
    first = body["items"][0]
    assert first["product"]["name"] == "Phone P1"
    assert reasons(first)["hw:battery"] == ("positive", "Battery 5,000 mAh meets “5,000 mAh or more”")


def test_mixed_categories_skip_cross_type_comparisons(client, catalogue):
    prefs = {**JAVA_PREFS, "category": None, "max_budget_inr": None, "hardware_preferences": []}
    body = recommend(client, prefs)
    assert not any(f["key"].startswith("priority:battery") for f in body["ranking_factors"])
    assert any("different product types" in n["reason"] for n in body["not_used"])


def test_no_preferences_ranks_by_price_without_inventing_reasons(client, catalogue):
    prefs = {"category": "laptops", "min_budget_inr": None, "max_budget_inr": None, "use_cases": [], "priorities": [], "hardware_preferences": [], "brands": []}
    body = recommend(client, prefs)
    assert body["ranking_factors"] == []
    assert all(i["reasons"] == [] for i in body["items"])
    prices = [float(i["product"]["price_inr"]) for i in body["items"]]
    assert prices == sorted(prices)  # tie -> cheaper first


def test_sort_and_pagination(client, catalogue):
    body = recommend(client, JAVA_PREFS, sort="price_asc", limit=2)
    assert body["total"] == 4 and len(body["items"]) == 2
    assert [float(i["product"]["price_inr"]) for i in body["items"]] == [55000, 60000]


def test_brand_filter_is_case_insensitive_and_canonical(client, catalogue):
    body = recommend(client, {**JAVA_PREFS, "brands": ["kestrel", "Nonexistent"]})
    assert body["preferences"]["brands"] == ["Kestrel"]
    assert [i["product"]["brand"] for i in body["items"]] == ["Kestrel"]
    assert any("Nonexistent" in w for w in body["warnings"])


@pytest.mark.parametrize("bad", [
    {**JAVA_PREFS, "min_budget_inr": 80000, "max_budget_inr": 70000},
    {**JAVA_PREFS, "category": "tablets"},
    {**JAVA_PREFS, "hardware_preferences": [{"spec": "keyboard", "preference": "backlit"}]},
])
def test_invalid_preferences_rejected_before_filtering(client, catalogue, bad):
    res = client.post("/api/recommendations", json={"preferences": bad})
    assert res.status_code == 422


def test_validate_endpoint_checks_catalogue(client, catalogue):
    body = client.post("/api/ai/preferences/validate", json={**JAVA_PREFS, "brands": ["NORTHWIND", "Dell"]}).json()
    assert body["preferences"]["brands"] == ["Northwind"]
    assert body["search"]["brand"] == ["Northwind"]
    assert any("Dell" in w for w in body["warnings"])
