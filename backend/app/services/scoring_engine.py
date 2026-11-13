"""
Siftwell's recommendation scoring engine — deterministic, transparent Python.

No AI is involved here: Gemini only extracts the user's preferences. Given the
same products, preferences and weights, this module always produces the same
scores and the same order.

How a product is scored
-----------------------
1. **Criterion scores (0–100).** Each criterion is read from the product's
   listed specs and placed on a published reference scale for its category
   (see SCALES). Example: laptop RAM uses a log scale from 4 GB (0) to 32 GB
   (100), so 8 GB = 33, 16 GB = 67, 32 GB = 100. Values outside a scale are
   clamped to 0 or 100.
     * processor — cores × max clock speed (both must be listed)
     * ram, storage — GB (log scale: each doubling adds the same points)
     * battery — Wh for laptops, mAh for phones (linear)
     * display — average of refresh rate and resolution scores, whichever are listed
     * value — quality per rupee, compared across the matching products
2. **Weights.** Default (or user-chosen) weights are multiplied by usage and
   priority adjustments (e.g. "Java development" → RAM ×1.5), then normalised
   to percentages that add up to 100.
3. **Total (0–100)** = weighted average of the criteria that could be scored.
   A spec that isn't listed is *not* scored — it isn't guessed and it isn't
   counted as zero. Its weight is shared among the other criteria, and the
   product's `coverage` shows how much of the total weight was actually scored.
4. **Must-have requirements** (hardware guidelines the user marked mandatory)
   remove products that don't meet them — or whose listing doesn't show the spec.
"""

import math
import re
from dataclasses import dataclass, field

from app.schemas.ai import ShoppingPreferences
from app.services.spec_parser import parse_battery, parse_display, parse_graphics, parse_processor, parse_size_gb

CRITERIA = ["processor", "ram", "battery", "storage", "display", "value"]
LABELS = {
    "processor": "Processor",
    "ram": "RAM",
    "battery": "Battery",
    "storage": "Storage",
    "display": "Display",
    "value": "Value for money",
}
DEFAULT_WEIGHTS = {"processor": 20, "ram": 15, "battery": 15, "storage": 10, "display": 15, "value": 25}

STRENGTH_AT = 70  # criterion score at or above this is a strength
WEAKNESS_AT = 35  # at or below this is a weakness
MAX_MULTIPLIER = 3.0


# ---------------------------------------------------------------------------
# Reference scales
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Scale:
    low: float   # scores 0
    high: float  # scores 100
    unit: str
    log: bool = False

    def score(self, value: float) -> float:
        if self.log:
            position = (math.log2(value) - math.log2(self.low)) / (math.log2(self.high) - math.log2(self.low))
        else:
            position = (value - self.low) / (self.high - self.low)
        return round(max(0.0, min(1.0, position)) * 100, 1)

    def describe(self) -> str:
        kind = "log scale" if self.log else "linear"
        return f"{_num(self.low)}–{_num(self.high)} {self.unit} ({kind})"


SCALES: dict[str, dict[str, Scale]] = {
    "laptops": {
        "processor": Scale(16, 80, "cores × GHz"),
        "ram": Scale(4, 32, "GB", log=True),
        "storage": Scale(128, 2048, "GB", log=True),
        "battery": Scale(40, 100, "Wh"),
        "refresh": Scale(60, 240, "Hz"),
        "pixels": Scale(1920 * 1080, 3840 * 2400, "pixels", log=True),
    },
    "smartphones": {
        "processor": Scale(8, 28, "cores × GHz"),
        "ram": Scale(4, 16, "GB", log=True),
        "storage": Scale(64, 1024, "GB", log=True),
        "battery": Scale(3000, 6000, "mAh"),
        "refresh": Scale(60, 144, "Hz"),
        "pixels": Scale(720 * 1600, 1440 * 3200, "pixels", log=True),
    },
}
BATTERY_UNIT = {"laptops": "wh", "smartphones": "mah"}


