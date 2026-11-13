"""
Saved comparisons, favourites and search history.

Ownership: every query is filtered by the current user's id. Asking for
someone else's item behaves exactly like asking for one that doesn't exist
(404), so ids from other accounts can't be probed.
"""

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.errors import InvalidFieldError, NotFoundError
from app.models.product import Product
from app.models.user import User
from app.models.user_data import Favourite, SavedComparison, SearchHistoryEntry
from app.schemas.user_data import ComparisonCreate, ComparisonUpdate, HistoryCreate

MAX_COMPARISONS = 100
MAX_HISTORY = 200


def _check_slugs_exist(db: Session, slugs: list[str]) -> None:
    found = set(db.scalars(select(Product.slug).where(Product.slug.in_(slugs))).all())
    missing = [s for s in slugs if s not in found]
    if missing:
        raise InvalidFieldError("product_slugs", f"Unknown product(s): {', '.join(missing)}")


# ---------------------------------------------------------------------------
# Saved comparisons
# ---------------------------------------------------------------------------
def list_comparisons(db: Session, user: User) -> list[SavedComparison]:
    query = select(SavedComparison).where(SavedComparison.user_id == user.id).order_by(SavedComparison.created_at.desc(), SavedComparison.id.desc())
    return list(db.scalars(query).all())


def get_comparison(db: Session, user: User, comparison_id: int) -> SavedComparison:
    item = db.scalar(select(SavedComparison).where(SavedComparison.id == comparison_id, SavedComparison.user_id == user.id))
    if item is None:
        raise NotFoundError("Saved comparison not found.")
    return item


def create_comparison(db: Session, user: User, data: ComparisonCreate) -> SavedComparison:
    _check_slugs_exist(db, data.product_slugs)
    count = db.scalar(select(func.count(SavedComparison.id)).where(SavedComparison.user_id == user.id)) or 0
    if count >= MAX_COMPARISONS:
        raise InvalidFieldError("title", f"You can save up to {MAX_COMPARISONS} comparisons. Delete some to save more.")
    item = SavedComparison(user_id=user.id, title=data.title, note=data.note, product_slugs=data.product_slugs)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_comparison(db: Session, user: User, comparison_id: int, data: ComparisonUpdate) -> SavedComparison:
    item = get_comparison(db, user, comparison_id)
    changes = data.model_dump(exclude_unset=True)
    if changes.get("product_slugs"):
        _check_slugs_exist(db, changes["product_slugs"])
    for field, value in changes.items():
        if field == "title" and value is None:
            continue
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


def delete_comparison(db: Session, user: User, comparison_id: int) -> None:
    item = get_comparison(db, user, comparison_id)
    db.delete(item)
    db.commit()


# ---------------------------------------------------------------------------
# Favourites
# ---------------------------------------------------------------------------
def list_favourites(db: Session, user: User) -> list[Favourite]:
    query = select(Favourite).where(Favourite.user_id == user.id).order_by(Favourite.created_at.desc(), Favourite.id.desc())
    return list(db.scalars(query).unique().all())


def add_favourite(db: Session, user: User, slug: str) -> tuple[Favourite, bool]:
    """Idempotent. Returns (favourite, created)."""
    product = db.scalar(select(Product).where(Product.slug == slug))
    if product is None:
        raise NotFoundError(f"Product '{slug}' was not found.")
    existing = db.scalar(select(Favourite).where(Favourite.user_id == user.id, Favourite.product_id == product.id))
    if existing:
        return existing, False
    fav = Favourite(user_id=user.id, product_id=product.id)
    db.add(fav)
    db.commit()
    db.refresh(fav)
    return fav, True


def remove_favourite(db: Session, user: User, slug: str) -> None:
    product_id = db.scalar(select(Product.id).where(Product.slug == slug))
    fav = db.scalar(select(Favourite).where(Favourite.user_id == user.id, Favourite.product_id == product_id)) if product_id else None
    if fav is None:
        raise NotFoundError("This product isn’t in your favourites.")
    db.delete(fav)
    db.commit()


# ---------------------------------------------------------------------------
# Search history
# ---------------------------------------------------------------------------
def list_history(db: Session, user: User, limit: int = 50) -> list[SearchHistoryEntry]:
    query = select(SearchHistoryEntry).where(SearchHistoryEntry.user_id == user.id).order_by(SearchHistoryEntry.created_at.desc(), SearchHistoryEntry.id.desc()).limit(limit)
    return list(db.scalars(query).all())


def add_history(db: Session, user: User, data: HistoryCreate) -> SearchHistoryEntry:
    latest = db.scalar(
        select(SearchHistoryEntry).where(SearchHistoryEntry.user_id == user.id).order_by(SearchHistoryEntry.created_at.desc(), SearchHistoryEntry.id.desc()).limit(1)
    )
    if latest and latest.query.lower() == data.query.lower():
        # Same search again: refresh it instead of adding a duplicate
        latest.filters = data.filters
        latest.created_at = func.now()
        db.commit()
        db.refresh(latest)
        return latest
    entry = SearchHistoryEntry(user_id=user.id, query=data.query, filters=data.filters)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    # Keep only the most recent entries
    old_ids = db.scalars(
        select(SearchHistoryEntry.id).where(SearchHistoryEntry.user_id == user.id)
        .order_by(SearchHistoryEntry.created_at.desc(), SearchHistoryEntry.id.desc()).offset(MAX_HISTORY)
    ).all()
    if old_ids:
        db.execute(delete(SearchHistoryEntry).where(SearchHistoryEntry.id.in_(old_ids)))
        db.commit()
    return entry


def delete_history_entry(db: Session, user: User, entry_id: int) -> None:
    entry = db.scalar(select(SearchHistoryEntry).where(SearchHistoryEntry.id == entry_id, SearchHistoryEntry.user_id == user.id))
    if entry is None:
        raise NotFoundError("Search history entry not found.")
    db.delete(entry)
    db.commit()


def clear_history(db: Session, user: User) -> int:
    result = db.execute(delete(SearchHistoryEntry).where(SearchHistoryEntry.user_id == user.id))
    db.commit()
    return result.rowcount or 0
