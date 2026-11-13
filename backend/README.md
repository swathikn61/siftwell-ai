# Siftwell API (backend)

FastAPI + SQLAlchemy + PostgreSQL backend for Siftwell.

## Folder structure

```
backend/
├── app/
│   ├── main.py          # Creates the FastAPI app, CORS, routers, error handlers
│   ├── database.py      # SQLAlchemy engine, sessions, Base, get_db()
│   ├── seed.py          # Adds a few demo products (python -m app.seed)
│   ├── core/
│   │   ├── config.py    # Settings loaded from .env
│   │   └── errors.py    # Custom exceptions + consistent JSON error responses
│   ├── models/          # Database tables (SQLAlchemy)
│   ├── schemas/         # Request/response shapes (Pydantic)
│   ├── services/        # Business logic and database queries
│   └── routers/         # API endpoints
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

5. **Start the server**

   ```bash
   uvicorn app.main:app --reload
   ```

   Tables are created automatically on startup.

## Test with Swagger UI

Open **http://localhost:8000/docs** (http://localhost:8000 redirects there).

1. Expand **GET /api/health**, click **Try it out**, then **Execute**. You should see `"status": "ok"` and `"database": "connected"`.
2. Expand **GET /api/products** → **Try it out** → optionally set `category` to `laptops` → **Execute**.
3. Expand **POST /api/products** → **Try it out**. Edit the example body (give it a unique `slug`) → **Execute**. You get `201` and the new product with its `id`.
4. Use that `id` with **GET**, **PATCH** and **DELETE /api/products/{product_id}**.
5. Try sending bad data (e.g. `"price": -1`) to see a `422` validation error.

An alternative documentation view is at http://localhost:8000/redoc.

## Error format

Every error has the same shape:

```json
{ "error": { "code": "not_found", "message": "Product 42 was not found", "details": null } }
```

| Status | `code`                 | When                                  |
| ------ | ---------------------- | ------------------------------------- |
| 404    | `not_found`            | Record or route doesn't exist         |
| 409    | `conflict`             | Duplicate unique value (e.g. slug)    |
| 422    | `validation_error`     | Request body or query is invalid      |
| 503    | `database_unavailable` | PostgreSQL can't be reached           |
| 500    | `internal_error`       | Unexpected error (details are logged) |

## Run the tests

```bash
pytest
```

Tests use a temporary SQLite file, so they never touch your PostgreSQL data.
