"""Tests for saved comparisons, favourites and search history — including ownership checks."""

import pytest

from tests.conftest import auth_headers


def product(model, price=50000, category="laptops"):
    return {"name": f"Laptop {model}", "brand": "Acme", "model": model, "category": category, "price_inr": price, "is_demo": True}


@pytest.fixture()
def slugs(client):
    return [client.post("/api/products", json=product(m)).json()["slug"] for m in ("A", "B", "C")]


@pytest.fixture()
def alice(client):
    return auth_headers(client, email="alice@example.com", name="Alice")


@pytest.fixture()
def bob(client):
    return auth_headers(client, email="bob@example.com", name="Bob")


# ---------------------------------------------------------------------------
# Saved comparisons
# ---------------------------------------------------------------------------
def test_comparison_crud(client, slugs, alice):
    created = client.post("/api/me/comparisons", headers=alice, json={"title": "  Coding   laptops ", "product_slugs": slugs[:2] + [slugs[0]]})
    assert created.status_code == 201
    c = created.json()
    assert c["title"] == "Coding laptops" and c["product_slugs"] == slugs[:2]  # tidied, de-duplicated

    assert [x["id"] for x in client.get("/api/me/comparisons", headers=alice).json()] == [c["id"]]
    renamed = client.patch(f"/api/me/comparisons/{c['id']}", headers=alice, json={"title": "Final shortlist", "note": "Pick by Friday"})
    assert renamed.json()["title"] == "Final shortlist" and renamed.json()["note"] == "Pick by Friday"
    assert client.delete(f"/api/me/comparisons/{c['id']}", headers=alice).status_code == 204
    assert client.get(f"/api/me/comparisons/{c['id']}", headers=alice).status_code == 404


@pytest.mark.parametrize("body", [
    {"title": "", "product_slugs": ["x"]},
    {"title": "   ", "product_slugs": ["x"]},
    {"title": "Ok", "product_slugs": []},
    {"title": "Ok", "product_slugs": ["a", "b", "c", "d", "e"]},
    {"title": "x" * 121, "product_slugs": ["a"]},
])
def test_comparison_validation(client, alice, body):
    assert client.post("/api/me/comparisons", headers=alice, json=body).status_code == 422


def test_comparison_rejects_unknown_products(client, slugs, alice):
    res = client.post("/api/me/comparisons", headers=alice, json={"title": "X", "product_slugs": [slugs[0], "ghost-product"]})
    assert res.status_code == 422 and "ghost-product" in res.json()["error"]["details"][0]["message"]


def test_comparisons_are_private(client, slugs, alice, bob):
    c = client.post("/api/me/comparisons", headers=alice, json={"title": "Alice's", "product_slugs": slugs[:2]}).json()
    assert client.get("/api/me/comparisons", headers=bob).json() == []
    # Bob can't read, edit or delete Alice's comparison — it looks like it doesn't exist
    assert client.get(f"/api/me/comparisons/{c['id']}", headers=bob).status_code == 404
    assert client.patch(f"/api/me/comparisons/{c['id']}", headers=bob, json={"title": "hacked"}).status_code == 404
    assert client.delete(f"/api/me/comparisons/{c['id']}", headers=bob).status_code == 404
    assert client.get(f"/api/me/comparisons/{c['id']}", headers=alice).json()["title"] == "Alice's"


# ---------------------------------------------------------------------------
# Favourites
# ---------------------------------------------------------------------------
def test_favourites_add_list_remove_idempotent(client, slugs, alice):
    assert client.put(f"/api/me/favourites/{slugs[0]}", headers=alice).status_code == 201
    assert client.put(f"/api/me/favourites/{slugs[0]}", headers=alice).status_code == 200  # already there
    client.put(f"/api/me/favourites/{slugs[1]}", headers=alice)
    favs = client.get("/api/me/favourites", headers=alice).json()
    assert {f["product"]["slug"] for f in favs} == {slugs[0], slugs[1]}
    assert favs[0]["product"]["name"]  # full product returned
    assert client.delete(f"/api/me/favourites/{slugs[0]}", headers=alice).status_code == 204
    assert client.delete(f"/api/me/favourites/{slugs[0]}", headers=alice).status_code == 404
    assert client.put("/api/me/favourites/ghost", headers=alice).status_code == 404


def test_favourites_are_private(client, slugs, alice, bob):
    client.put(f"/api/me/favourites/{slugs[0]}", headers=alice)
    assert client.get("/api/me/favourites", headers=bob).json() == []
    assert client.delete(f"/api/me/favourites/{slugs[0]}", headers=bob).status_code == 404
    assert len(client.get("/api/me/favourites", headers=alice).json()) == 1


# ---------------------------------------------------------------------------
# Search history
# ---------------------------------------------------------------------------
def test_history_records_newest_first_and_dedupes_repeats(client, alice):
    client.post("/api/me/history", headers=alice, json={"query": "laptop under 70k", "filters": {"category": "laptops", "max_price": 70000, "evil": "x"}})
    client.post("/api/me/history", headers=alice, json={"query": "phone with oled"})
    client.post("/api/me/history", headers=alice, json={"query": "Phone   with OLED"})  # same as latest -> refreshed, not duplicated
    history = client.get("/api/me/history", headers=alice).json()
    assert [h["query"] for h in history] == ["phone with oled", "laptop under 70k"]
    assert history[1]["filters"] == {"category": "laptops", "max_price": 70000}  # unknown keys dropped


def test_history_delete_one_and_clear(client, alice):
    ids = [client.post("/api/me/history", headers=alice, json={"query": q}).json()["id"] for q in ("a1", "b2", "c3")]
    assert client.delete(f"/api/me/history/{ids[0]}", headers=alice).status_code == 204
    assert len(client.get("/api/me/history", headers=alice).json()) == 2
    assert client.delete("/api/me/history", headers=alice).status_code == 204
    assert client.get("/api/me/history", headers=alice).json() == []


def test_history_is_private(client, alice, bob):
    entry = client.post("/api/me/history", headers=alice, json={"query": "secret search"}).json()
    assert client.get("/api/me/history", headers=bob).json() == []
    assert client.delete(f"/api/me/history/{entry['id']}", headers=bob).status_code == 404
    client.delete("/api/me/history", headers=bob)  # clearing Bob's history must not touch Alice's
    assert len(client.get("/api/me/history", headers=alice).json()) == 1


def test_history_is_capped(client, alice, monkeypatch):
    monkeypatch.setattr("app.services.user_data_service.MAX_HISTORY", 3)
    for i in range(5):
        client.post("/api/me/history", headers=alice, json={"query": f"query {i}"})
    assert [h["query"] for h in client.get("/api/me/history", headers=alice).json()] == ["query 4", "query 3", "query 2"]


def test_history_validation(client, alice):
    assert client.post("/api/me/history", headers=alice, json={"query": "   "}).status_code == 422
    assert client.post("/api/me/history", headers=alice, json={"query": "x" * 501}).status_code == 422
