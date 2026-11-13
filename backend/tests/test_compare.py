"""Tests for spec parsing and the rule-based comparison API."""

import pytest

from app.services.comparison_service import format_inr
from app.services.spec_parser import parse_battery, parse_display, parse_graphics, parse_processor, parse_size_gb


# ---------------------------------------------------------------------------
# Parsers
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("text, expected", [("16 GB LPDDR5", 16), ("1 TB NVMe SSD", 1024), ("512GB", 512), ("fast storage", None), (None, None)])
def test_parse_size_gb(text, expected):
    assert parse_size_gb(text) == expected


def test_parse_battery():
    assert parse_battery("5,000 mAh").value == 5000 and parse_battery("5,000 mAh").unit == "mah"
    assert parse_battery("72 Wh (up to 18 h)").unit == "wh"
    assert parse_battery("All-day battery") is None


def test_parse_processor():
    p = parse_processor("16-core CPU, up to 5.2 GHz")
    assert (p.cores, p.max_ghz) == (16, 5.2)
    assert parse_processor("Octa-core 3 nm flagship chip").cores == 8
    assert parse_processor("Flagship chip").cores is None


def test_parse_display():
    d = parse_display('16" 3200×2000 mini-LED, 165 Hz')
    assert (d.size_in, d.pixels, d.refresh_hz, d.panel) == (16.0, 6_400_000, 165, "mini-led")
    phone = parse_display('6.6" AMOLED, 144 Hz')
    assert (phone.pixels, phone.refresh_hz, phone.panel) == (None, 144, "oled")
    assert parse_display('15.6" FHD IPS').pixels == 1920 * 1080


def test_parse_graphics():
    assert parse_graphics("Dedicated GPU, 8 GB").dedicated is True
    assert parse_graphics("Dedicated GPU, 8 GB").vram_gb == 8
    assert parse_graphics("Integrated").dedicated is False
    assert parse_graphics("Some GPU").dedicated is None


def test_format_inr_uses_indian_grouping():
    assert format_inr(124990) == "₹1,24,990"
    assert format_inr(999) == "₹999"
    assert format_inr(12345678) == "₹1,23,45,678"


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
def laptop(model, price, processor, ram, storage, battery, display, graphics, **extra):
    return {
        "name": f"Laptop {model}", "brand": "Acme", "model": model, "category": "laptops", "price_inr": price, "is_demo": True,
        "specifications": {"processor": processor, "ram": ram, "storage": storage, "battery": battery, "display": display, "graphics": graphics},
        **extra,
    }


def phone(model, price, ram, storage, battery, display):
    return {
        "name": f"Phone {model}", "brand": "Zeta", "model": model, "category": "smartphones", "price_inr": price, "is_demo": True,
        "specifications": {"processor": "Octa-core chip", "ram": ram, "storage": storage, "battery": battery, "display": display},
    }


@pytest.fixture()
def products(client):
    items = {
        "big": laptop("BIG", 150000, "16-core CPU, up to 5.2 GHz", "32 GB", "1 TB SSD", "90 Wh", '16" 2560×1600 IPS, 165 Hz', "Dedicated GPU, 8 GB"),
        "mid": laptop("MID", 90000, "12-core CPU, up to 4.8 GHz", "16 GB", "1 TB SSD", "70 Wh", '14" 2880×1800 OLED, 120 Hz', "Integrated"),
        "fast": laptop("FAST", 120000, "10-core CPU, up to 5.6 GHz", "16 GB", "512 GB SSD", "80 Wh", '15.6" 1920×1080 IPS, 240 Hz', "Dedicated GPU, 6 GB"),
        "nobat": laptop("NOBAT", 60000, "8-core CPU, up to 4.0 GHz", "8 GB", "256 GB SSD", None, '13" 1920×1200 IPS', "Integrated"),
        "p1": phone("P1", 30000, "8 GB", "128 GB", "5,000 mAh", '6.5" OLED, 120 Hz'),
        "p2": phone("P2", 45000, "12 GB", "256 GB", "4,500 mAh", '6.7" OLED, 144 Hz'),
    }
    slugs = {}
    for key, body in items.items():
        res = client.post("/api/products", json=body)
        assert res.status_code == 201, res.json()
        slugs[key] = res.json()["slug"]
    return slugs


def compare(client, *slugs):
    res = client.get("/api/compare", params=[("products", s) for s in slugs])
    assert res.status_code == 200, res.json()
    body = res.json()
    body["by_key"] = {s["key"]: s for s in body["specs"]}
    body["by_slug"] = {a["slug"]: a for a in body["analysis"]}
    return body


def test_compare_returns_all_rows_in_order(client, products):
    body = compare(client, products["big"], products["mid"])
    assert [p["slug"] for p in body["products"]] == [products["big"], products["mid"]]
    assert [s["key"] for s in body["specs"]] == ["price", "processor", "ram", "storage", "battery", "display", "graphics"]
    assert body["method"].startswith("Rule-based")


