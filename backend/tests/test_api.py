"""API tests. They run against a temporary SQLite database (see conftest.py)."""

from datetime import date, timedelta
from pathlib import Path

import pytest

SAMPLE_CSV = Path(__file__).resolve().parent.parent / "data" / "sample_products_demo.csv"


def laptop(**overrides):
    body = {
        "name": "Test Laptop 14",
        "brand": "Acme",
        "model": "TL14",
        "category": "laptops",
        "price_inr": 59999,
        "is_demo": True,
        "specifications": {
            "processor": "8-core CPU",
            "ram": "16 GB",
            "storage": "512 GB SSD",
            "battery": "60 Wh",
            "display": '14" OLED',
            "graphics": "Integrated",
        },
    }
    body.update(overrides)
    return body


def phone(**overrides):
    body = {
        "name": "Test Phone",
        "brand": "Zeta",
        "model": "ZP1",
        "category": "smartphones",
        "price_inr": 19999,
        "is_demo": True,
        "specifications": {"processor": "Octa-core", "ram": "8 GB", "storage": "128 GB", "battery": "5,000 mAh", "display": '6.5" LCD'},
    }
    body.update(overrides)
    return body


@pytest.fixture()
def catalogue(client):
    """Four products across both categories."""
    created = [
        client.post("/api/products", json=laptop()).json(),
        client.post("/api/products", json=laptop(name="Big Laptop 16", model="BL16", price_inr=149999, brand="Acme",
                                                  specifications={"ram": "32 GB", "display": '16" IPS'})).json(),
        client.post("/api/products", json=phone()).json(),
        client.post("/api/products", json=phone(name="Zeta Max", model="ZMAX", price_inr=89999, brand="Orbit")).json(),
    ]
    assert all("id" in p for p in created), created
    return created


# ---------------------------------------------------------------------------
# Health and categories
# ---------------------------------------------------------------------------
def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["database"] == "connected"


def test_categories_are_created_with_counts(client, catalogue):
    res = client.get("/api/categories")
    assert res.status_code == 200
    counts = {c["slug"]: c["product_count"] for c in res.json()}
    assert counts == {"laptops": 2, "smartphones": 2}


# ---------------------------------------------------------------------------
# Add products
# ---------------------------------------------------------------------------
def test_create_product_returns_all_fields(client):
    res = client.post("/api/products", json=laptop())
    assert res.status_code == 201
    p = res.json()
    assert p["slug"] == "acme-tl14"  # generated from brand + model
    assert p["category"] == {"slug": "laptops", "name": "Laptops"}
    assert float(p["price_inr"]) == 59999
    assert p["specifications"]["graphics"] == "Integrated"
    assert p["is_demo"] is True and p["verification_status"] == "demo"
    for key in ["image_url", "source_url", "last_verified_date", "created_at"]:
        assert key in p


def test_verification_status(client):
    verified = client.post("/api/products", json=laptop(model="V1", is_demo=False, source_url="https://example.com/p",
                                                       last_verified_date=str(date.today()))).json()
    unverified = client.post("/api/products", json=laptop(model="U1", is_demo=False)).json()
    assert verified["verification_status"] == "verified"
    assert unverified["verification_status"] == "unverified"


def test_phone_without_graphics_is_allowed(client):
    res = client.post("/api/products", json=phone())
    assert res.status_code == 201
    assert res.json()["specifications"]["graphics"] is None


def test_unknown_category_rejected(client):
    res = client.post("/api/products", json=laptop(category="tablets"))
    assert res.status_code == 422
    assert res.json()["error"]["details"][0]["field"] == "category"


def test_duplicate_product_conflict(client):
    client.post("/api/products", json=laptop())
    res = client.post("/api/products", json=laptop())
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "conflict"


@pytest.mark.parametrize(
    "overrides, field",
    [
        ({"price_inr": -1}, "price_inr"),
        ({"source_url": "not-a-url"}, "source_url"),
        ({"last_verified_date": str(date.today() + timedelta(days=3))}, "last_verified_date"),
        ({"slug": "Bad Slug"}, "slug"),
        ({"name": ""}, "name"),
    ],
)
def test_create_validation_errors(client, overrides, field):
    res = client.post("/api/products", json=laptop(**overrides))
    assert res.status_code == 422
    assert field in {d["field"] for d in res.json()["error"]["details"]}


# ---------------------------------------------------------------------------
# Retrieve products
# ---------------------------------------------------------------------------
def test_get_by_id_and_slug(client, catalogue):
    pid, slug = catalogue[0]["id"], catalogue[0]["slug"]
    assert client.get(f"/api/products/{pid}").json()["slug"] == slug
    assert client.get(f"/api/products/slug/{slug}").json()["id"] == pid


