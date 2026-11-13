"""
Business logic for products.

Routers stay thin: they parse the request and call a function here. Keeping
database work in services makes it easy to reuse and test.
"""

from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate


def list_products(
    db: Session,
    *,
    category: str | None = None,
    max_price: Decimal | None = None,
    search: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> tuple[list[Product], int]:
    """Return one page of products plus the total number that match the filters."""
    query = select(Product)
    if category:
        query = query.where(Product.category == category)
    if max_price is not None:
        query = query.where(Product.price <= max_price)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(or_(Product.name.ilike(pattern), Product.brand.ilike(pattern), Product.tagline.ilike(pattern)))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = db.scalars(query.order_by(Product.id).limit(limit).offset(offset)).all()
    return list(items), total


def get_product(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if product is None:
        raise NotFoundError(f"Product {product_id} was not found")
    return product


def create_product(db: Session, data: ProductCreate) -> Product:
    if db.scalar(select(Product.id).where(Product.slug == data.slug)) is not None:
        raise ConflictError(f"A product with slug '{data.slug}' already exists")
    product = Product(**data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def update_product(db: Session, product_id: int, data: ProductUpdate) -> Product:
    product = get_product(db, product_id)
    # exclude_unset: only change fields the client actually sent
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


def delete_product(db: Session, product_id: int) -> None:
    product = get_product(db, product_id)
    db.delete(product)
    db.commit()
