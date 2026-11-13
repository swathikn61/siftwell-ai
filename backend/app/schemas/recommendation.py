"""Schemas for rule-based recommendations (preference-aware ranking)."""

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.ai import ShoppingPreferences
from app.schemas.product import ProductRead


class Reason(BaseModel):
    factor: str = Field(description="Key of the ranking factor this reason belongs to")
    effect: Literal["positive", "negative", "neutral", "unknown"]
    text: str = Field(examples=["RAM 16 GB meets “At least 16 GB”"])


class RankedProduct(BaseModel):
    product: ProductRead
    score: float = Field(description="Higher is a better match. Only meaningful within one result set.")
    reasons: list[Reason] = Field(description="How each ranking factor affected this product")


class RankingFactor(BaseModel):
    key: str
    label: str = Field(examples=["RAM: At least 16 GB"])
    source: Literal["priority", "suggestion"] = Field(description="`priority` = stated by the user · `suggestion` = AI hardware guideline")
    kind: Literal["threshold", "relative", "feature"]
    description: str


class NotUsed(BaseModel):
    label: str
    reason: str


class RecommendationRequest(BaseModel):
    preferences: ShoppingPreferences
    sort: Literal["match", "price_asc", "price_desc", "name"] = "match"
    limit: int = Field(default=12, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class RecommendationResponse(BaseModel):
    preferences: ShoppingPreferences = Field(description="The validated preferences that were used")
    items: list[RankedProduct]
    total: int
    limit: int
    offset: int
    ranking_factors: list[RankingFactor] = Field(description="Preferences that actually influenced the order")
    not_used: list[NotUsed] = Field(description="Preferences that couldn’t influence ranking, and why")
    sort: str
    warnings: list[str]
    method: str
