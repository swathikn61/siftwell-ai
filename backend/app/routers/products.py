"""Product catalogue endpoints."""

from decimal import Decimal

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError
from app.database import get_db
from app.schemas.product import (
    BrandCount,
    ImportResult,
    ProductCreate,
    ProductList,
    ProductRead,
    ProductUpdate,
    SortOption,
)
from app.services import import_service, product_service
from app.services.product_service import ProductFilters

router = APIRouter(prefix="/api/products", tags=["Products"])

ERROR_404 = {404: {"description": "Product not found"}}
MAX_UPLOAD_BYTES = 2 * 1024 * 1024  # 2 MB


def common_filters(
    category: str | None = Query(default=None, description="Category slug, e.g. `laptops` or `smartphones`"),
    brand: list[str] = Query(default=[], description="Brand name. Repeat to filter by several: `?brand=Orbis&brand=Kestrel`"),
    min_price: Decimal | None = Query(default=None, ge=0, description="Minimum price in INR"),
    max_price: Decimal | None = Query(default=None, gt=0, description="Maximum price (budget) in INR"),
    include_demo: bool = Query(default=True, description="Set to false to hide demo/sample products"),
) -> ProductFilters:
    """Filters shared by the list and search endpoints."""
    return ProductFilters(category=category, brands=brand, min_price=min_price, max_price=max_price, include_demo=include_demo)


def to_page(items, total: int, limit: int, offset: int) -> ProductList:
    return ProductList(items=[ProductRead.model_validate(p) for p in items], total=total, limit=limit, offset=offset)


# Note: fixed paths like /search and /brands are declared before /{product_id}.

@router.get("", response_model=ProductList, summary="List products (with filters)")
def list_products(
    filters: ProductFilters = Depends(common_filters),
    sort: SortOption | None = Query(default=None, description="Sort order (default: name)"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> ProductList:
    items, total = product_service.list_products(db, filters, sort=sort, limit=limit, offset=offset)
    return to_page(items, total, limit, offset)


@router.get("/search", response_model=ProductList, summary="Search products by keyword")
def search_products(
    q: str = Query(min_length=1, max_length=100, description="Words to find in name, brand, model or specs, e.g. `oled 120` or `dedicated gpu`"),
    filters: ProductFilters = Depends(common_filters),
    sort: SortOption | None = Query(default=None, description="Sort order (default: best match)"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> ProductList:
    filters.search = q
    items, total = product_service.list_products(db, filters, sort=sort, limit=limit, offset=offset)
    return to_page(items, total, limit, offset)


@router.get("/brands", response_model=list[BrandCount], summary="List brands (for filter menus)")
def list_brands(
    category: str | None = Query(default=None, description="Only brands in this category"),
    db: Session = Depends(get_db),
) -> list[BrandCount]:
    return [BrandCount(brand=b, product_count=n) for b, n in product_service.list_brands(db, category)]


@router.get(
    "/import/template",
    summary="Download a CSV import template",
    response_class=Response,
    responses={200: {"content": {"text/csv": {}}, "description": "CSV file"}},
)
def download_import_template() -> Response:
    return Response(
        content=import_service.template_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="siftwell-products-template.csv"'},
    )


@router.post("/import", response_model=ImportResult, summary="Import products from a CSV file")
async def import_products(
    file: UploadFile = File(description="CSV file (UTF-8, max 2 MB, max 1,000 rows)"),
    update_existing: bool = Query(default=False, description="Overwrite products whose slug already exists"),
    dry_run: bool = Query(default=False, description="Check the file and report results without saving anything"),
    db: Session = Depends(get_db),
) -> ImportResult:
    """
    Required columns: `name, brand, model, category, price_inr`.
    Optional: `slug, image_url, processor, ram, storage, battery, display, graphics,
    source_url, last_verified_date, is_demo`.

    Valid rows are saved; invalid rows are listed in `errors` with their line number.
    """
    if not (file.filename or "").lower().endswith(".csv"):
        raise BadRequestError("Please upload a .csv file")
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise BadRequestError("File is too large. The limit is 2 MB.")
    return import_service.import_products_csv(db, content, update_existing=update_existing, dry_run=dry_run)


@router.get("/slug/{slug}", response_model=ProductRead, responses=ERROR_404, summary="Get one product by slug")
def get_product_by_slug(slug: str, db: Session = Depends(get_db)):
    return product_service.get_product_by_slug(db, slug)


@router.get("/{product_id}", response_model=ProductRead, responses=ERROR_404, summary="Get one product by ID")
def get_product(product_id: int, db: Session = Depends(get_db)):
    return product_service.get_product(db, product_id)


@router.post(
    "",
    response_model=ProductRead,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"description": "A product with this slug already exists"}},
    summary="Add a product",
)
def create_product(data: ProductCreate, db: Session = Depends(get_db)):
    return product_service.create_product(db, data)


@router.patch("/{product_id}", response_model=ProductRead, responses=ERROR_404, summary="Update a product")
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db)):
    return product_service.update_product(db, product_id, data)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT, responses=ERROR_404, summary="Delete a product")
def delete_product(product_id: int, db: Session = Depends(get_db)) -> None:
    product_service.delete_product(db, product_id)