def _num(v: float) -> str:
    return f"{v:,.0f}" if v >= 1000 else f"{v:g}"


def fmt_gb(v: float) -> str:
    return f"{v / 1024:g} TB" if v >= 1024 and v % 1024 == 0 else f"{v:g} GB"


def fmt_inr(v: float) -> str:
    digits = str(int(round(v)))
    if len(digits) > 3:
        head, tail, groups = digits[:-3], digits[-3:], []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        groups.insert(0, head) if head else None
        digits = ",".join(groups) + "," + tail
    return "₹" + digits


# ---------------------------------------------------------------------------
# Inputs and results
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class ProductInput:
    """The listed facts the engine is allowed to use. Nothing else."""

    slug: str
    name: str
    category: str
    price: float
    processor: str | None = None
    ram: str | None = None
    storage: str | None = None
    battery: str | None = None
    display: str | None = None
    graphics: str | None = None


@dataclass
class CriterionResult:
    criterion: str
    score: float | None          # None = not scored (missing or not comparable)
    value: str | None            # the spec as listed
    detail: str                  # how the score was calculated, or why it wasn't
    weight: float = 0.0          # effective weight (% of 100)
    contribution: float | None = None  # points added to the total


@dataclass
class RequirementCheck:
    text: str
    spec: str
    mandatory: bool
    met: bool | None  # None = can't tell from the listing
    detail: str


@dataclass
class ScoredItem:
    product: ProductInput
    score: float
    coverage: int
    breakdown: list[CriterionResult]
    strengths: list[str]
    weaknesses: list[str]
    requirements: list[RequirementCheck]
    summary: str
    rank: int = 0


@dataclass
class Excluded:
    product: ProductInput
    reasons: list[str]


@dataclass
class WeightInfo:
    criterion: str
    base: float
    multiplier: float
    effective: float


@dataclass
class Adjustment:
    criterion: str
    factor: float
    reason: str


@dataclass
class EngineResult:
    items: list[ScoredItem]
    excluded: list[Excluded]
    weights: list[WeightInfo]
    adjustments: list[Adjustment]
    unchecked_requirements: list[tuple[str, str]]
    warnings: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# 1. Criterion scores
# ---------------------------------------------------------------------------
def _scales(category: str) -> dict[str, Scale] | None:
    return SCALES.get(category)


def score_processor(p: ProductInput) -> CriterionResult:
    scales = _scales(p.category)
    if not p.processor:
        return CriterionResult("processor", None, None, "Processor not listed — not scored.")
    proc = parse_processor(p.processor)
    if not proc or not proc.cores or not proc.max_ghz:
        return CriterionResult("processor", None, p.processor,
                               "The listing doesn’t give both a core count and a clock speed, so it can’t be scored fairly.")
    if not scales:
        return CriterionResult("processor", None, p.processor, f"No reference scale for {p.category}.")
    index = proc.cores * proc.max_ghz
    s = scales["processor"].score(index)
    return CriterionResult("processor", s, p.processor,
                           f"{proc.cores} cores × {proc.max_ghz:g} GHz = {index:g} → {s:g}/100 on the {p.category} scale {scales['processor'].describe()}.")


def _score_size(p: ProductInput, criterion: str, raw: str | None) -> CriterionResult:
    label = LABELS[criterion]
    if not raw:
        return CriterionResult(criterion, None, None, f"{label} not listed — not scored.")
    gb = parse_size_gb(raw)
    if gb is None:
        return CriterionResult(criterion, None, raw, f"Couldn’t read a size in “{raw}”, so it isn’t scored.")
    scales = _scales(p.category)
    if not scales:
        return CriterionResult(criterion, None, raw, f"No reference scale for {p.category}.")
    s = scales[criterion].score(gb)
    return CriterionResult(criterion, s, raw, f"{fmt_gb(gb)} → {s:g}/100 on the {p.category} scale {scales[criterion].describe()}.")


