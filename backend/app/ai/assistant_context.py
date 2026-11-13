"""
Build the facts the Decision Assistant is allowed to use.

Products are read from PostgreSQL by slug and scored with the existing,
deterministic recommendation engine. The assistant never computes scores
itself — it only receives them here, together with listed specs and prices.

The result is a compact text block for the prompt, plus every number that
appears in it, so the assistant's answer can be checked for invented values.
"""

import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.schemas.assistant import AssistantContext
from app.services import scoring_engine as engine
from app.services.recommendation_service import to_input

SPEC_FIELDS = [("processor", "Processor"), ("ram", "RAM"), ("storage", "Storage"), ("battery", "Battery"), ("display", "Display"), ("graphics", "Graphics")]

# Data Siftwell simply doesn't have, so the assistant can say so plainly
NOT_IN_DATA = (
    "user ratings or reviews, benchmark results, weight, camera specs, build materials, "
    "warranty, real-world battery life (only battery capacity is listed), availability or delivery"
)


@dataclass
class BuiltContext:
    text: str
    products: dict[str, str]          # slug -> name (only products actually in the context)
    numbers: set[str] = field(default_factory=set)
    missing_slugs: list[str] = field(default_factory=list)


def _numbers_in(text: str) -> set[str]:
    """Every number in the text, normalised ("1,24,990" -> "124990", "79.0" -> "79")."""
    out: set[str] = set()
    for raw in re.findall(r"\d[\d,]*(?:\.\d+)?", text):
        value = raw.replace(",", "")
        out.add(value)
        try:
            f = float(value)
            out.add(f"{f:g}")
            out.add(str(round(f)))
        except ValueError:
            pass
    return out


def build_context(db: Session, ctx: AssistantContext) -> BuiltContext:
    rows = db.scalars(select(Product).where(Product.slug.in_(ctx.product_slugs))).unique().all()
    by_slug = {p.slug: p for p in rows}
    ordered = [by_slug[s] for s in ctx.product_slugs if s in by_slug]
    missing = [s for s in ctx.product_slugs if s not in by_slug]

    result = engine.score_products([to_input(p) for p in ordered], ctx.preferences, ctx.weights, ctx.adjust_for_usage)
    scored = {i.product.slug: i for i in result.items}
    excluded = {e.product.slug: e for e in result.excluded}

    lines: list[str] = []
    prefs = ctx.preferences
    lines.append("USER PREFERENCES")
    lines.append(f"- Category: {prefs.category or 'any'}")
    budget = (
        f"{engine.fmt_inr(prefs.min_budget_inr) if prefs.min_budget_inr else 'no minimum'} to "
        f"{engine.fmt_inr(prefs.max_budget_inr) if prefs.max_budget_inr else 'no maximum'}"
    )
    lines.append(f"- Budget: {budget}")
    lines.append(f"- Uses: {', '.join(prefs.use_cases) or 'not stated'}")
    lines.append(f"- Priorities: {', '.join(prefs.priorities) or 'not stated'}")
    if prefs.hardware_preferences:
        guides = "; ".join(f"{h.spec}: {h.preference}{' (must have)' if h.mandatory else ''}" for h in prefs.hardware_preferences)
        lines.append(f"- AI hardware guidelines (suggestions, not verified requirements): {guides}")

    lines.append("")
    lines.append("SCORING (Siftwell's rule-based engine, not AI). Weights in percent:")
    lines.append("- " + ", ".join(f"{engine.LABELS[w.criterion]} {w.effective:g}%" for w in result.weights))
    for a in result.adjustments:
        lines.append(f"- {engine.LABELS[a.criterion]} weight ×{a.factor:g} because of {a.reason}")

    cheapest = min((p.price_inr for p in ordered), default=None)
    top = result.items[0] if result.items else None

    lines.append("")
    lines.append("PRODUCTS (in the order shown to the user)")
    for p in ordered:
        item = scored.get(p.slug)
        s = p.specifications
        lines.append("")
        header = f"[{p.slug}] {p.name} — {p.brand} {p.model}, {p.category.name}, price {engine.fmt_inr(float(p.price_inr))}"
        if p.is_demo:
            header += " (fictional demo product)"
        lines.append(header)
        if cheapest is not None and p.price_inr > cheapest:
            lines.append(f"  Costs {engine.fmt_inr(float(p.price_inr - cheapest))} more than the cheapest product here")
        if top and item and item.product.slug != top.product.slug and top.product.price != float(cheapest or 0):
            diff = float(p.price_inr) - top.product.price
            word = "more" if diff > 0 else "less"
            if diff:
                lines.append(f"  Costs {engine.fmt_inr(abs(diff))} {word} than the top-ranked product")
        specs = [f"{label}: {getattr(s, attr, None) or 'not listed'}" for attr, label in SPEC_FIELDS] if s else ["No specifications listed"]
        lines.append("  Specs: " + "; ".join(specs))
        if item:
            lines.append(f"  Rank {item.rank} of {len(result.items)}, score {item.score:g}/100, coverage {item.coverage}%")
            for r in item.breakdown:
                if r.score is None:
                    lines.append(f"    {engine.LABELS[r.criterion]}: not scored — {r.detail}")
                else:
                    lines.append(f"    {engine.LABELS[r.criterion]}: {r.score:g}/100 (weight {r.weight:g}%, adds {r.contribution:g} points)")
            if item.strengths:
                lines.append("  Strengths: " + "; ".join(item.strengths))
            if item.weaknesses:
                lines.append("  Weaknesses: " + "; ".join(item.weaknesses))
        elif p.slug in excluded:
            lines.append("  Excluded by a must-have requirement: " + "; ".join(excluded[p.slug].reasons))

    lines.append("")
    lines.append(f"NOT IN SIFTWELL'S DATA: {NOT_IN_DATA}.")
    text = "\n".join(lines)
    return BuiltContext(text=text, products={p.slug: p.name for p in ordered}, numbers=_numbers_in(text), missing_slugs=missing)