def test_single_value_winners(client, products):
    body = compare(client, products["big"], products["mid"], products["fast"])
    spec = body["by_key"]
    assert spec["price"]["best"] == [products["mid"]]
    assert spec["ram"]["best"] == [products["big"]] and spec["ram"]["reason"] == "Most RAM: 32 GB"
    assert sorted(spec["storage"]["best"]) == sorted([products["big"], products["mid"]])  # shared win
    assert spec["battery"]["best"] == [products["big"]]


def test_processor_trade_off_has_no_winner(client, products):
    # big has more cores, fast has a higher clock speed
    spec = compare(client, products["big"], products["fast"])["by_key"]["processor"]
    assert spec["best"] == []
    assert "No clear winner" in spec["not_compared"]
    assert "core count" in spec["not_compared"] and "clock speed" in spec["not_compared"]


def test_processor_clear_winner_when_better_on_every_measure(client, products):
    spec = compare(client, products["big"], products["mid"])["by_key"]["processor"]
    assert spec["best"] == [products["big"]]


def test_missing_value_prevents_highlight(client, products):
    spec = compare(client, products["mid"], products["nobat"])["by_key"]["battery"]
    assert spec["best"] == []
    assert "Not listed for Laptop NOBAT" in spec["not_compared"]


def test_display_uses_only_measures_listed_for_everyone(client, products):
    # nobat has no refresh rate, so only resolution is compared, and the note says so
    spec = compare(client, products["mid"], products["nobat"])["by_key"]["display"]
    assert spec["best"] == [products["mid"]]
    assert "refresh rate not listed" in spec["reason"]


def test_graphics_dedicated_beats_integrated(client, products):
    body = compare(client, products["mid"], products["fast"])
    assert body["by_key"]["graphics"]["best"] == [products["fast"]]
    assert "Dedicated graphics (6 GB)" in body["by_slug"][products["fast"]]["advantages"]
    assert "Integrated graphics only" in body["by_slug"][products["mid"]]["disadvantages"]


def test_equal_values_are_not_highlighted(client, products):
    spec = compare(client, products["big"], products["mid"])["by_key"]
    assert spec["storage"]["best"] == []  # both 1 TB
    assert spec["storage"]["not_compared"] == "The listed values are the same for every product."


def test_phones_compare_battery_and_refresh(client, products):
    body = compare(client, products["p1"], products["p2"])
    spec = body["by_key"]
    assert spec["battery"]["best"] == [products["p1"]]
    assert spec["display"]["best"] == [products["p2"]]
    assert spec["processor"]["best"] == []  # both just "Octa-core"
    assert spec["graphics"]["not_compared"] == "Not listed for these products."
    # graphics isn't a "missing spec" for phones
    assert body["by_slug"][products["p1"]]["missing_specs"] == []


def test_mixed_categories_only_rank_price_ram_storage(client, products):
    body = compare(client, products["mid"], products["p2"])
    ranked = [s["key"] for s in body["specs"] if s["best"]]
    assert set(ranked) <= {"price", "ram", "storage"}
    assert "Different product types" in body["by_key"]["battery"]["not_compared"]
    assert any("different product types" in n for n in body["summary"]["notes"])


def test_advantages_disadvantages_and_summary(client, products):
    body = compare(client, products["big"], products["mid"], products["fast"])
    big = body["by_slug"][products["big"]]
    mid = body["by_slug"][products["mid"]]
    assert "Most RAM (32 GB)" in big["advantages"]
    assert any(d.startswith("Highest price") and "₹60,000 more" in d for d in big["disadvantages"])
    assert "Lowest price (₹90,000)" in mid["advantages"]
    assert "OLED display" in mid["advantages"]  # only mid has OLED

    summary = body["summary"]
    assert summary["most_specs_led"] == products["big"]
    assert summary["lowest_price"] == products["mid"]
    assert summary["headline"].startswith("Laptop BIG leads in")
    assert "costs ₹60,000 less" in summary["headline"]
    assert any("demo data" in n for n in summary["notes"])


def test_single_product_asks_for_more(client, products):
    body = compare(client, products["big"])
    assert all(s["best"] == [] for s in body["specs"])
    assert body["summary"]["headline"].startswith("Add at least one more product")


def test_missing_and_duplicate_slugs(client, products):
    body = compare(client, products["big"], "does-not-exist", products["big"], products["mid"])
    assert body["missing"] == ["does-not-exist"]
    assert [p["slug"] for p in body["products"]] == [products["big"], products["mid"]]


@pytest.mark.parametrize("count", [0, 5])
def test_compare_limits(client, products, count):
    slugs = [f"slug-{i}" for i in range(count)]
    res = client.get("/api/compare", params=[("products", s) for s in slugs])
    assert res.status_code in (400, 422)