def score_battery(p: ProductInput) -> CriterionResult:
    if not p.battery:
        return CriterionResult("battery", None, None, "Battery not listed — not scored.")
    b = parse_battery(p.battery)
    scales = _scales(p.category)
    if not b or not scales:
        return CriterionResult("battery", None, p.battery, f"Couldn’t read a capacity in “{p.battery}”, so it isn’t scored.")
    if b.unit != BATTERY_UNIT[p.category]:
        return CriterionResult("battery", None, p.battery, f"Listed in {b.unit}, which doesn’t match the {p.category} scale, so it isn’t scored.")
    scale = scales["battery"]
    s = scale.score(b.value)
    return CriterionResult("battery", s, p.battery,
                           f"{_num(b.value)} {scale.unit} → {s:g}/100 on the {p.category} scale {scale.describe()}. "
                           "Capacity only — real battery life also depends on the chip and screen.")


def score_display(p: ProductInput) -> CriterionResult:
    if not p.display:
        return CriterionResult("display", None, None, "Display not listed — not scored.")
    d = parse_display(p.display)
    scales = _scales(p.category)
    if not d or not scales:
        return CriterionResult("display", None, p.display, "Couldn’t read the display details, so it isn’t scored.")
    parts, scores = [], []
    if d.refresh_hz:
        s = scales["refresh"].score(d.refresh_hz)
        parts.append(f"{d.refresh_hz} Hz → {s:g}")
        scores.append(s)
    if d.pixels:
        s = scales["pixels"].score(d.pixels)
        parts.append(f"{d.width}×{d.height} → {s:g}")
        scores.append(s)
    if not scores:
        return CriterionResult("display", None, p.display, "No refresh rate or resolution listed, so the display isn’t scored.")
    avg = round(sum(scores) / len(scores), 1)
    missing = [] if d.refresh_hz else ["refresh rate"]
    if not d.pixels:
        missing.append("resolution")
    note = f" ({' and '.join(missing)} not listed, so not used)" if missing else ""
    how = "; ".join(parts) + (f"; average {avg:g}" if len(scores) > 1 else "")
    return CriterionResult("display", avg, p.display, f"{how}/100{note}.")


def score_specs(p: ProductInput) -> dict[str, CriterionResult]:
    """All criteria except value for money (which needs the other products)."""
    return {
        "processor": score_processor(p),
        "ram": _score_size(p, "ram", p.ram),
        "battery": score_battery(p),
        "storage": _score_size(p, "storage", p.storage),
        "display": score_display(p),
    }


def score_value(products: list[ProductInput], specs: dict[str, dict[str, CriterionResult]], weights: dict[str, float]) -> dict[str, CriterionResult]:
    """
    Value for money: the product's weighted spec score ("quality") per ₹1 lakh,
    compared across the matching products (best = 100, worst = 0).
    """
    quality: dict[str, float] = {}
    for p in products:
        scored = [(weights[c], r.score) for c, r in specs[p.slug].items() if r.score is not None and weights[c] > 0]
        total_w = sum(w for w, _ in scored)
        if total_w > 0 and p.price > 0:
            quality[p.slug] = sum(w * s for w, s in scored) / total_w
    ratios = {slug: q / (next(p.price for p in products if p.slug == slug) / 100_000) for slug, q in quality.items()}
    results: dict[str, CriterionResult] = {}
    for p in products:
        price_text = fmt_inr(p.price)
        if p.slug not in ratios:
            results[p.slug] = CriterionResult("value", None, price_text, "No other specs could be scored, so value for money can’t be judged.")
        elif len(ratios) < 2:
            results[p.slug] = CriterionResult("value", None, price_text, "Value is compared across matching products, and only one could be compared.")
        else:
            lo, hi = min(ratios.values()), max(ratios.values())
            r = ratios[p.slug]
            s = 50.0 if hi == lo else round((r - lo) / (hi - lo) * 100, 1)
            results[p.slug] = CriterionResult(
                "value", s, price_text,
                f"Spec score {quality[p.slug]:.0f}/100 at {price_text} = {r:.1f} points per ₹1 lakh "
                f"(range across {len(ratios)} matching products: {lo:.1f}–{hi:.1f}) → {s:g}/100.",
            )
    return results


