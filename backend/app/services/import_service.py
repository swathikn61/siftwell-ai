"""
CSV import for products.

The CSV needs a header row. Required columns:
    name, brand, model, category, price_inr
Optional columns:
    slug, image_url, processor, ram, storage, battery, display, graphics,
    source_url, last_verified_date (YYYY-MM-DD), is_demo (true/false)

Every row is validated with the same rules as POST /api/products. Valid rows
are imported; invalid rows are reported with their line number.
"""

import csv
import io
from typing import Any

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import BadRequestError
from app.models.category import Category
from app.models.product import Product
from app.schemas.product import ImportResult, ImportRowError, ProductCreate
from app.services.product_service import apply_update, build_product, make_slug

REQUIRED_COLUMNS = ["name", "brand", "model", "category", "price_inr"]
SPEC_COLUMNS = ["processor", "ram", "storage", "battery", "display", "graphics"]
OPTIONAL_COLUMNS = ["slug", "image_url", *SPEC_COLUMNS, "source_url", "last_verified_date", "is_demo"]
ALL_COLUMNS = REQUIRED_COLUMNS + OPTIONAL_COLUMNS

MAX_ROWS = 1000
TRUE_VALUES = {"true", "yes", "y", "1"}
FALSE_VALUES = {"false", "no", "n", "0", ""}


def template_csv() -> str:
    """A CSV header plus one example row, for people starting an import file."""
    example = {
        "name": "Example Laptop 14", "brand": "ExampleBrand", "model": "EX14", "category": "laptops",
        "price_inr": "59999", "slug": "", "image_url": "", "processor": "8-core CPU", "ram": "16 GB",
        "storage": "512 GB SSD", "battery": "60 Wh", "display": '14" FHD IPS', "graphics": "Integrated",
        "source_url": "", "last_verified_date": "", "is_demo": "true",
    }
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=ALL_COLUMNS)
    writer.writeheader()
    writer.writerow(example)
    return buffer.getvalue()


def _clean_price(value: str) -> str:
    # Accept "₹1,24,990", "INR 124990", "124990.00"
    return value.replace("₹", "").replace("INR", "").replace("Rs.", "").replace(",", "").strip()


def _parse_bool(value: str, line: int) -> bool:
    text = value.strip().lower()
    if text in TRUE_VALUES:
        return True
    if text in FALSE_VALUES:
        return False
    raise ValueError(f"is_demo: '{value}' is not true/false")


def _row_to_payload(row: dict[str, str], line: int) -> dict[str, Any]:
    get = lambda key: (row.get(key) or "").strip()  # noqa: E731
    payload: dict[str, Any] = {
        "name": get("name"),
        "brand": get("brand"),
        "model": get("model"),
        "category": get("category").lower(),
        "price_inr": _clean_price(get("price_inr")),
        "image_url": get("image_url") or None,
        "source_url": get("source_url") or None,
        "last_verified_date": get("last_verified_date") or None,
        "is_demo": _parse_bool(get("is_demo"), line),
        "slug": get("slug") or None,
        "specifications": {key: get(key) or None for key in SPEC_COLUMNS},
    }
    return payload


def _format_errors(exc: ValidationError) -> list[str]:
    messages = []
    for err in exc.errors():
        field = ".".join(str(p) for p in err["loc"] if p != "specifications") or "row"
        messages.append(f"{field}: {err['msg']}")
    return messages


def import_products_csv(db: Session, content: bytes, *, update_existing: bool = False, dry_run: bool = False) -> ImportResult:
    # 1. Decode and read the header
    try:
        text = content.decode("utf-8-sig")  # utf-8-sig also removes Excel's BOM
    except UnicodeDecodeError:
        raise BadRequestError("The file must be UTF-8 encoded CSV")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise BadRequestError("The CSV file is empty")
    reader.fieldnames = [(name or "").strip().lower() for name in reader.fieldnames]
    missing = [col for col in REQUIRED_COLUMNS if col not in reader.fieldnames]
    if missing:
        raise BadRequestError(
            f"Missing required column(s): {', '.join(missing)}",
            details={"required": REQUIRED_COLUMNS, "optional": OPTIONAL_COLUMNS, "found": reader.fieldnames},
        )

    rows = list(reader)
    if len(rows) > MAX_ROWS:
        raise BadRequestError(f"Too many rows: {len(rows)}. The limit is {MAX_ROWS} per file.")

    categories = {c.slug: c for c in db.scalars(select(Category)).all()}
    result = ImportResult(dry_run=dry_run, total_rows=0, created=0, updated=0, skipped=0, failed=0, errors=[], skipped_rows=[])
    seen_slugs: set[str] = set()

    # 2. Validate and import row by row
    for index, row in enumerate(rows):
        line = index + 2  # +1 for the header, +1 because lines start at 1
        if not any((value or "").strip() for value in row.values() if isinstance(value, str)):
            continue  # ignore completely blank lines
        result.total_rows += 1

        def fail(messages: list[str], slug: str | None = None) -> None:
            result.failed += 1
            result.errors.append(ImportRowError(row=line, slug=slug, messages=messages))

        try:
            payload = _row_to_payload(row, line)
            data = ProductCreate.model_validate(payload)
        except ValueError as exc:  # ValidationError is a subclass of ValueError
            fail(_format_errors(exc) if isinstance(exc, ValidationError) else [str(exc)])
            continue

        slug = data.slug or make_slug(data.brand, data.model)
        category = categories.get(data.category)
        if category is None:
            fail([f"category: unknown category '{data.category}'. Available: {', '.join(sorted(categories))}"], slug)
            continue
        if slug in seen_slugs:
            fail([f"slug: '{slug}' appears more than once in this file"], slug)
            continue
        seen_slugs.add(slug)

        existing = db.scalar(select(Product).where(Product.slug == slug))
        if existing is None:
            result.created += 1
            if not dry_run:
                db.add(build_product(data.model_copy(update={"slug": slug}), category))
        elif update_existing:
            result.updated += 1
            if not dry_run:
                apply_update(existing, data.model_dump(), category)
        else:
            result.skipped += 1
            result.skipped_rows.append(
                ImportRowError(row=line, slug=slug, messages=["Product already exists. Use update_existing=true to overwrite it."])
            )

    # 3. Save everything in one transaction (or nothing, for a dry run)
    if dry_run:
        db.rollback()
    else:
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
    return result
