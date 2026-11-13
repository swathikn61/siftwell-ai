"""Schemas for the recommendation engine (weighted, explainable scoring)."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.ai import ShoppingPreferences
from app.schemas.product import ProductRead

Criterion = Literal["processor", "ram", "battery", "storage", "display", "value"]


class RecommendationRequest(BaseModel):
    preferences: ShoppingPreferences
    weights: dict[Criterion, int] | None = Field(
        default=None,
        description="Base importance per criterion (0–100). Omitted criteria use the default. Normalised to 100%.",
        examples=[{"processor": 20, "ram": 15, "battery": 15, "storage": 10, "display": 15, "value": 25}],
    )
    adjust_for_usage: bool = Field(default=True, description="Boost weights based on the user's uses and priorities")
    sort: Literal["match", "price_asc", "price_desc", "name"] = "match"
    limit: int = Field(default=12, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

    @field_validator("weights")
    @classmethod
    def check_weights(cls, value: dict[str, int] | None) -> dict[str, int] | None:
        if value is None:
            return None
        if any(v < 0 or v > 100 for v in value.values()):
            raise ValueError("each weight must be between 0 and 100")
        if value and sum(value.values()) == 0 and len(value) == 6:
            raise ValueError("at least one weight must be above 0")
        return value


class CriterionScore(BaseModel):
    criterion: Criterion
    label: str
    score: float | None = Field(description="0–100, or null when the spec isn’t listed or can’t be compared")
    weight: float = Field(description="Effective weight in percent")
    contribution: float | None = Field(description="Points this criterion added to the total")
    value: str | None = Field(description="The spec as listed")
    detail: str = Field(description="How the score was calculated, or why it wasn’t")


class RequirementResult(BaseModel):
    text: str
    spec: str
    mandatory: bool
    met: bool | None = Field(description="null = the listing doesn’t show this spec")
    detail: str


class ScoredProduct(BaseModel):
    rank: int
    product: ProductRead
    score: float = Field(description="Overall match score out of 100")
    coverage: int = Field(description="Percent of the total weight that could be scored from listed specs")
    breakdown: list[CriterionScore]
    strengths: list[str]
    weaknesses: list[str]
    requirements: list[RequirementResult]
    summary: str


class ExcludedProduct(BaseModel):
    slug: str
    name: str
    price_inr: float
    reasons: list[str]


class WeightSummary(BaseModel):
    criterion: Criterion
    label: str
    base: float
    multiplier: float = Field(description="Combined usage/priority adjustment")
    effective: float = Field(description="Percent after adjustment and normalisation")


class WeightAdjustment(BaseModel):
    criterion: Criterion
    factor: float
    reason: str


class UncheckedRequirement(BaseModel):
    text: str
    reason: str


class ScaleInfo(BaseModel):
    category: str
    criterion: str
    scale: str


class RecommendationResponse(BaseModel):
    preferences: ShoppingPreferences = Field(description="The validated preferences that were used")
    items: list[ScoredProduct]
    total: int
    limit: int
    offset: int
    sort: str
    weights: list[WeightSummary]
    adjustments: list[WeightAdjustment]
    adjust_for_usage: bool
    excluded: list[ExcludedProduct] = Field(description="Products removed by must-have requirements")
    unchecked_requirements: list[UncheckedRequirement]
    scales: list[ScaleInfo] = Field(description="Reference scales used to turn specs into 0–100 scores")
    warnings: list[str]
    method: str
