"""
Rule-based ranking of products against a shopper's preferences (no AI).

Given validated preferences, this:
  1. filters the catalogue by category, budget and brands, then
  2. scores each product using only its *listed* specifications, and
  3. explains, per product, which preferences raised or lowered its position.

What can influence ranking
--------------------------
* Hardware guidelines with a number ("At least 16 GB", "5,000 mAh or more",
  "120 Hz"): a product meets or misses the threshold.
* Guidelines without a number ("Dedicated graphics", "Large battery capacity",
  "High-performance processor"): dedicated vs integrated graphics, or a
  comparison with the other results (bigger battery than most, etc.).
* Stated priorities that map to a listed spec (battery life, performance,
  display, storage, value for money).

Everything else (uses, priorities like "camera" or "portability") is reported in
`not_used` with the reason, instead of being silently ignored.

AI hardware guidelines are treated as suggestions, never as verified
requirements, and no product specification is ever invented: a spec that isn't
listed is reported as "not listed" and doesn't change the score.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.category import Category
from app.models.product import Product
from app.schemas.ai import ShoppingPreferences
from app.schemas.recommendation import NotUsed, RankedProduct, RankingFactor, Reason, RecommendationResponse
from app.schemas.product import ProductRead
from app.services.spec_parser import parse_battery, parse_display, parse_graphics, parse_processor, parse_size_gb

METHOD = (
    "Ranked with simple rules using only the listed specifications. "
    "Hardware guidelines are suggestions, not verified requirements."
)
MAX_CANDIDATES = 500

# Points: stated priorities count more than AI suggestions
WEIGHT = {"priority": 2.0, "suggestion": 1.0}


# ---------------------------------------------------------------------------
# Spec extraction helpers (value + how to show it)
# ---------------------------------------------------------------------------
def _spec(p: Product, attr: str) -> str | None:
    return getattr(p.specifications, attr, None) if p.specifications else None


def ram_gb(p: Product) -> float | None:
    return parse_size_gb(_spec(p, "ram"))


def storage_gb(p: Product) -> float | None:
    return parse_size_gb(_spec(p, "storage"))


def battery_value(p: Product, unit: str | None = None) -> float | None:
    b = parse_battery(_spec(p, "battery"))
    if not b or (unit and b.unit != unit):
        return None
    return b.value


def refresh_hz(p: Product) -> float | None:
    d = parse_display(_spec(p, "display"))
    return float(d.refresh_hz) if d and d.refresh_hz else None


def processor_score(p: Product) -> float | None:
    """Cores x clock speed when both are listed, else cores, else None. Only used to compare results."""
    proc = parse_processor(_spec(p, "processor"))
    if not proc or not proc.cores:
        return None
    return proc.cores * (proc.max_ghz or 1.0)


def price(p: Product) -> float:
    return float(p.price_inr)


def fmt_gb(v: float) -> str:
    return f"{v / 1024:g} TB" if v >= 1024 and v % 1024 == 0 else f"{v:g} GB"


# ---------------------------------------------------------------------------
# Factors
# ---------------------------------------------------------------------------
@dataclass
class Factor:
    key: str
    label: str            # shown to the user, e.g. "RAM: At least 16 GB"
    source: str           # "priority" | "suggestion"
    kind: str             # "threshold" | "relative" | "feature"
    description: str      # how it is applied
    evaluate: Callable[[Product, list[Product]], tuple[float, Reason] | None]


def _threshold(key: str, label: str, source: str, spec_name: str, getter: Callable[[Product], float | None],
               threshold: float, show: Callable[[float], str], guideline: str) -> Factor:
    def evaluate(p: Product, _: list[Product]) -> tuple[float, Reason] | None:
        value = getter(p)
        if value is None:
            return 0.0, Reason(factor=key, effect="unknown", text=f"{spec_name} not listed — can’t check “{guideline}”")
        if value >= threshold:
            return 1.0, Reason(factor=key, effect="positive", text=f"{spec_name} {show(value)} meets “{guideline}”")
        return -0.5, Reason(factor=key, effect="negative", text=f"{spec_name} {show(value)} is below “{guideline}”")

    return Factor(key, label, source, "threshold", f"Checks listed {spec_name.lower()} against “{guideline}”", evaluate)


def _relative(key: str, label: str, source: str, spec_name: str, getter: Callable[[Product], float | None],
              show: Callable[[Product], str], higher_is_better: bool = True, word: tuple[str, str] = ("larger", "smaller")) -> Factor:
    def evaluate(p: Product, pool: list[Product]) -> tuple[float, Reason] | None:
        values = [v for v in (getter(x) for x in pool) if v is not None]
        value = getter(p)
        if value is None:
            return 0.0, Reason(factor=key, effect="unknown", text=f"{spec_name} not listed")
        if len(values) < 2 or max(values) == min(values):
            return 0.0, Reason(factor=key, effect="neutral", text=f"{spec_name} {show(p)} — same as the other results")
        position = (value - min(values)) / (max(values) - min(values))
        if not higher_is_better:
            position = 1 - position
        better, worse = word
        if position >= 0.67:
            return position, Reason(factor=key, effect="positive", text=f"{spec_name} {show(p)} — {better} than most results")
        if position <= 0.33:
            return position, Reason(factor=key, effect="negative", text=f"{spec_name} {show(p)} — {worse} than most results")
        return position, Reason(factor=key, effect="neutral", text=f"{spec_name} {show(p)} — about average for these results")

    return Factor(key, label, source, "relative", f"Compares listed {spec_name.lower()} across the results", evaluate)


def _dedicated_graphics(key: str, label: str, source: str, guideline: str) -> Factor:
    def evaluate(p: Product, _: list[Product]) -> tuple[float, Reason] | None:
        g = parse_graphics(_spec(p, "graphics"))
        if g is None or g.dedicated is None:
            return 0.0, Reason(factor=key, effect="unknown", text=f"Graphics not listed clearly — can’t check “{guideline}”")
        if g.dedicated:
            return 1.0, Reason(factor=key, effect="positive", text=f"Listed graphics: {_spec(p, 'graphics')} — meets “{guideline}”")
        return -0.5, Reason(factor=key, effect="negative", text=f"Listed graphics: {_spec(p, 'graphics')} — not “{guideline}”")

    return Factor(key, label, source, "feature", "Checks whether listed graphics are dedicated", evaluate)


_NUMBER_UNIT = re.compile(r"(\d+(?:[.,]\d+)?)\s*(TB|GB|mAh|Wh|Hz)\b", re.IGNORECASE)


def factors_for(prefs: ShoppingPreferences, pool: list[Product]) -> tuple[list[Factor], list[NotUsed]]:
    """Turn preferences into ranking factors, and list what couldn't be used (with reasons)."""
    factors: list[Factor] = []
    not_used: list[NotUsed] = []
    phones = prefs.category == "smartphones" or (bool(pool) and all(p.category.slug == "smartphones" for p in pool))
    laptops = prefs.category == "laptops" or (bool(pool) and all(p.category.slug == "laptops" for p in pool))
    battery_unit = "mah" if phones else ("wh" if laptops else None)
    mixed = not phones and not laptops  # results include different product types

    def add_relative(factor: Factor) -> None:
        """Comparisons across laptops *and* phones would be misleading, so skip them."""
        if mixed:
            not_used.append(NotUsed(label=factor.label, reason="Results include different product types — choose a category to compare this."))
        else:
            factors.append(factor)

    def battery_show(p: Product) -> str:
        return _spec(p, "battery") or "?"

    # --- AI hardware guidelines ---
    for hp in prefs.hardware_preferences:
        key = f"hw:{hp.spec}"
        label = f"{hp.spec.upper() if hp.spec == 'ram' else hp.spec.capitalize()}: {hp.preference}"
        m = _NUMBER_UNIT.search(hp.preference.replace(",", ""))
        number, unit = (float(m.group(1)), m.group(2).lower()) if m else (None, None)
        if hp.spec in ("ram", "storage"):
            getter = ram_gb if hp.spec == "ram" else storage_gb
            name = "RAM" if hp.spec == "ram" else "Storage"
            if number and unit in ("gb", "tb"):
                factors.append(_threshold(key, label, "suggestion", name, getter, number * (1024 if unit == "tb" else 1), fmt_gb, hp.preference))
            else:
                factors.append(_relative(key, label, "suggestion", name, getter, lambda p, a=hp.spec: _spec(p, a) or "?", word=("more", "less")))
        elif hp.spec == "battery":
            if number and unit in ("mah", "wh"):
                factors.append(_threshold(key, label, "suggestion", "Battery", lambda p, u=unit: battery_value(p, u), number,
                                          lambda v, u=unit: f"{v:,.0f} {'mAh' if u == 'mah' else 'Wh'}", hp.preference))
            else:
                add_relative(_relative(key, label, "suggestion", "Battery", lambda p: battery_value(p, battery_unit), battery_show))
        elif hp.spec == "graphics":
            if phones:
                not_used.append(NotUsed(label=label, reason="Phone listings don’t include graphics."))
            elif "dedicated" in hp.preference.lower() or "discrete" in hp.preference.lower():
                factors.append(_dedicated_graphics(key, label, "suggestion", hp.preference))
            else:
                not_used.append(NotUsed(label=label, reason="Only dedicated vs integrated graphics can be checked from the listings."))
        elif hp.spec == "display":
            if number and unit == "hz":
                factors.append(_threshold(key, label, "suggestion", "Refresh rate", refresh_hz, number, lambda v: f"{v:g} Hz", hp.preference))
            elif "refresh" in hp.preference.lower():
                add_relative(_relative(key, label, "suggestion", "Refresh rate", refresh_hz, lambda p: f"{refresh_hz(p):g} Hz" if refresh_hz(p) else "?", word=("higher", "lower")))
            else:
                not_used.append(NotUsed(label=label, reason="Only refresh rate can be compared from the listed display specs."))
        elif hp.spec == "processor":
            add_relative(_relative(key, label, "suggestion", "Processor", processor_score, lambda p: _spec(p, "processor") or "?", word=("stronger", "weaker")))

    # --- Stated priorities ---
    used_specs = {f.key.split(":")[1] for f in factors}
    for priority in prefs.priorities:
        text = priority.lower()
        key = f"priority:{text}"
        if "battery" in text:
            if "battery" in used_specs and any(f.key == "hw:battery" for f in factors):
                factors = [f if f.key != "hw:battery" else Factor(f.key, f.label, "priority", f.kind, f.description, f.evaluate) for f in factors]
            else:
                add_relative(_relative(key, priority, "priority", "Battery", lambda p: battery_value(p, battery_unit), battery_show))
        elif any(w in text for w in ("performance", "fast", "speed", "power")):
            add_relative(_relative(key, priority, "priority", "Processor", processor_score, lambda p: _spec(p, "processor") or "?", word=("stronger", "weaker")))
        elif any(w in text for w in ("display", "screen")):
            add_relative(_relative(key, priority, "priority", "Refresh rate", refresh_hz, lambda p: f"{refresh_hz(p):g} Hz" if refresh_hz(p) else "?", word=("higher", "lower")))
        elif "storage" in text or "space" in text:
            factors.append(_relative(key, priority, "priority", "Storage", storage_gb, lambda p: _spec(p, "storage") or "?", word=("more", "less")))
        elif any(w in text for w in ("value", "price", "cheap", "affordable", "budget")):
            factors.append(_relative(key, priority, "priority", "Price", price, lambda p: f"₹{price(p):,.0f}", higher_is_better=False, word=("cheaper", "pricier")))
        elif "camera" in text or "photo" in text:
            not_used.append(NotUsed(label=priority, reason="Camera specs aren’t listed for these products."))
        elif any(w in text for w in ("portab", "light", "weight", "thin")):
            not_used.append(NotUsed(label=priority, reason="Weight isn’t listed for these products."))
        else:
            not_used.append(NotUsed(label=priority, reason="Can’t be measured from the listed specifications."))

    if prefs.use_cases:
        not_used.append(NotUsed(
            label="Uses: " + ", ".join(prefs.use_cases),
            reason="Not ranked directly — only through the hardware guidelines above.",
        ))
    return factors, not_used


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def recommend(db: Session, prefs: ShoppingPreferences, *, sort: str = "match", limit: int = 12, offset: int = 0,
              warnings: list[str] | None = None) -> RecommendationResponse:
    query = select(Product).join(Category, Product.category_id == Category.id)
    if prefs.category:
        query = query.where(Category.slug == prefs.category)
    if prefs.min_budget_inr is not None:
        query = query.where(Product.price_inr >= prefs.min_budget_inr)
    if prefs.max_budget_inr is not None:
        query = query.where(Product.price_inr <= prefs.max_budget_inr)
    if prefs.brands:
        query = query.where(func.lower(Product.brand).in_([b.lower() for b in prefs.brands]))
    pool = list(db.scalars(query.limit(MAX_CANDIDATES)).unique().all())

    factors, not_used = factors_for(prefs, pool)
    ranked: list[RankedProduct] = []
    for p in pool:
        score = 0.0
        reasons: list[Reason] = []
        for f in factors:
            result = f.evaluate(p, pool)
            if result is None:
                continue
            points, reason = result
            score += points * WEIGHT[f.source]
            reasons.append(reason)
        ranked.append(RankedProduct(product=ProductRead.model_validate(p), score=round(score, 2), reasons=reasons))

    if sort == "price_asc":
        ranked.sort(key=lambda r: float(r.product.price_inr))
    elif sort == "price_desc":
        ranked.sort(key=lambda r: -float(r.product.price_inr))
    elif sort == "name":
        ranked.sort(key=lambda r: r.product.name)
    else:  # best match first; cheaper first when tied
        ranked.sort(key=lambda r: (-r.score, float(r.product.price_inr)))

    return RecommendationResponse(
        preferences=prefs,
        items=ranked[offset: offset + limit],
        total=len(ranked),
        limit=limit,
        offset=offset,
        ranking_factors=[RankingFactor(key=f.key, label=f.label, source=f.source, kind=f.kind, description=f.description) for f in factors],
        not_used=not_used,
        sort=sort,
        warnings=warnings or [],
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