# ---------------------------------------------------------------------------
# 2. Weights
# ---------------------------------------------------------------------------
# (keywords, {criterion: multiplier}, description)
USAGE_RULES: list[tuple[tuple[str, ...], dict[str, float], str]] = [
    (("java", "coding", "programming", "develop", "software", "multitask"), {"ram": 1.5, "processor": 1.3}, "programming / multitasking"),
    (("gaming", "game"), {"processor": 1.4, "display": 1.4, "ram": 1.2}, "gaming"),
    (("college", "student", "school", "study"), {"value": 1.4, "battery": 1.3}, "college / study"),
    (("video editing", "editing", "design", "render"), {"processor": 1.5, "ram": 1.4, "storage": 1.3, "display": 1.2}, "editing / creative work"),
    (("travel", "commute"), {"battery": 1.5}, "travel"),
    (("office", "browsing", "email"), {"battery": 1.2, "value": 1.2}, "everyday office use"),
    (("video", "movie", "stream", "netflix", "youtube", "watch"), {"display": 1.4, "battery": 1.2}, "watching videos"),
    (("photo", "camera"), {"storage": 1.3}, "photos"),
]
PRIORITY_RULES: list[tuple[tuple[str, ...], dict[str, float]]] = [
    (("battery",), {"battery": 1.5}),
    (("performance", "fast", "speed", "power"), {"processor": 1.5}),
    (("display", "screen"), {"display": 1.5}),
    (("storage", "space"), {"storage": 1.5}),
    (("value", "price", "cheap", "budget", "afford"), {"value": 1.5}),
    (("ram", "memory"), {"ram": 1.5}),
]


def resolve_weights(prefs: ShoppingPreferences, base: dict[str, float] | None, adjust_for_usage: bool) -> tuple[dict[str, float], list[WeightInfo], list[Adjustment]]:
    """Return effective weights (percent, sum = 100), a per-criterion summary, and the adjustments applied."""
    base_weights = {c: float((base or DEFAULT_WEIGHTS).get(c, 0)) for c in CRITERIA}
    if sum(base_weights.values()) <= 0:
        base_weights = {c: float(v) for c, v in DEFAULT_WEIGHTS.items()}
    multipliers = {c: 1.0 for c in CRITERIA}
    adjustments: list[Adjustment] = []
    if adjust_for_usage:
        for use in prefs.use_cases:
            text = use.lower()
            for keywords, effects, description in USAGE_RULES:
                if any(k in text for k in keywords):
                    for c, f in effects.items():
                        multipliers[c] *= f
                        adjustments.append(Adjustment(c, f, f"Use “{use}” ({description})"))
        for priority in prefs.priorities:
            text = priority.lower()
            for keywords, effects in PRIORITY_RULES:
                if any(k in text for k in keywords):
                    for c, f in effects.items():
                        multipliers[c] *= f
                        adjustments.append(Adjustment(c, f, f"Priority “{priority}”"))
    multipliers = {c: min(MAX_MULTIPLIER, m) for c, m in multipliers.items()}
    raw = {c: base_weights[c] * multipliers[c] for c in CRITERIA}
    total = sum(raw.values())
    effective = {c: round(raw[c] / total * 100, 1) for c in CRITERIA}
    info = [WeightInfo(c, base_weights[c], round(multipliers[c], 2), effective[c]) for c in CRITERIA]
    return effective, info, adjustments


