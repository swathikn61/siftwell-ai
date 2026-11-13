"""Product endpoints (CRUD). A simple resource to prove the database works end to end."""

from decimal import Decimal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.product import Category, ProductCreate, ProductList, ProductRead, ProductUpdate
from app.services import product_service

router = APIRouter(prefix="/api/products", tags=["Products"])

ERROR_404 = {404: {"description": "Product not found"}}


@router.get("", response_model=ProductList, summary="List products")
def list_products(
    category: Category | None = Query(default=None, description="Filter by category"),
    max_price: Decimal | None = Query(default=None, gt=0, description="Only products at or below this price"),
    search: str | None = Query(default=None, min_length=1, max_length=100, description="Search name, brand or tagline"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> ProductList:
    items, total = product_service.list_products(
        db, category=category, max_price=max_price, search=search, limit=limit, offset=offset
    )
    return ProductList(items=[ProductRead.model_validate(p) for p in items], total=total, limit=limit, offset=offset)


@router.get("/{product_id}", response_model=ProductRead, responses=ERROR_404, summary="Get one product")
def get_product(product_id: int, db: Session = Depends(get_db)):
    return product_service.get_product(db, product_id)


@router.post(
    "",
    response_model=ProductRead,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "Slug already exists"}},
    summary="Create a product",
)
def create_product(data: ProductCreate, db: Session = Depends(get_db)):
    return product_service.create_product(db, data)


@router.patch("/{product_id}", response_model=ProductRead, responses=ERROR_404, summary="Update a product")
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db)):
    return product_service.update_product(db, product_id, data)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, responses=ERROR_404, summary="Delete a product")
def delete_product(product_id: int, db: Session = Depends(get_db)) -> None:
    product_service.delete_product(db, product_id)
