# Siftwell API (backend)

FastAPI + SQLAlchemy + PostgreSQL backend for Siftwell.

## Folder structure

```
backend/
├── app/
│   ├── main.py          # Creates the FastAPI app, CORS, routers, error handlers
│   ├── database.py      # SQLAlchemy engine, sessions, Base, get_db()
│   ├── seed.py          # Adds demo laptops & smartphones (python -m app.seed)
│   ├── core/
│   │   ├── config.py    # Settings loaded from .env
│   │   └── errors.py    # Custom exceptions + consistent JSON error responses
│   ├── models/          # Database tables (SQLAlchemy)
│   ├── schemas/         # Request/response shapes (Pydantic)
│   ├── services/        # Business logic and database queries
│   └── routers/         # API endpoints
├── data/
│   └── sample_products_demo.csv   # Demo CSV for trying the import API
├── tests/               # pytest tests (use a temporary SQLite DB)
├── requirements.txt
└── .env.example
```

How a request flows: **router** (validates input with a schema) → **service** (does the work) → **model** (talks to the database) → response schema.

## Run it

All commands run from the `backend/` folder.

1. **Create a virtual environment and install packages**

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. **Create the database** (PostgreSQL must be running)

   ```bash
   createdb siftwell
   ```

3. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Then edit `DATABASE_URL` in `.env` to match your PostgreSQL user and password.

4. **(Optional) add demo products**

   ```bash
   python -m app.seed
   ```

   Use `python -m app.seed --reset` to drop and recreate all tables first
   (needed after the table structure changes, since there are no migrations yet).
   This deletes everything in the catalogue tables.

5. **Start the server**

   ```bash
   uvicorn app.main:app --reload
   ```

   Tables are created automatically on startup.

## Product catalogue

Siftwell currently supports two categories: **laptops** and **smartphones**.

### Tables

| Table                    | What it stores                                                                 |
| ------------------------ | ------------------------------------------------------------------------------ |
| `categories`             | `slug`, `name`, `description` — created automatically on startup               |
| `products`               | name, brand, model, category, `price_inr`, image URL, source URL, last verified date, `is_demo` |
| `product_specifications` | processor, RAM, storage, battery, display, graphics (one row per product)      |

### Demo data and verification

Seed data and the sample CSV are **fictional** (invented brands, models, specs
and prices). They are saved with `is_demo = true` and no source URL or verified
date. Every product response includes `verification_status`:

| Value        | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `demo`       | Sample data — not real-world information                   |
| `verified`   | Has a `source_url` **and** a `last_verified_date`           |
| `unverified` | A real product that hasn't been checked against a source yet |

Use `include_demo=false` on list/search to hide demo products.

### Endpoints

| Method | Path                            | Purpose                                         |
| ------ | ------------------------------- | ----------------------------------------------- |
| GET    | `/api/categories`               | Categories with product counts                  |
| GET    | `/api/products`                 | List with filters, sorting and pagination       |
| GET    | `/api/products/search?q=...`    | Keyword search (same filters available)         |
| GET    | `/api/products/brands`          | Brands with counts (for filter menus)           |
| GET    | `/api/products/{id}`            | One product by ID                               |
| GET    | `/api/products/slug/{slug}`     | One product by slug                             |
| POST   | `/api/products`                 | Add a product                                   |
| PATCH  | `/api/products/{id}`            | Update some fields                              |
| DELETE | `/api/products/{id}`            | Delete a product                                |
| GET    | `/api/products/import/template` | Download a CSV template                         |
| GET    | `/api/compare?products=a&products=b` | Rule-based comparison of 1–4 products       |
| POST   | `/api/products/import`          | Import products from a CSV file                 |

**Filters** (list and search): `category`, `brand` (repeat for several:
`?brand=Orbis&brand=Kestrel`, case-insensitive), `min_price` and `max_price`
(budget in INR), `include_demo`, `sort` (`price_asc`, `price_desc`, `newest`,
`name`), `limit`, `offset`.

