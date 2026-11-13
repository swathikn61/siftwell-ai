# Siftwell

AI-powered product comparison platform (in development).

- **Frontend:** React + TypeScript + Vite + Tailwind CSS (this folder)
- **Backend:** FastAPI + PostgreSQL ([backend/](backend/README.md))

## Run locally

1. **Start the backend** (see [backend/README.md](backend/README.md) for first-time setup):

   ```bash
   cd backend
   source .venv/bin/activate
   uvicorn app.main:app --reload
   ```

   The API runs at http://localhost:8000 (Swagger UI at `/docs`).
   For AI search, add `GEMINI_API_KEY` to `backend/.env` (see
   [backend/README.md](backend/README.md#ai-preference-extraction-google-gemini)).
   Without a key, search still works using basic text matching.

2. **Start the frontend** in another terminal, from this folder:

   ```bash
   npm install
   npm run dev
   ```

   Open http://localhost:5173. Log in with any email, or use “Explore with the demo account”.

The frontend calls the API at `http://localhost:8000` by default. To use a different
address, copy `.env.example` to `.env.local` and change `VITE_API_URL`.

## What comes from where

| Data                                   | Source                                   |
| -------------------------------------- | ---------------------------------------- |
| Products, categories, brands, search   | Backend API (PostgreSQL)                 |
| Understanding search requests          | Backend → Google Gemini (key stays on the server) |
| Saved comparisons, saved products, compare list, profile, preferences | Browser storage (no accounts yet) |
| Login                                  | Simulated in the browser                 |

All catalogue products are currently **fictional demo data** and are labelled
“Demo data” throughout the app.
