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
| POST   | `/api/ai/preferences`           | AI preference extraction (Gemini)               |
| POST   | `/api/ai/preferences/validate`  | Validate preferences edited by the user         |
| GET    | `/api/ai/status`                | Is Gemini configured and reachable?             |
| POST   | `/api/recommendations`          | Score (0–100) and rank products, with reasons   |
| POST   | `/api/assistant/chat`           | Ask the AI Decision Assistant about results     |
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

## AI preference extraction (Google Gemini)

`POST /api/ai/preferences` turns a request like *“I need a laptop under ₹70,000
for Java development, college work and occasional gaming. Battery life is
important.”* into validated preferences (category, budget, uses, priorities,
general hardware guidance, brands) plus ready-to-use search filters.

**Setup:** create a free API key at https://aistudio.google.com/apikey and add it
to `backend/.env` (never to the frontend):

```
GEMINI_API_KEY=your-key-here
GEMINI_MODEL=gemini-3.5-flash-lite
GEMINI_TIMEOUT_SECONDS=10
GEMINI_TOTAL_TIMEOUT_SECONDS=15
GEMINI_THINKING_LEVEL=minimal
```

Restart the server, then check `GET /api/ai/status` — it should say `"available": true`.

**How it works**

- `app/ai/gemini_client.py` calls Gemini's `generateContent` with structured JSON
  output (`responseMimeType` + `responseJsonSchema`) and temperature 0. The key is
  sent in a header, never in a URL, and is never logged or returned.
- `app/ai/preference_extractor.py` tidies and validates the reply with Pydantic,
  retries once if the JSON is broken or invalid, and then checks it against the
  user's words: budgets and brands must appear in the request, an explicit
  category word wins, and suggestions naming specific chips or products are removed.
- If Gemini is unavailable, rate-limited (HTTP 429), times out, rejects the key, or
  keeps returning bad data, a rule-based parser (`app/ai/rules.py`) is used instead.
  The response says `"source": "rules"` and `warnings` explains why. Temporary
  server errors (5xx) are retried once; rate limits are not retried.
- **Timeouts and retries:** each call has a 10 s limit and the whole extraction a
  15 s budget. A retry only happens if the first attempt failed quickly (e.g. an
  instant 503 or invalid JSON) *and* enough of the budget is left, so users don't
  wait through two slow calls. Rate limits, timeouts and auth errors are never retried.
- **Measured timing:** every response includes `diagnostics` (connection setup,
  model wait, Google's server time, prompt/output/thinking tokens). The HTTPS
  connection to Gemini is reused between requests.
- `POST /api/ai/preferences/validate` validates preferences the user edited
  (Pydantic + catalogue check: unknown categories/brands are removed with a warning).

## Recommendation engine

`POST /api/recommendations` scores and ranks products with **deterministic Python**
(`app/services/scoring_engine.py`). Gemini only extracts preferences — it never
calculates scores or rankings. The same input always gives the same result.

1. **Filter** (`recommendation_service.py`, PostgreSQL): category, budget, brands, then
   *must-have* requirements (hardware guidelines the user ticked as “Must have”).
   A product whose listing doesn’t show a must-have spec is excluded too, with the reason.
2. **Score each criterion 0–100** on published reference scales per category
   (returned in `scales`):

   | Criterion | Laptops | Smartphones |
   |---|---|---|
   | Processor (cores × GHz, both must be listed) | 16–80 | 8–28 |
   | RAM (log) | 4–32 GB | 4–16 GB |
   | Storage (log) | 128–2,048 GB | 64–1,024 GB |
   | Battery | 40–100 Wh | 3,000–6,000 mAh |
   | Display (average of refresh rate and resolution, if listed) | 60–240 Hz; FHD–3840×2400 | 60–144 Hz; 720×1600–1440×3200 |
   | Value for money | spec score per ₹1 lakh, compared across the matching products | same |

3. **Weights**: defaults (processor 20, RAM 15, battery 15, storage 10, display 15,
   value 25), or the user’s own `weights`, multiplied by usage/priority adjustments
   (e.g. “Java development” → RAM ×1.5, processor ×1.3; “Battery life” → battery ×1.5;
   capped at ×3), then normalised to 100%. Set `adjust_for_usage: false` to turn this off.
4. **Total out of 100** = weighted average of the criteria that could be scored.
   Missing specs are never guessed or counted as zero: they’re left out, their weight
   is shared among the others, and `coverage` shows how much of the weight was scored.
5. **Explanations**: every product returns a per-criterion `breakdown` (score, weight,
   points contributed, how it was calculated), `strengths`, `weaknesses`, requirement
   checks and a one-line `summary`. Ties are broken by coverage, then price, then name.

Note: value for money is relative to the products that match, so changing filters or
must-haves can change value scores (and therefore totals).

## AI Decision Assistant

`POST /api/assistant/chat` answers questions about the products a user is looking at
(“Why is this ranked first?”, “Which has the best battery?”, “Is the expensive one worth it?”).

- **Separate from scoring:** `app/ai/assistant.py` only explains. Scores come from the
  rule-based engine and are passed in as facts (`app/ai/assistant_context.py`).
- **Grounded:** the request sends only product slugs, preferences and weights. Specs and
  prices are re-read from PostgreSQL; the prompt lists them with the engine's scores,
  breakdowns, strengths/weaknesses, precomputed price differences, and an explicit list
  of data Siftwell doesn't have (ratings, benchmarks, weight, battery life, …).
- **Follow-ups:** send earlier turns in `history` (last 10 kept).
- **Checks:** structured JSON validated with Pydantic; cited products must be in the
  context; every number in the answer must appear in the facts or the user's messages,
  and values with units Siftwell never lists (kg, hours, fps, stars, …) are always
  flagged. One rewrite is requested if time allows; otherwise the answer carries a warning.
- **Errors:** rate limit → 429, timeout → 504, missing/rejected key → 503, unusable
  reply → 502 — all in the standard error format.

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
