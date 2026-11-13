"""Preference-aware product ranking (rule-based)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.recommendation import RecommendationRequest, RecommendationResponse
from app.services import recommendation_service

router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


@router.post("", response_model=RecommendationResponse, summary="Score and rank products against shopping preferences")
def recommend(body: RecommendationRequest, db: Session = Depends(get_db)) -> RecommendationResponse:
    """
    Validates the preferences (Pydantic + catalogue check), filters products by
    category, budget, brands and must-have requirements, then scores each product
    out of 100 with deterministic Python rules:

    - criteria: processor, RAM, battery, storage, display, value for money
    - weights: defaults or `weights`, adjusted for the user's uses/priorities
      (turn off with `adjust_for_usage: false`)
    - every product includes a per-criterion breakdown, strengths, weaknesses and
      a summary; specs that aren't listed are not scored (see `coverage`)
    """
    prefs, warnings = recommendation_service.check_against_catalogue(db, body.preferences)
    return recommendation_service.recommend(
        db, prefs, weights=body.weights, adjust_for_usage=body.adjust_for_usage,
        sort=body.sort, limit=body.limit, offset=body.offset, warnings=warnings,
    )
