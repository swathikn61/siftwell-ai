"""
Business logic for products: create, read, update, delete, filter and search.

Routers stay thin: they parse the request and call a function here.
"""

import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy import Select, case, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError, ConflictError, NotFoundError
from app.models.category import Category
from app.models.product import Product
from app.models.specification import ProductSpecification
from app.schemas.product import ProductCreate, ProductUpdate
from app.services.category_service import get_category_by_slug


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def make_slug(*parts: str) -> str:
    """'Northwind', 'AB14-26' -> 'northwind-ab14-26'"""
    text = " ".join(parts).lower()
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:120]


def slug_exists(db: Session, slug: str) -> bool:
    return db.scalar(select(Product.id).where(Product.slug == slug)) is not None


def build_product(data: ProductCreate, category: Category) -> Product:
    """Create (but don't save) a Product + its specifications from validated input."""
    fields = data.model_dump(exclude={"category", "specifications", "slug"})
    product = Product(**fields, slug=data.slug or make_slug(data.brand, data.model), category=category)
    product.specifications = ProductSpecification(**data.specifications.model_dump())
    return product


def apply_update(product: Product, changes: dict[str, Any], category: Category | None) -> None:
    """Copy changed fields onto an existing product (used by PATCH and CSV import)."""
    spec_changes = changes.pop("specifications", None) or {}
    changes.pop("category", None)
    changes.pop("slug", None)  # slugs are permanent IDs
    for name, value in changes.items():
        setattr(product, name, value)
    if category is not None:
        product.category = category
    if spec_changes:
        if product.specifications is None:
            product.specifications = ProductSpecification()
        for name, value in spec_changes.items():
            setattr(product.specifications, name, value)


# ---------------------------------------------------------------------------
# Filtering and search
# ---------------------------------------------------------------------------
@dataclass
class ProductFilters:
    category: str | None = None
    brands: list[str] = field(default_factory=list)
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    search: str | None = None
    include_demo: bool = True


SEARCH_FIELDS = [
    Product.name,
    Product.brand,
    Product.model,
    ProductSpecification.processor,
    ProductSpecification.ram,
    ProductSpecification.storage,
    ProductSpecification.battery,
    ProductSpecification.display,
    ProductSpecification.graphics,
]


def _apply_filters(query: Select, filters: ProductFilters) -> Select:
    if filters.min_price is not None and filters.max_price is not None and filters.min_price > filters.max_price:
        raise BadRequestError("min_price cannot be greater than max_price")

    query = query.join(Category, Product.category_id == Category.id).outerjoin(
        ProductSpecification, ProductSpecification.product_id == Product.id
    )
    if filters.category:
        query = query.where(Category.slug == filters.category.strip().lower())
    brands = [b.strip().lower() for b in filters.brands if b.strip()]
    if brands:
        query = query.where(func.lower(Product.brand).in_(brands))
    if filters.min_price is not None:
        query = query.where(Product.price_inr >= filters.min_price)
    if filters.max_price is not None:
        query = query.where(Product.price_inr <= filters.max_price)
    if not filters.include_demo:
        query = query.where(Product.is_demo.is_(False))
    if filters.search:
        # Every word must appear in at least one searchable field:
        # "oled 120" matches products whose specs mention both "oled" and "120".
        for word in filters.search.split():
            pattern = f"%{word}%"
            query = query.where(or_(*(column.ilike(pattern) for column in SEARCH_FIELDS)))
    return query


def list_products(
    db: Session,
    filters: ProductFilters,
    *,
    sort: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Product], int]:
    """Return one page of products plus the total number that match the filters."""
    total = db.scalar(_apply_filters(select(func.count(Product.id)), filters)) or 0

    query = _apply_filters(select(Product), filters)
    if sort == "price_asc":
        query = query.order_by(Product.price_inr.asc(), Product.id)
    elif sort == "price_desc":
        query = query.order_by(Product.price_inr.desc(), Product.id)
    elif sort == "newest":
        query = query.order_by(Product.created_at.desc(), Product.id.desc())
    elif sort == "name":
        query = query.order_by(Product.name, Product.id)
    elif filters.search:
        # Simple relevance: products whose name contains the whole phrase come first
        phrase_in_name = case((Product.name.ilike(f"%{filters.search.strip()}%"), 0), else_=1)
        query = query.order_by(phrase_in_name, Product.name, Product.id)
    else:
        query = query.order_by(Product.name, Product.id)

    items = db.scalars(query.limit(limit).offset(offset)).unique().all()
    return list(items), total


def list_brands(db: Session, category: str | None = None) -> list[tuple[str, int]]:
    query = select(Product.brand, func.count(Product.id)).join(Category, Product.category_id == Category.id)
    if category:
        query = query.where(Category.slug == category.strip().lower())
    query = query.group_by(Product.brand).order_by(Product.brand)
    return [(brand, count) for brand, count in db.execute(query).all()]


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------
def get_product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise NotFoundError(f"Product {product_id} was not found")
    return product


def get_product_by_slug(db: Session, slug: str) -> Product:
    product = db.scalar(select(Product).where(Product.slug == slug))
    if product is None:
        raise NotFoundError(f"Product '{slug}' was not found")
    return product


def create_product(db: Session, data: ProductCreate) -> Product:
    category = get_category_by_slug(db, data.category)
    product = build_product(data, category)
    if slug_exists(db, product.slug):
        raise ConflictError(
            f"A product with slug '{product.slug}' already exists",
            details={"hint": "Use a different slug, or PATCH the existing product."},
        )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def update_product(db: Session, product_id: int, data: ProductUpdate) -> Product:
    product = get_product(db, product_id)
    changes = data.model_dump(exclude_unset=True)  # only fields the client sent
    if "specifications" in changes and data.specifications is not None:
        changes["specifications"] = data.specifications.model_dump(exclude_unset=True)
    category = get_category_by_slug(db, changes["category"]) if changes.get("category") else None
    apply_update(product, changes, category)
    db.commit()
    db.refresh(product)
    return product


def delete_product(db: Session, product_id: int) -> None:
    product = get_product(db, product_id)
    db.delete(product)
    db.commit()
