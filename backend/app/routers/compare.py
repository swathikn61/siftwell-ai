"""Product comparison endpoint (rule-based, no AI)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError
from app.database import get_db
from app.schemas.comparison import ComparisonResponse
from app.services.comparison_service import MAX_COMPARE, compare_products

router = APIRouter(prefix="/api/compare", tags=["Compare"])


@router.get("", response_model=ComparisonResponse, summary="Compare up to four products")
def compare(
    products: list[str] = Query(
        description="Product slugs to compare (1–4). Repeat the parameter: `?products=a&products=b`",
        examples=["northwind-ab14p-26"],
    ),
    db: Session = Depends(get_db),
) -> ComparisonResponse:
    """
    Compares price, processor, RAM, storage, battery, display and graphics.

    A product is marked **best** for a spec only when every compared product
    lists that spec in a comparable form and the values differ. Otherwise the
    spec's `not_compared` field explains why there's no winner. Advantages,
    disadvantages and the summary are derived from the same rules.
    """
    slugs = list(dict.fromkeys(s.strip() for s in products if s.strip()))
    if not slugs:
        raise BadRequestError("Choose at least one product to compare.")
    if len(slugs) > MAX_COMPARE:
        raise BadRequestError(f"You can compare up to {MAX_COMPARE} products at once (got {len(slugs)}).")
    return compare_products(db, slugs)
