"""Category endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.category import CategoryWithCount
from app.services import category_service

router = APIRouter(prefix="/api/categories", tags=["Categories"])


@router.get("", response_model=list[CategoryWithCount], summary="List categories")
def list_categories(db: Session = Depends(get_db)) -> list[CategoryWithCount]:
    return [
        CategoryWithCount(slug=c.slug, name=c.name, description=c.description, product_count=count)
        for c, count in category_service.list_categories_with_counts(db)
    ]