# ---------------------------------------------------------------------------
# 3. Requirements (from hardware guidelines)
# ---------------------------------------------------------------------------
_NUMBER_UNIT = re.compile(r"(\d+(?:\.\d+)?)\s*(TB|GB|mAh|Wh|Hz)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Requirement:
    text: str
    spec: str
    mandatory: bool
    minimum: float | None = None  # numeric threshold (GB, mAh, Wh, Hz)
    unit: str | None = None
    dedicated_graphics: bool = False

    def check(self, p: ProductInput) -> RequirementCheck:
        def result(met: bool | None, detail: str) -> RequirementCheck:
            return RequirementCheck(self.text, self.spec, self.mandatory, met, detail)

        if self.dedicated_graphics:
            if p.category == "smartphones":
                return result(None, "Phone listings don’t include graphics.")
            g = parse_graphics(p.graphics)
            if not g or g.dedicated is None:
                return result(None, "Graphics not listed clearly.")
            return result(g.dedicated, f"Listed graphics: {p.graphics}")
        if self.spec in ("ram", "storage"):
            value = parse_size_gb(getattr(p, self.spec))
            shown = fmt_gb(value) if value is not None else None
        elif self.spec == "battery":
            b = parse_battery(p.battery)
            value = b.value if b and b.unit == self.unit else None
            shown = p.battery if value is not None else None
        elif self.spec == "display":
            d = parse_display(p.display)
            value = float(d.refresh_hz) if d and d.refresh_hz else None
            shown = f"{d.refresh_hz} Hz" if value is not None else None
        else:
            return result(None, "This guideline can’t be checked from the listings.")
        if value is None:
            return result(None, f"{LABELS.get(self.spec, self.spec.capitalize())} not listed (or not in comparable units).")
        return result(value >= (self.minimum or 0), f"Listed: {shown}")


def parse_requirements(prefs: ShoppingPreferences) -> tuple[list[Requirement], list[tuple[str, str]], list[str]]:
    """Turn hardware guidelines into checkable requirements. Returns (requirements, unchecked, warnings)."""
    requirements: list[Requirement] = []
    unchecked: list[tuple[str, str]] = []
    warnings: list[str] = []
    for hp in prefs.hardware_preferences:
        text = f"{LABELS.get(hp.spec, hp.spec.capitalize())}: {hp.preference}"
        lower = hp.preference.lower()
        m = _NUMBER_UNIT.search(hp.preference.replace(",", ""))
        req: Requirement | None = None
        if hp.spec == "graphics" and ("dedicated" in lower or "discrete" in lower):
            req = Requirement(text, "graphics", hp.mandatory, dedicated_graphics=True)
        elif m:
            number, unit = float(m.group(1)), m.group(2).lower()
            if hp.spec in ("ram", "storage") and unit in ("gb", "tb"):
                req = Requirement(text, hp.spec, hp.mandatory, number * (1024 if unit == "tb" else 1), "gb")
            elif hp.spec == "battery" and unit in ("mah", "wh"):
                req = Requirement(text, "battery", hp.mandatory, number, unit)
            elif hp.spec == "display" and unit == "hz":
                req = Requirement(text, "display", hp.mandatory, number, "hz")
        if req:
            requirements.append(req)
        else:
            unchecked.append((text, "No measurable threshold — it adjusts nothing and can’t be a must-have."))
            if hp.mandatory:
                warnings.append(f"“{text}” can’t be checked against the listings, so it isn’t used as a must-have.")
    return requirements, unchecked, warnings


# ---------------------------------------------------------------------------
# 4. Putting it together
# ---------------------------------------------------------------------------
def _strengths_weaknesses(breakdown: list[CriterionResult], checks: list[RequirementCheck]) -> tuple[list[str], list[str]]:
    """Requirement results first (they come from the user), then the strongest/weakest criteria."""
    ranked = sorted((r for r in breakdown if r.score is not None), key=lambda r: -(r.contribution or 0))
    strengths = [f"Meets “{c.text}” ({c.detail.removeprefix('Listed: ')})" for c in checks if c.met is True]
    weaknesses = [f"Doesn’t meet “{c.text}” ({c.detail.removeprefix('Listed: ')})" for c in checks if c.met is False]
    strengths += [f"{LABELS[r.criterion]}: {r.value} ({r.score:g}/100)" for r in ranked if r.score >= STRENGTH_AT]
    weaknesses += [f"{LABELS[r.criterion]}: {r.value} ({r.score:g}/100)" for r in sorted(ranked, key=lambda r: r.score or 0) if r.score <= WEAKNESS_AT]
    weaknesses += [f"{LABELS[r.criterion]} not scored: {r.detail}" for r in breakdown if r.score is None and r.weight > 0 and r.criterion != "value"]
    return strengths[:5], weaknesses[:5]


def _summary(score: float, coverage: int, breakdown: list[CriterionResult]) -> str:
    scored = [r for r in breakdown if r.score is not None]
    best = [LABELS[r.criterion] for r in sorted(scored, key=lambda r: -(r.contribution or 0))[:2] if (r.score or 0) >= STRENGTH_AT]
    worst = [LABELS[r.criterion] for r in sorted(scored, key=lambda r: r.score or 0)[:2] if (r.score or 0) <= WEAKNESS_AT]
    parts = [f"{score:g}/100"]
    if best:
        parts.append(f"strongest in {' and '.join(best).lower().replace('ram', 'RAM')}")
    if worst:
        parts.append(f"weakest in {' and '.join(worst).lower().replace('ram', 'RAM')}")
    if coverage < 100:
        parts.append(f"based on {coverage}% of the weights (some specs aren’t listed)")
    return " — ".join(parts[:1]) + (": " + "; ".join(parts[1:]) if len(parts) > 1 else "") + "."


def score_products(products: list[ProductInput], prefs: ShoppingPreferences,
                   base_weights: dict[str, float] | None = None, adjust_for_usage: bool = True) -> EngineResult:
    weights, weight_info, adjustments = resolve_weights(prefs, base_weights, adjust_for_usage)
    requirements, unchecked, warnings = parse_requirements(prefs)

    # Must-haves: remove products that fail them (or whose listing can't confirm them)
    kept: list[ProductInput] = []
    excluded: list[Excluded] = []
    checks_by_slug: dict[str, list[RequirementCheck]] = {}
    for p in products:
        checks = [r.check(p) for r in requirements]
        failures = [f"{c.text}: {'not met' if c.met is False else 'can’t confirm'} ({c.detail})" for c in checks if c.mandatory and c.met is not True]
        if failures:
            excluded.append(Excluded(p, failures))
        else:
            kept.append(p)
            checks_by_slug[p.slug] = checks

    specs = {p.slug: score_specs(p) for p in kept}
    value = score_value(kept, specs, weights)

    items: list[ScoredItem] = []
    for p in kept:
        results = {**specs[p.slug], "value": value[p.slug]}
        breakdown = [results[c] for c in CRITERIA]
        for r in breakdown:
            r.weight = weights[r.criterion]
        scored_weight = sum(r.weight for r in breakdown if r.score is not None)
        if scored_weight > 0:
            total = sum(r.weight * r.score for r in breakdown if r.score is not None) / scored_weight
            for r in breakdown:
                r.contribution = round(r.weight * r.score / scored_weight, 1) if r.score is not None else None
        else:
            total = 0.0
        score = round(total, 1)
        coverage = int(round(scored_weight / sum(weights.values()) * 100)) if sum(weights.values()) else 0
        checks = checks_by_slug[p.slug]
        strengths, weaknesses = _strengths_weaknesses(breakdown, checks)
        items.append(ScoredItem(p, score, coverage, breakdown, strengths, weaknesses, checks, _summary(score, coverage, breakdown)))

    # Best match first; ties -> more data scored, then cheaper, then name (fully deterministic)
    items.sort(key=lambda i: (-i.score, -i.coverage, i.product.price, i.product.name))
    for rank, item in enumerate(items, start=1):
        item.rank = rank

    for c in CRITERIA:
        if weights[c] > 0 and kept and all(next(r for r in i.breakdown if r.criterion == c).score is None for i in items):
            warnings.append(f"{LABELS[c]} couldn’t be scored for any matching product, so its weight was shared among the other criteria.")
    return EngineResult(items, excluded, weight_info, adjustments, unchecked, warnings)
