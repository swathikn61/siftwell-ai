NEW_PRODUCT = {
    "slug": "test-laptop",
    "name": "Test Laptop",
    "brand": "Acme",
    "category": "laptops",
    "price": 999.99,
    "rating": 4.5,
}


def test_health(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
    assert res.json()["database"] == "connected"


def test_product_crud(client):
    created = client.post("/api/products", json=NEW_PRODUCT)
    assert created.status_code == 201
    product_id = created.json()["id"]

    assert client.get(f"/api/products/{product_id}").json()["name"] == "Test Laptop"

    listed = client.get("/api/products", params={"category": "laptops"}).json()
    assert listed["total"] == 1

    updated = client.patch(f"/api/products/{product_id}", json={"price": 899})
    assert updated.status_code == 200
    assert float(updated.json()["price"]) == 899

    assert client.delete(f"/api/products/{product_id}").status_code == 204
    assert client.get(f"/api/products/{product_id}").status_code == 404


def test_not_found_error_shape(client):
    res = client.get("/api/products/12345")
    assert res.status_code == 404
    assert res.json() == {"error": {"code": "not_found", "message": "Product 12345 was not found", "details": None}}


def test_validation_error(client):
    res = client.post("/api/products", json={**NEW_PRODUCT, "price": -5, "category": "cars"})
    assert res.status_code == 422
    body = res.json()["error"]
    assert body["code"] == "validation_error"
    assert {d["field"] for d in body["details"]} == {"price", "category"}


def test_duplicate_slug_conflict(client):
    client.post("/api/products", json=NEW_PRODUCT)
    res = client.post("/api/products", json=NEW_PRODUCT)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "conflict"


def test_unknown_route_uses_error_format(client):
    res = client.get("/api/does-not-exist")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "not_found"


def test_cors_allows_frontend(client):
    res = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"