def test_get_missing_product_404(client):
    assert client.get("/api/products/999").status_code == 404
    assert client.get("/api/products/slug/nope").json()["error"]["code"] == "not_found"


def test_list_and_pagination(client, catalogue):
    page = client.get("/api/products", params={"limit": 3}).json()
    assert page["total"] == 4 and len(page["items"]) == 3
    rest = client.get("/api/products", params={"limit": 3, "offset": 3}).json()
    assert len(rest["items"]) == 1


# ---------------------------------------------------------------------------
# Filters
# ---------------------------------------------------------------------------
def names(res):
    assert res.status_code == 200, res.json()
    return sorted(p["name"] for p in res.json()["items"])


def test_filter_by_category(client, catalogue):
    assert names(client.get("/api/products", params={"category": "smartphones"})) == ["Test Phone", "Zeta Max"]


def test_filter_by_brand_case_insensitive_and_multiple(client, catalogue):
    assert names(client.get("/api/products", params={"brand": "acme"})) == ["Big Laptop 16", "Test Laptop 14"]
    assert len(client.get("/api/products", params=[("brand", "Zeta"), ("brand", "Orbit")]).json()["items"]) == 2


def test_filter_by_budget(client, catalogue):
    assert names(client.get("/api/products", params={"max_price": 60000})) == ["Test Laptop 14", "Test Phone"]
    assert names(client.get("/api/products", params={"min_price": 50000, "max_price": 100000})) == ["Test Laptop 14", "Zeta Max"]


def test_budget_min_greater_than_max_is_rejected(client):
    res = client.get("/api/products", params={"min_price": 5000, "max_price": 1000})
    assert res.status_code == 400


def test_combined_filters_and_sort(client, catalogue):
    res = client.get("/api/products", params={"category": "laptops", "brand": "Acme", "max_price": 200000, "sort": "price_desc"})
    assert [p["name"] for p in res.json()["items"]] == ["Big Laptop 16", "Test Laptop 14"]


def test_hide_demo_products(client, catalogue):
    client.post("/api/products", json=laptop(model="REAL1", is_demo=False))
    res = client.get("/api/products", params={"include_demo": False}).json()
    assert res["total"] == 1 and res["items"][0]["is_demo"] is False


def test_brands_endpoint(client, catalogue):
    all_brands = client.get("/api/products/brands").json()
    assert {b["brand"]: b["product_count"] for b in all_brands} == {"Acme": 2, "Orbit": 1, "Zeta": 1}
    assert [b["brand"] for b in client.get("/api/products/brands", params={"category": "smartphones"}).json()] == ["Orbit", "Zeta"]


# ---------------------------------------------------------------------------
# Search
# ---------------------------------------------------------------------------
def test_search_by_name_brand_and_specs(client, catalogue):
    assert names(client.get("/api/products/search", params={"q": "zeta"})) == ["Test Phone", "Zeta Max"]
    assert names(client.get("/api/products/search", params={"q": "32 GB"})) == ["Big Laptop 16"]
    assert names(client.get("/api/products/search", params={"q": "16 oled"})) == ["Test Laptop 14"]


def test_search_with_filters(client, catalogue):
    assert names(client.get("/api/products/search", params={"q": "test", "category": "laptops"})) == ["Test Laptop 14"]
    assert names(client.get("/api/products/search", params={"q": "zeta", "max_price": 50000})) == ["Test Phone"]


def test_search_no_results_and_missing_query(client, catalogue):
    assert client.get("/api/products/search", params={"q": "nothingmatches"}).json()["total"] == 0
    assert client.get("/api/products/search").status_code == 422


# ---------------------------------------------------------------------------
# Update and delete
# ---------------------------------------------------------------------------
def test_patch_updates_only_sent_fields(client, catalogue):
    pid = catalogue[0]["id"]
    res = client.patch(f"/api/products/{pid}", json={"price_inr": 54999, "specifications": {"ram": "32 GB"}})
    assert res.status_code == 200
    p = res.json()
    assert float(p["price_inr"]) == 54999
    assert p["specifications"]["ram"] == "32 GB"
    assert p["specifications"]["processor"] == "8-core CPU"  # unchanged
    assert p["name"] == "Test Laptop 14"


def test_patch_category_and_validation(client, catalogue):
    pid = catalogue[0]["id"]
    assert client.patch(f"/api/products/{pid}", json={"category": "smartphones"}).json()["category"]["slug"] == "smartphones"
    assert client.patch(f"/api/products/{pid}", json={"category": "cars"}).status_code == 422
    assert client.patch("/api/products/999", json={"price_inr": 1}).status_code == 404


