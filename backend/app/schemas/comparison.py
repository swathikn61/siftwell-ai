"""Schemas for the rule-based product comparison."""

from pydantic import BaseModel, Field

from app.schemas.product import ProductRead


class SpecValue(BaseModel):
    slug: str
    display: str | None = Field(description="The spec as listed, or null if not listed")


class SpecComparison(BaseModel):
    key: str = Field(examples=["ram"])
    label: str = Field(examples=["RAM"])
    values: list[SpecValue]
    best: list[str] = Field(description="Slugs of the best product(s). Empty when the data doesn’t support a winner.")
    reason: str | None = Field(default=None, description="Why the best product(s) won", examples=["Most RAM: 32 GB"])
    not_compared: str | None = Field(default=None, description="Why no winner is highlighted", examples=["Not listed for Slate Air 13"])


class ProductAnalysis(BaseModel):
    slug: str
    advantages: list[str] = Field(description="Strengths relative to the other compared products")
    disadvantages: list[str] = Field(description="Weaknesses relative to the other compared products")
    specs_led: list[str] = Field(description="Labels of the specs this product is best at")
    missing_specs: list[str] = Field(description="Specs that aren’t listed for this product")


class ComparisonSummary(BaseModel):
    headline: str
    points: list[str]
    notes: list[str] = Field(description="Caveats: specs that couldn’t be compared, demo data, and so on")
    lowest_price: str | None = Field(description="Slug of the single cheapest product, if there is one")
    most_specs_led: str | None = Field(description="Slug of the product that leads the most specs, if there is a single one")
    compared_specs: int = Field(description="How many specs had a supported winner")


class ComparisonResponse(BaseModel):
    products: list[ProductRead]
    missing: list[str] = Field(description="Requested slugs that don’t exist")
    specs: list[SpecComparison]
    analysis: list[ProductAnalysis]
    summary: ComparisonSummary
    method: str
