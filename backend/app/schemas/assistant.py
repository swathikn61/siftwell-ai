"""Schemas for the AI Decision Assistant (conversational Q&A about results)."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.ai import ShoppingPreferences
from app.schemas.recommendation import Criterion

MAX_PRODUCTS = 8
MAX_HISTORY = 10


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class AssistantContext(BaseModel):
    """What the user is looking at. Product facts are re-read from the database, never taken from here."""

    product_slugs: list[str] = Field(min_length=1, max_length=MAX_PRODUCTS, description="Products in the current results or comparison, in display order")
    preferences: ShoppingPreferences = Field(default_factory=ShoppingPreferences)
    weights: dict[Criterion, int] | None = None
    adjust_for_usage: bool = True

    @field_validator("product_slugs")
    @classmethod
    def unique_slugs(cls, value: list[str]) -> list[str]:
        seen: list[str] = []
        for slug in value:
            slug = slug.strip()
            if slug and slug not in seen:
                seen.append(slug)
        if not seen:
            raise ValueError("at least one product is required")
        return seen


class ChatRequest(BaseModel):
    question: str = Field(min_length=2, max_length=500, examples=["Why is this product ranked first?"])
    context: AssistantContext
    history: list[ChatMessage] = Field(default_factory=list, description="Earlier messages in this conversation (most recent last)")

    @field_validator("question")
    @classmethod
    def tidy(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Please type a question")
        return value

    @field_validator("history")
    @classmethod
    def keep_recent(cls, value: list[ChatMessage]) -> list[ChatMessage]:
        return value[-MAX_HISTORY:]


class CitedProduct(BaseModel):
    slug: str
    name: str


class ChatResponse(BaseModel):
    answer: str
    cited_products: list[CitedProduct] = Field(description="Products the answer refers to (only ones in the context)")
    unavailable: list[str] = Field(description="Things the user asked about that Siftwell has no data for")
    warnings: list[str] = Field(description="E.g. numbers in the answer that couldn’t be matched to Siftwell’s data")
    model: str
    duration_ms: int
    products_in_context: int