def test_delete(client, catalogue):
    pid = catalogue[0]["id"]
    assert client.delete(f"/api/products/{pid}").status_code == 204
    assert client.get(f"/api/products/{pid}").status_code == 404
    assert client.delete(f"/api/products/{pid}").status_code == 404


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------
def upload(client, content: bytes | str, filename="products.csv", **params):
    if isinstance(content, str):
        content = content.encode("utf-8")
    return client.post("/api/products/import", params=params, files={"file": (filename, content, "text/csv")})


def test_import_template(client):
    res = client.get("/api/products/import/template")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert res.text.splitlines()[0].startswith("name,brand,model,category,price_inr")


def test_template_round_trips_through_import(client):
    template = client.get("/api/products/import/template").text
    res = upload(client, template)
    assert res.json()["created"] == 1 and res.json()["failed"] == 0


def test_import_sample_file(client):
    res = upload(client, SAMPLE_CSV.read_bytes())
    assert res.status_code == 200
    body = res.json()
    assert (body["total_rows"], body["created"], body["failed"]) == (4, 4, 0)

    page = client.get("/api/products", params={"category": "laptops"}).json()
    pro16 = next(p for p in page["items"] if p["model"] == "AB16P-26")
    assert float(pro16["price_inr"]) == 149990  # "₹1,49,990" was cleaned
    assert pro16["is_demo"] is True and pro16["verification_status"] == "demo"
    assert pro16["specifications"]["display"] == '16" 3200×2000 OLED, 120 Hz'


def test_import_skips_existing_unless_update_existing(client):
    upload(client, SAMPLE_CSV.read_bytes())
    again = upload(client, SAMPLE_CSV.read_bytes()).json()
    assert (again["created"], again["skipped"]) == (0, 4)
    assert len(again["skipped_rows"]) == 4

    changed = SAMPLE_CSV.read_text(encoding="utf-8").replace("34999", "31999")
    updated = upload(client, changed, update_existing=True).json()
    assert updated["updated"] == 4
    phone = client.get("/api/products/slug/brightline-na7-26").json()
    assert float(phone["price_inr"]) == 31999


def test_import_dry_run_saves_nothing(client):
    res = upload(client, SAMPLE_CSV.read_bytes(), dry_run=True).json()
    assert res["dry_run"] is True and res["created"] == 4
    assert client.get("/api/products").json()["total"] == 0


def test_import_reports_bad_rows_and_keeps_good_ones(client):
    csv_text = (
        "name,brand,model,category,price_inr,is_demo,last_verified_date\n"
        "Good Laptop,Acme,G1,laptops,50000,true,\n"   # line 2: ok
        "Bad Price,Acme,G2,laptops,abc,true,\n"       # line 3: price
        "Bad Cat,Acme,G3,tablets,1000,true,\n"        # line 4: category
        "Good Laptop Again,Acme,G1,laptops,1000,,\n"  # line 5: duplicate slug in file
        "Bad Bool,Acme,G4,laptops,1000,maybe,\n"      # line 6: is_demo
        "Bad Date,Acme,G5,laptops,1000,,2020-13-45\n"  # line 7: date
        ",,,,,,\n"                                    # blank line ignored
    )
    body = upload(client, csv_text).json()
    assert (body["total_rows"], body["created"], body["failed"]) == (6, 1, 5)
    assert [e["row"] for e in body["errors"]] == [3, 4, 5, 6, 7]
    assert "price_inr" in body["errors"][0]["messages"][0]
    assert "unknown category" in body["errors"][1]["messages"][0]
    assert "more than once" in body["errors"][2]["messages"][0]


@pytest.mark.parametrize(
    "content, filename, message",
    [
        ("name,brand\nX,Y\n", "p.csv", "Missing required column"),
        ("", "p.csv", "empty"),
        ("name,brand,model,category,price_inr\n", "p.txt", ".csv"),
        (b"\xff\xfe\x00bad", "p.csv", "UTF-8"),
    ],
)
def test_import_rejects_bad_files(client, content, filename, message):
    res = upload(client, content, filename=filename)
    assert res.status_code == 400
    assert message in res.json()["error"]["message"]


def test_import_too_many_rows(client):
    header = "name,brand,model,category,price_inr\n"
    rows = "".join(f"P{i},B,M{i},laptops,100\n" for i in range(1001))
    res = upload(client, header + rows)
    assert res.status_code == 400 and "Too many rows" in res.json()["error"]["message"]


# ---------------------------------------------------------------------------
# Cross-cutting
# ---------------------------------------------------------------------------
def test_unknown_route_uses_error_format(client):
    res = client.get("/api/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_cors_allows_frontend(client):
    res = client.options("/api/products", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
