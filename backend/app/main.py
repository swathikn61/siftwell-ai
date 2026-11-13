"""
Siftwell API — application entry point.

Run it from the `backend/` folder with:
    uvicorn app.main:app --reload
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app import __version__
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.database import SessionLocal, create_tables
from app.routers import ai, assistant, categories, compare, health, products, recommendations
from app.services.category_service import ensure_default_categories

logging.basicConfig(level=logging.DEBUG if settings.debug else logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
# Keep low-level HTTP libraries quiet, even in debug mode (less noise, and no
# chance of request details such as API headers ending up in logs)
for noisy in ("httpx", "httpcore"):
    logging.getLogger(noisy).setLevel(logging.WARNING)
logger = logging.getLogger("siftwell")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Code that runs once when the server starts (before `yield`) and stops (after)."""
    try:
        create_tables()
        with SessionLocal() as db:
            ensure_default_categories(db)
        logger.info("Database connected and tables are ready")
    except Exception as exc:
        # Keep the server running so /api/health can report the problem
        logger.error("Could not connect to the database: %s", exc)
    yield
    # Close the shared Gemini HTTP connection on shutdown
    if ai._shared_client.cache_info().currsize:
        ai._shared_client().close()


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description="Backend API for Siftwell, the AI-powered product comparison platform.",
    lifespan=lifespan,
)

# CORS: allow the React frontend (Vite dev server) to call this API from the browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

app.include_router(health.router)
app.include_router(categories.router)
app.include_router(products.router)
app.include_router(compare.router)
app.include_router(ai.router)
app.include_router(recommendations.router)
app.include_router(assistant.router)


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    """Visiting the base URL opens the Swagger UI."""
    return RedirectResponse(url="/docs")
