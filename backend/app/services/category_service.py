"""Category logic: default categories, lookups and counts."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import InvalidFieldError
from app.models.category import Category
from app.models.product import Product

# Siftwell starts with two categories. Add more here later.
DEFAULT_CATEGORIES = [
    {"slug": "laptops", "name": "Laptops", "description": "Ultrabooks, gaming laptops and everyday notebooks"},
    {"slug": "smartphones", "name": "Smartphones", "description": "Flagship, mid-range and budget phones"},
]


def ensure_default_categories(db: Session) -> None:
    """Insert the default categories if they don't exist yet (safe to run many times)."""
    existing = set(db.scalars(select(Category.slug)).all())
    for data in DEFAULT_CATEGORIES:
        if data["slug"] not in existing:
            db.add(Category(**data))
    db.commit()


def get_category_by_slug(db: Session, slug: str) -> Category:
    category = db.scalar(select(Category).where(Category.slug == slug.strip().lower()))
    if category is None:
        available = ", ".join(db.scalars(select(Category.slug).order_by(Category.slug)).all())
        raise InvalidFieldError("category", f"Unknown category '{slug}'. Available: {available}")
    return category


def list_categories_with_counts(db: Session) -> list[tuple[Category, int]]:
    query = (
        select(Category, func.count(Product.id))
        .outerjoin(Product, Product.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.name)
    )
    return [(category, count) for category, count in db.execute(query).all()]
