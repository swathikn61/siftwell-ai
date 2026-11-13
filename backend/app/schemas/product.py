"""
Pydantic schemas for products.

Schemas describe the JSON the API accepts and returns. FastAPI uses them to
validate requests automatically and to build the Swagger docs.
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal["laptops", "smartphones", "headphones", "smartwatches", "cameras", "monitors", "tablets", "home"]


class ProductBase(BaseModel):
    name: str = Field(min_length=2, max_length=200, examples=["Aurora Book Pro 14"])
    brand: str = Field(min_length=1, max_length=100, examples=["Northwind"])
    category: Category = Field(examples=["laptops"])
    price: Decimal = Field(gt=0, max_digits=10, decimal_places=2, examples=[1299])
    rating: float = Field(default=0, ge=0, le=5, examples=[4.7])
    review_count: int = Field(default=0, ge=0, examples=[2184])
    tagline: str = Field(default="", max_length=300, examples=["Balanced performance with an all-day battery"])
    specs: dict[str, str] = Field(default_factory=dict, examples=[{"Memory": "16 GB", "Battery": "18 hours"}])
    pros: list[str] = Field(default_factory=list, examples=[["18-hour battery life"]])
    cons: list[str] = Field(default_factory=list, examples=[["Soldered RAM"]])
    tags: list[str] = Field(default_factory=list, examples=[["coding", "portable"]])


class ProductCreate(ProductBase):
    """Body for POST /api/products."""

    slug: str = Field(
        min_length=2,
        max_length=80,
        pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$",
        description="URL-friendly unique ID: lowercase letters, numbers and dashes",
        examples=["aurora-book-pro-14"],
    )


class ProductUpdate(BaseModel):
    """Body for PATCH /api/products/{id}. Every field is optional."""

    name: str | None = Field(default=None, min_length=2, max_length=200)
    brand: str | None = Field(default=None, min_length=1, max_length=100)
    category: Category | None = None
    price: Decimal | None = Field(default=None, gt=0, max_digits=10, decimal_places=2)
    rating: float | None = Field(default=None, ge=0, le=5)
    review_count: int | None = Field(default=None, ge=0)
    tagline: str | None = Field(default=None, max_length=300)
    specs: dict[str, str] | None = None
    pros: list[str] | None = None
    cons: list[str] | None = None
    tags: list[str] | None = None


class ProductRead(ProductBase):
    """What the API returns for a product."""

    id: int
    slug: str
    created_at: datetime
    updated_at: datetime

    # Lets Pydantic read data straight from SQLAlchemy objects
    model_config = ConfigDict(from_attributes=True)


class ProductList(BaseModel):
    items: list[ProductRead]
    total: int
    limit: int
    offset: int
