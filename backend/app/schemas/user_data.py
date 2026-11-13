"""Schemas for saved comparisons, favourites and search history."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.product import ProductRead


def _slugs(values: list[str]) -> list[str]:
    out: list[str] = []
    for v in values:
        v = v.strip()
        if v and v not in out:
            out.append(v)
    if not 1 <= len(out) <= 4:
        raise ValueError("A comparison needs 1 to 4 products")
    return out


class ComparisonCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120, examples=["Laptops for coding"])
    product_slugs: list[str] = Field(examples=[["northwind-ab14p-26", "kestrel-sa13-26"]])
    note: str | None = Field(default=None, max_length=500)

    _s = field_validator("product_slugs")(_slugs)

    @field_validator("title")
    @classmethod
    def tidy_title(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Title can’t be empty")
        return value


class ComparisonUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    product_slugs: list[str] | None = None
    note: str | None = Field(default=None, max_length=500)

    @field_validator("product_slugs")
    @classmethod
    def check_slugs(cls, value: list[str] | None) -> list[str] | None:
        return _slugs(value) if value is not None else None

    @field_validator("title")
    @classmethod
    def tidy_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = " ".join(value.split())
        if not value:
            raise ValueError("Title can’t be empty")
        return value


class ComparisonRead(BaseModel):
    id: int
    title: str
    note: str | None
    product_slugs: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FavouriteRead(BaseModel):
    product: ProductRead
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class HistoryCreate(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    filters: dict[str, Any] = Field(default_factory=dict, description="Category, budget, brands applied to the search")

    @field_validator("query")
    @classmethod
    def tidy(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Query can’t be empty")
        return value

    @field_validator("filters")
    @classmethod
    def small(cls, value: dict[str, Any]) -> dict[str, Any]:
        allowed = {"category", "min_price", "max_price", "brands"}
        return {k: v for k, v in value.items() if k in allowed}


class HistoryRead(BaseModel):
    id: int
    query: str
    filters: dict[str, Any]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
