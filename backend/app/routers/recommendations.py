"""Preference-aware product ranking (rule-based)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.recommendation import RecommendationRequest, RecommendationResponse
from app.services import recommendation_service

router = APIRouter(prefix="/api/recommendations", tags=["Recommendations"])


@router.post("", response_model=RecommendationResponse, summary="Rank products against shopping preferences")
def recommend(body: RecommendationRequest, db: Session = Depends(get_db)) -> RecommendationResponse:
    """
    Validates the preferences (Pydantic + catalogue check), filters products by
    category, budget and brands, then ranks them using only listed specs.

    Every result explains which preferences raised or lowered its position, and
    `not_used` lists preferences that couldn’t influence the ranking (with reasons).
    """
    prefs, warnings = recommendation_service.check_against_catalogue(db, body.preferences)
    return recommendation_service.recommend(db, prefs, sort=body.sort, limit=body.limit, offset=body.offset, warnings=warnings)
