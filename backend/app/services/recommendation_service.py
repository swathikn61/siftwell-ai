"""
Recommendation service: reads matching products from PostgreSQL, filters them,
and hands them to the deterministic scoring engine (scoring_engine.py).

The AI (Gemini) never scores or ranks anything — it only extracted the
preferences that arrive here, and those are validated first.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.product import Product
from app.schemas.ai import ShoppingPreferences
from app.schemas.product import ProductRead
from app.schemas.recommendation import (
    CriterionScore,
    ExcludedProduct,
    RecommendationResponse,
    RequirementResult,
    ScaleInfo,
    ScoredProduct,
    UncheckedRequirement,
    WeightAdjustment,
    WeightSummary,
)
from app.services import scoring_engine as engine

MAX_CANDIDATES = 500
METHOD = (
    "Scores are calculated with fixed rules from the listed specifications only (no AI). "
    "Each criterion is placed on a published 0–100 scale, then combined using the weights shown. "
    "Specs that aren’t listed are not scored. Hardware guidelines are suggestions, not verified requirements."
)


def to_input(p: Product) -> engine.ProductInput:
    s = p.specifications
    return engine.ProductInput(
        slug=p.slug,
        name=p.name,
        category=p.category.slug,
        price=float(p.price_inr),
        processor=s.processor if s else None,
        ram=s.ram if s else None,
        storage=s.storage if s else None,
        battery=s.battery if s else None,
        display=s.display if s else None,
        graphics=s.graphics if s else None,
    )


def fetch_candidates(db: Session, prefs: ShoppingPreferences) -> list[Product]:
    """Products that match the category, budget and brands (the hard filters)."""
    query = select(Product).join(Category, Product.category_id == Category.id)
    if prefs.category:
        query = query.where(Category.slug == prefs.category)
    if prefs.min_budget_inr is not None:
        query = query.where(Product.price_inr >= prefs.min_budget_inr)
    if prefs.max_budget_inr is not None:
        query = query.where(Product.price_inr <= prefs.max_budget_inr)
    if prefs.brands:
        query = query.where(func.lower(Product.brand).in_([b.lower() for b in prefs.brands]))
    return list(db.scalars(query.order_by(Product.id).limit(MAX_CANDIDATES)).unique().all())


def recommend(
    db: Session,
    prefs: ShoppingPreferences,
    *,
    weights: dict[str, int] | None = None,
    adjust_for_usage: bool = True,
    sort: str = "match",
    limit: int = 12,
    offset: int = 0,
    warnings: list[str] | None = None,
) -> RecommendationResponse:
    candidates = fetch_candidates(db, prefs)
    by_slug = {p.slug: p for p in candidates}
    result = engine.score_products([to_input(p) for p in candidates], prefs, weights, adjust_for_usage)

    items = result.items
    if sort == "price_asc":
        items = sorted(items, key=lambda i: i.product.price)
    elif sort == "price_desc":
        items = sorted(items, key=lambda i: -i.product.price)
    elif sort == "name":
        items = sorted(items, key=lambda i: i.product.name)

    categories = sorted({p.category.slug for p in candidates}) or ([prefs.category] if prefs.category else [])
    scales = [
        ScaleInfo(category=cat, criterion=name, scale=scale.describe())
        for cat in categories if cat in engine.SCALES
        for name, scale in engine.SCALES[cat].items()
    ]

    return RecommendationResponse(
        preferences=prefs,
        items=[
            ScoredProduct(
                rank=i.rank,
                product=ProductRead.model_validate(by_slug[i.product.slug]),
                score=i.score,
                coverage=i.coverage,
                breakdown=[
                    CriterionScore(criterion=r.criterion, label=engine.LABELS[r.criterion], score=r.score, weight=r.weight,
                                   contribution=r.contribution, value=r.value, detail=r.detail)
                    for r in i.breakdown
                ],
                strengths=i.strengths,
                weaknesses=i.weaknesses,
                requirements=[RequirementResult(text=c.text, spec=c.spec, mandatory=c.mandatory, met=c.met, detail=c.detail) for c in i.requirements],
                summary=i.summary,
            )
            for i in items[offset: offset + limit]
        ],
        total=len(items),
        limit=limit,
        offset=offset,
        sort=sort,
        weights=[WeightSummary(criterion=w.criterion, label=engine.LABELS[w.criterion], base=w.base, multiplier=w.multiplier, effective=w.effective) for w in result.weights],
        adjustments=[WeightAdjustment(criterion=a.criterion, factor=a.factor, reason=a.reason) for a in result.adjustments],
        adjust_for_usage=adjust_for_usage,
        excluded=[ExcludedProduct(slug=e.product.slug, name=e.product.name, price_inr=e.product.price, reasons=e.reasons) for e in result.excluded],
        unchecked_requirements=[UncheckedRequirement(text=t, reason=r) for t, r in result.unchecked_requirements],
        scales=scales,
        warnings=(warnings or []) + result.warnings,
        method=METHOD,
    )


def check_against_catalogue(db: Session, prefs: ShoppingPreferences) -> tuple[ShoppingPreferences, list[str]]:
    """
    Validate user-edited preferences against the catalogue before filtering:
    the category must exist, and brands are matched case-insensitively to real
    brand names (unknown brands are removed with a warning).
    """
    warnings: list[str] = []
    data = prefs.model_dump()
    if prefs.category and db.scalar(select(Category.id).where(Category.slug == prefs.category)) is None:
        warnings.append(f"Category “{prefs.category}” isn’t in the catalogue, so it was cleared.")
        data["category"] = None
    known = {b.lower(): b for b in db.scalars(select(Product.brand).distinct()).all()}
    brands = []
    for b in prefs.brands:
        if b.lower() in known:
            brands.append(known[b.lower()])
        else:
            warnings.append(f"Brand “{b}” isn’t in the catalogue, so it was removed.")
    data["brands"] = brands
    return ShoppingPreferences.model_validate(data), warnings