**Search** looks in name, brand, model and all specifications. Every word must
match somewhere, so `q=oled 120` finds products whose specs mention both "OLED" and "120"
(e.g. a 120 Hz OLED display). Words are matched as typed: `16 GB` matches "16 GB", `16GB` does not.

### CSV import

- Required columns: `name, brand, model, category, price_inr`
- Optional: `slug, image_url, processor, ram, storage, battery, display, graphics, source_url, last_verified_date, is_demo`
- `price_inr` accepts `124990`, `1,24,990` or `₹1,24,990`
- `last_verified_date` uses `YYYY-MM-DD`; `is_demo` accepts true/false/yes/no/1/0
- The slug is generated from brand + model when left blank
- Valid rows are saved, invalid rows are listed in `errors` with their line number
- Existing products are skipped unless you pass `update_existing=true`
- `dry_run=true` checks the file without saving anything
- Limits: UTF-8, 2 MB, 1,000 rows

## Product comparison

`GET /api/compare?products=<slug>&products=<slug>` compares 1–4 products using
plain Python rules (no AI). It returns every product, a row per spec (price,
processor, RAM, storage, battery, display, graphics), advantages and
disadvantages per product, and an overall summary.

**When is a product marked “best”?** Only when the data supports it:

- every compared product lists the spec in a readable form (otherwise: “Not listed for …”),
- the values can be compared fairly — same product type, same unit (mAh vs Wh isn’t compared),
- the values actually differ (otherwise: “The listed values are the same…”).

Specs made of several numbers need a product to be at least as good on **every**
measure: processor (core count, clock speed), display (refresh rate, resolution)
and graphics (dedicated vs integrated, graphics memory). If one product has more
cores and another a higher clock speed, the result is “No clear winner” with the
trade-off explained. Measures missing for some products are skipped and noted.

Advantages and disadvantages are relative to the products being compared
(“Most RAM (32 GB)”, “Highest price (₹80,000 more than the cheapest)”), plus
display panel types (OLED, Mini-LED) when not every product has one.
The parsing lives in `app/services/spec_parser.py` and the rules in
`app/services/comparison_service.py`.

## Test with Swagger UI

Open **http://localhost:8000/docs** (http://localhost:8000 redirects there).
For each endpoint: expand it → **Try it out** → fill in the fields → **Execute**.

1. **GET /api/health** — expect `"status": "ok"` and `"database": "connected"`.
2. **GET /api/categories** — laptops and smartphones with counts.
3. **GET /api/products** — set `category` to `smartphones` and `max_price` to `50000`.
4. **GET /api/products/search** — try `q` = `dedicated gpu`.
5. **POST /api/products** — edit the example body (use a new `model`) → expect `201`.
6. **PATCH** / **DELETE /api/products/{product_id}** with the new `id`.
7. **POST /api/products/import** — click **Choose File**, pick
   `data/sample_products_demo.csv`, set `dry_run` to `true` first to preview,
   then run it again with `dry_run` = `false`.
8. **GET /api/compare** — add `halcyon-vs16-26` and `ironpeak-fg15-26` as `products` and check the `specs`, `analysis` and `summary`.
9. Send bad data (e.g. `"price_inr": -1`) to see a `422` validation error.

An alternative documentation view is at http://localhost:8000/redoc.

## Error format

Every error has the same shape:

```json
{ "error": { "code": "not_found", "message": "Product 42 was not found", "details": null } }
```

| Status | `code`                 | When                                  |
| ------ | ---------------------- | ------------------------------------- |
| 400    | `bad_request`          | Bad CSV file, or min_price > max_price |
| 404    | `not_found`            | Record or route doesn't exist         |
| 409    | `conflict`             | Duplicate unique value (e.g. slug)    |
| 422    | `validation_error`     | Invalid body/query, or unknown category |
| 503    | `database_unavailable` | PostgreSQL can't be reached           |
| 500    | `internal_error`       | Unexpected error (details are logged) |

## Run the tests

```bash
pytest
```

Tests use a temporary SQLite file, so they never touch your PostgreSQL data.
