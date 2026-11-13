"""
Pydantic schemas for the product catalogue.

Schemas describe the JSON the API accepts and returns. FastAPI uses them to
validate requests automatically and to build the Swagger docs.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.category import CategoryRead

VerificationStatus = Literal["demo", "verified", "unverified"]
SortOption = Literal["price_asc", "price_desc", "newest", "name"]

SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"


def _check_url(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if not value.startswith(("http://", "https://")):
        raise ValueError("must start with http:// or https://")
    return value


def _blank_to_none(value: str | None) -> str | None:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


# ---------------------------------------------------------------------------
# Specifications
# ---------------------------------------------------------------------------
class SpecificationBase(BaseModel):
    processor: str | None = Field(default=None, max_length=200, examples=["10-core CPU, up to 4.8 GHz"])
    ram: str | None = Field(default=None, max_length=100, examples=["16 GB LPDDR5"])
    storage: str | None = Field(default=None, max_length=100, examples=["512 GB NVMe SSD"])
    battery: str | None = Field(default=None, max_length=100, examples=["72 Wh"])
    display: str | None = Field(default=None, max_length=200, examples=['14" 2880×1800 OLED, 120 Hz'])
    graphics: str | None = Field(default=None, max_length=200, description="Where applicable (mostly laptops)", examples=["Integrated"])

    _blank = field_validator("processor", "ram", "storage", "battery", "display", "graphics", mode="before")(_blank_to_none)


class SpecificationCreate(SpecificationBase):
    pass


class SpecificationUpdate(SpecificationBase):
    """Only the fields you send are changed."""


class SpecificationRead(SpecificationBase):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Products
# ---------------------------------------------------------------------------
class ProductCreate(BaseModel):
    """Body for POST /api/products."""

    name: str = Field(min_length=2, max_length=200, examples=["Aurora Book Pro 14"])
    brand: str = Field(min_length=1, max_length=100, examples=["Northwind"])
    model: str = Field(min_length=1, max_length=100, examples=["AB14-26"])
    category: str = Field(min_length=2, max_length=50, description="Category slug: `laptops` or `smartphones`", examples=["laptops"])
    price_inr: Decimal = Field(gt=0, max_digits=12, decimal_places=2, description="Price in Indian rupees", examples=[124990])
    image_url: str | None = Field(default=None, max_length=500, examples=["https://example.com/images/aurora-14.jpg"])
    source_url: str | None = Field(default=None, max_length=500, description="Where the price/specs were checked", examples=["https://example.com/products/aurora-14"])
    last_verified_date: date | None = Field(default=None, description="Date the details were last checked against the source (YYYY-MM-DD)")
    is_demo: bool = Field(default=False, description="Mark sample data so it is never shown as verified")
    slug: str | None = Field(
        default=None,
        max_length=120,
        pattern=SLUG_PATTERN,
        description="Optional unique ID. Generated from brand + model if left out.",
        examples=["northwind-ab14-26"],
    )
    specifications: SpecificationCreate = Field(default_factory=SpecificationCreate)

    _urls = field_validator("image_url", "source_url", mode="before")(_check_url)

    @field_validator("name", "brand", "model", "category", mode="before")
    @classmethod
    def strip_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("last_verified_date")
    @classmethod
    def not_in_future(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("cannot be in the future")
        return value


class ProductUpdate(BaseModel):
    """Body for PATCH /api/products/{id}. Every field is optional."""

    name: str | None = Field(default=None, min_length=2, max_length=200)
    brand: str | None = Field(default=None, min_length=1, max_length=100)
    model: str | None = Field(default=None, min_length=1, max_length=100)
    category: str | None = Field(default=None, min_length=2, max_length=50)
    price_inr: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    image_url: str | None = Field(default=None, max_length=500)
    source_url: str | None = Field(default=None, max_length=500)
    last_verified_date: date | None = None
    is_demo: bool | None = None
    specifications: SpecificationUpdate | None = None

    _urls = field_validator("image_url", "source_url", mode="before")(_check_url)

    @field_validator("last_verified_date")
    @classmethod
    def not_in_future(cls, value: date | None) -> date | None:
        if value and value > date.today():
            raise ValueError("cannot be in the future")
        return value


class ProductRead(BaseModel):
    """What the API returns for a product."""

    id: int
    slug: str
    name: str
    brand: str
    model: str
    category: CategoryRead
    price_inr: Decimal
    image_url: str | None
    specifications: SpecificationRead | None
    source_url: str | None
    last_verified_date: date | None
    is_demo: bool
    verification_status: VerificationStatus = Field(
        description="`demo` = sample data · `verified` = has source URL and verified date · `unverified` = not yet checked"
    )
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductList(BaseModel):
    items: list[ProductRead]
    total: int = Field(description="Total matching products (across all pages)")
    limit: int
    offset: int


class BrandCount(BaseModel):
    brand: str
    product_count: int


# ---------------------------------------------------------------------------
# CSV import
# ---------------------------------------------------------------------------
class ImportRowError(BaseModel):
    row: int = Field(description="Line number in the CSV file (the header is line 1)")
    slug: str | None = None
    messages: list[str]


class ImportResult(BaseModel):
    dry_run: bool
    total_rows: int
    created: int
    updated: int
    skipped: int
    failed: int
    errors: list[ImportRowError] = Field(description="Rows that could not be imported")
    skipped_rows: list[ImportRowError] = Field(description="Rows left unchanged (e.g. product already exists)")
