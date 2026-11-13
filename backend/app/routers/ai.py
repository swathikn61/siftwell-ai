"""AI endpoints. All AI logic lives in app/ai — these routes only wire it up."""

from functools import lru_cache

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.ai.gemini_client import GeminiClient
from app.ai.preference_extractor import PreferenceExtractor
from app.database import get_db
from app.schemas.ai import AIStatus, PreferenceRequest, PreferenceResponse, ShoppingPreferences
from app.services import product_service, recommendation_service

router = APIRouter(prefix="/api/ai", tags=["AI"])


@lru_cache
def _shared_client() -> GeminiClient:
    """One client for the whole app, so the HTTPS connection to Gemini is reused."""
    return GeminiClient()


def get_ai_client() -> GeminiClient:
    return _shared_client()


def get_extractor(client: GeminiClient = Depends(get_ai_client)) -> PreferenceExtractor:
    return PreferenceExtractor(client)


@router.get("/status", response_model=AIStatus, summary="Check the Gemini API connection")
def ai_status(client: GeminiClient = Depends(get_ai_client)) -> AIStatus:
    s = client.status()
    return AIStatus(available=s.configured and s.reachable, configured=s.configured, model=s.model, message=s.message)


@router.post("/preferences", response_model=PreferenceResponse, summary="Extract shopping preferences from a request")
def extract_preferences(
    body: PreferenceRequest,
    extractor: PreferenceExtractor = Depends(get_extractor),
    db: Session = Depends(get_db),
) -> PreferenceResponse:
    """
    Uses Gemini to read a request such as *“laptop under ₹70,000 for Java
    development … battery life is important”* and returns validated preferences
    plus ready-to-use search filters.

    If Gemini is unavailable, rate-limited, slow, or returns invalid data, a
    rule-based parser is used instead (`source: "rules"`) and `warnings` explains
    why. The AI never returns product specifications — only the user's preferences.
    """
    known_brands = [brand for brand, _ in product_service.list_brands(db)]
    return extractor.extract(body.query, known_brands=known_brands)


@router.post("/preferences/validate", response_model=PreferenceResponse, summary="Validate preferences edited by the user")
def validate_preferences(body: ShoppingPreferences, db: Session = Depends(get_db)) -> PreferenceResponse:
    """
    Runs user-edited preferences through the same Pydantic validation, checks the
    category and brands against the catalogue, and returns the matching search filters.
    """
    prefs, warnings = recommendation_service.check_against_catalogue(db, body)
    return PreferenceExtractor.from_user(prefs, warnings)
