"""
Rule-based product comparison (no AI).

For every specification we decide whether the listed data supports calling
one product "best". We only highlight a winner when:

  * every compared product has a readable value for that spec,
  * the values can be compared fairly (same product type, same unit), and
  * the values actually differ.

For specs measured by several numbers (processor, display, graphics) a
product only wins if it is at least as good as every other product on every
available measure. If one product has more cores but another has a higher
clock speed, we say "no clear winner" instead of guessing.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product import Product
from app.schemas.comparison import (
    ComparisonResponse,
    ComparisonSummary,
    ProductAnalysis,
    SpecComparison,
    SpecValue,
)
from app.schemas.product import ProductRead
from app.services.spec_parser import parse_battery, parse_display, parse_graphics, parse_processor, parse_size_gb

MAX_COMPARE = 4
METHOD = "Rule-based comparison of the listed specifications. No AI is used."


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------
def format_inr(value: Decimal | float) -> str:
    """124990 -> '₹1,24,990' (Indian digit grouping)."""
    digits = str(int(round(float(value))))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        digits = ",".join(groups) + "," + tail
    return "₹" + digits


def format_gb(value: float) -> str:
    if value >= 1024 and value % 1024 == 0:
        return f"{value / 1024:g} TB"
    return f"{value:g} GB"


def join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


# ---------------------------------------------------------------------------
# Generic winner logic
# ---------------------------------------------------------------------------
@dataclass
class Measure:
    """One number we can rank, e.g. RAM in GB or refresh rate in Hz."""

    name: str  # used in "X has more cores" sentences
    values: dict[str, float | None]
    higher_is_better: bool = True

    def complete(self) -> bool:
        return all(v is not None for v in self.values.values())

    def differs(self) -> bool:
        return len(set(self.values.values())) > 1

    def best_value(self) -> float:
        nums = [v for v in self.values.values() if v is not None]
        return max(nums) if self.higher_is_better else min(nums)

    def worst_value(self) -> float:
        nums = [v for v in self.values.values() if v is not None]
        return min(nums) if self.higher_is_better else max(nums)


@dataclass
class SpecResult:
    """A spec comparison plus the per-product phrases used for advantages/disadvantages."""

    comparison: SpecComparison
    advantage: dict[str, str] = field(default_factory=dict)
    disadvantage: dict[str, str] = field(default_factory=dict)


@dataclass
class Ranking:
    best: list[str]
    worst: list[str]
    all_equal: bool = False
    # When there is no overall winner: who leads on each measure, e.g. [(["a"], "most cores"), (["b"], "highest clock speed")]
    trade_offs: list[tuple[list[str], str]] = field(default_factory=list)


def rank(slugs: list[str], measures: list[Measure]) -> Ranking:
    """
    Find the products that are best on *every* measure that differs.
    `measures` must be complete (no missing values).
    """
    differing = [m for m in measures if m.differs()]
    if not differing:
        return Ranking([], [], all_equal=True)
    best = [s for s in slugs if all(m.values[s] == m.best_value() for m in differing)]
    worst = [s for s in slugs if all(m.values[s] == m.worst_value() for m in differing)]
    if best:
        return Ranking(best, worst)
    trade_offs = [([s for s in slugs if m.values[s] == m.best_value()], m.name) for m in differing]
    return Ranking([], [], trade_offs=trade_offs)


SAME_VALUES = "The listed values are the same for every product."


# ---------------------------------------------------------------------------
# Comparison builder
# ---------------------------------------------------------------------------
class Comparison:
    def __init__(self, products: list[Product]):
        self.products = products
        self.slugs = [p.slug for p in products]
        self.by_slug = {p.slug: p for p in products}
        self.same_category = len({p.category_id for p in products}) == 1

    # -- helpers ------------------------------------------------------------
    def name(self, slug: str) -> str:
        return self.by_slug[slug].name

    def names(self, slugs: list[str]) -> str:
        return join_names([self.name(s) for s in slugs])

    def spec(self, product: Product, attr: str) -> str | None:
        return getattr(product.specifications, attr, None) if product.specifications else None

    def values(self, attr: str) -> list[SpecValue]:
        return [SpecValue(slug=p.slug, display=self.spec(p, attr)) for p in self.products]

    def trade_off_text(self, ranking: Ranking) -> str:
        parts = [f"{self.names(slugs)} {'has' if len(slugs) == 1 else 'have'} the {label}" for slugs, label in ranking.trade_offs]
        return "No clear winner — " + "; ".join(parts) + "."

    def result(self, key: str, label: str, values: list[SpecValue], best: list[str] | None = None,
               reason: str | None = None, not_compared: str | None = None) -> SpecResult:
        if len(self.products) < 2:
            best, reason, not_compared = [], None, "Add another product to compare."
        return SpecResult(SpecComparison(key=key, label=label, values=values, best=best or [], reason=reason, not_compared=not_compared))

    def missing_for(self, parsed: dict[str, object]) -> list[str]:
        return [s for s, v in parsed.items() if v is None]

    # -- single-number specs (price, RAM, storage, battery) --------------------
    def single(self, key: str, label: str, values: list[SpecValue], measure: Measure,
               fmt: Callable[[float], str], best_word: str, worst_word: str, missing_word: str = "Not listed") -> SpecResult:
        missing = [s for s, v in measure.values.items() if v is None]
        if missing:
            return self.result(key, label, values, not_compared=f"{missing_word} for {self.names(missing)}, so it can’t be compared fairly.")
        ranking = rank(self.slugs, [measure])
        if ranking.all_equal:
            return self.result(key, label, values, not_compared=SAME_VALUES)
        best_text = fmt(measure.best_value())
        res = self.result(key, label, values, best=ranking.best, reason=f"{best_word}: {best_text}")
        if len(self.products) >= 2:
            for s in ranking.best:
                res.advantage[s] = f"{best_word} ({best_text})"
            for s in ranking.worst:
                res.disadvantage[s] = f"{worst_word} ({fmt(measure.worst_value())})"
        return res

    def price(self) -> SpecResult:
        prices = {p.slug: float(p.price_inr) for p in self.products}
        values = [SpecValue(slug=p.slug, display=format_inr(p.price_inr)) for p in self.products]
        res = self.single("price", "Price", values, Measure("lowest price", prices, higher_is_better=False), format_inr, "Lowest price", "Highest price")
        if res.comparison.best and len(self.products) >= 2:
            cheapest = min(prices.values())
            for s in list(res.disadvantage):
                res.disadvantage[s] = f"Highest price ({format_inr(prices[s] - cheapest)} more than the cheapest)"
        return res

    def memory(self, key: str, label: str, attr: str, best_word: str, worst_word: str) -> SpecResult:
        parsed = {p.slug: parse_size_gb(self.spec(p, attr)) for p in self.products}
        return self.single(key, label, self.values(attr), Measure(label, parsed), format_gb, best_word, worst_word)

    def battery(self) -> SpecResult:
        values = self.values("battery")
        if not self.same_category:
            return self.result("battery", "Battery", values, not_compared="Different product types, so battery capacities aren’t comparable.")
        parsed = {p.slug: parse_battery(self.spec(p, "battery")) for p in self.products}
        if missing := self.missing_for(parsed):
            return self.result("battery", "Battery", values, not_compared=f"Not listed for {self.names(missing)}, so it can’t be compared fairly.")
        units = {b.unit for b in parsed.values() if b}
        if len(units) > 1:
            return self.result("battery", "Battery", values, not_compared="Listed in different units (mAh and Wh), so capacities can’t be compared.")
        unit = "mAh" if units == {"mah"} else "Wh"
        measure = Measure("battery", {s: b.value if b else None for s, b in parsed.items()})
        fmt = lambda v: f"{v:,.0f} {unit}" if unit == "mAh" else f"{v:g} {unit}"  # noqa: E731
        return self.single("battery", "Battery", values, measure, fmt, "Largest battery", "Smallest battery")

    # -- multi-number specs (processor, display, graphics) ----------------------
    def multi(self, key: str, label: str, values: list[SpecValue], measures: list[Measure],
              describe: Callable[[str, list[Measure]], str], best_word: str, worst_word: str, vague: str) -> SpecResult:
        usable = [m for m in measures if m.complete()]
        skipped = [m for m in measures if not m.complete() and any(v is not None for v in m.values.values())]
        if not usable:
            return self.result(key, label, values, not_compared=vague)
        ranking = rank(self.slugs, usable)
        note = ""
        if skipped:
            missing = sorted({s for m in skipped for s, v in m.values.items() if v is None}, key=self.slugs.index)
            note = f" ({join_names([m.name.split(' ', 1)[-1] for m in skipped])} not listed for {self.names(missing)}, so not used.)"
        if ranking.all_equal:
            nouns = join_names([m.name.split(" ", 1)[-1] for m in usable])
            verb = "is" if len(usable) == 1 else "are"
            return self.result(key, label, values, not_compared=f"The listed {nouns} {verb} the same for every product.{note}")
        if ranking.trade_offs:
            return self.result(key, label, values, not_compared=self.trade_off_text(ranking) + note)
        differing = [m for m in usable if m.differs()]
        res = self.result(key, label, values, best=ranking.best, reason=f"{best_word}: {describe(ranking.best[0], differing)}{note}")
        if len(self.products) >= 2:
            for s in ranking.best:
                res.advantage[s] = f"{best_word} ({describe(s, differing)})"
            for s in ranking.worst:
                res.disadvantage[s] = f"{worst_word} ({describe(s, differing)})"
        return res

    def processor(self) -> SpecResult:
        values = self.values("processor")
        if not self.same_category:
            return self.result("processor", "Processor", values, not_compared="Different product types use very different chips, so they aren’t compared.")
        parsed = {p.slug: parse_processor(self.spec(p, "processor")) for p in self.products}
        if missing := self.missing_for(parsed):
            return self.result("processor", "Processor", values, not_compared=f"Not listed for {self.names(missing)}.")
        cores = Measure("highest core count", {s: float(p.cores) if p and p.cores else None for s, p in parsed.items()})
        ghz = Measure("highest clock speed", {s: p.max_ghz if p else None for s, p in parsed.items()})

        def describe(slug: str, used: list[Measure]) -> str:
            parts = []
            if cores in used:
                parts.append(f"{int(cores.values[slug])} cores")
            if ghz in used:
                parts.append(f"up to {ghz.values[slug]:g} GHz")
            return ", ".join(parts)

        return self.multi("processor", "Processor", values, [cores, ghz], describe,
                          "Strongest listed processor", "Weakest listed processor",
                          "The listed details (core count, clock speed) aren’t specific enough to compare.")

    def display(self) -> SpecResult:
        values = self.values("display")
        if not self.same_category:
            return self.result("display", "Display", values, not_compared="Different product types have very different screens, so they aren’t compared.")
        parsed = {p.slug: parse_display(self.spec(p, "display")) for p in self.products}
        if missing := self.missing_for(parsed):
            return self.result("display", "Display", values, not_compared=f"Not listed for {self.names(missing)}.")
        refresh = Measure("highest refresh rate", {s: float(d.refresh_hz) if d and d.refresh_hz else None for s, d in parsed.items()})
        pixels = Measure("highest resolution", {s: float(d.pixels) if d and d.pixels else None for s, d in parsed.items()})

        def describe(slug: str, used: list[Measure]) -> str:
            d = parsed[slug]
            parts = []
            if refresh in used and d:
                parts.append(f"{d.refresh_hz} Hz")
            if pixels in used and d:
                parts.append(f"{d.width}×{d.height}")
            return ", ".join(parts)

        return self.multi("display", "Display", values, [refresh, pixels], describe,
                          "Best listed display", "Weakest listed display",
                          "The listed details (refresh rate, resolution) aren’t specific enough to compare.")

    def graphics(self) -> SpecResult:
        values = self.values("graphics")
        if all(v.display is None for v in values):
            return self.result("graphics", "Graphics", values, not_compared="Not listed for these products.")
        if not self.same_category:
            return self.result("graphics", "Graphics", values, not_compared="Different product types, so graphics aren’t compared.")
        parsed = {p.slug: parse_graphics(self.spec(p, "graphics")) for p in self.products}
        if missing := self.missing_for(parsed):
            return self.result("graphics", "Graphics", values, not_compared=f"Not listed for {self.names(missing)}.")
        unclear = [s for s, g in parsed.items() if g and g.dedicated is None]
        if unclear:
            return self.result("graphics", "Graphics", values, not_compared=f"Can’t tell whether {self.names(unclear)} has dedicated graphics.")
        dedicated = Measure("best graphics type", {s: 1.0 if g and g.dedicated else 0.0 for s, g in parsed.items()})
        vram = Measure("most graphics memory", {s: g.vram_gb if g and g.dedicated else None for s, g in parsed.items()})
        measures = [dedicated] if not dedicated.complete() or dedicated.differs() else [dedicated, vram]

        def describe(slug: str, used: list[Measure]) -> str:
            g = parsed[slug]
            if g and g.dedicated:
                return f"dedicated, {format_gb(g.vram_gb)}" if g.vram_gb else "dedicated"
            return "integrated"

        res = self.multi("graphics", "Graphics", values, measures, describe,
                         "Best listed graphics", "Weaker graphics", "The listed graphics details aren’t specific enough to compare.")
        # Friendlier wording when the difference is dedicated vs integrated graphics
        if dedicated.differs():
            for s in res.advantage:
                g = parsed[s]
                res.advantage[s] = f"Dedicated graphics ({format_gb(g.vram_gb)})" if g and g.vram_gb else "Dedicated graphics"
            for s in res.disadvantage:
                res.disadvantage[s] = "Integrated graphics only"
        return res

    # -- feature notes that don't need a ranking ----------------------------------
    def feature_advantages(self) -> dict[str, list[str]]:
        """Facts worth calling out when not every product shares them (e.g. an OLED screen)."""
        panels = {p.slug: (parse_display(self.spec(p, "display")) or None) for p in self.products}
        labels = {"oled": "OLED display", "mini-led": "Mini-LED display"}
        found = {s: labels.get(d.panel) if d and d.panel else None for s, d in panels.items()}
        out: dict[str, list[str]] = {s: [] for s in self.slugs}
        if len(self.products) >= 2 and len(set(found.values())) > 1:
            for s, label in found.items():
                if label:
                    out[s].append(label)
        return out

    # -- assemble -------------------------------------------------------------
    def build(self) -> ComparisonResponse:
        results = [
            self.price(),
            self.processor(),
            self.memory("ram", "RAM", "ram", "Most RAM", "Least RAM"),
            self.memory("storage", "Storage", "storage", "Most storage", "Least storage"),
            self.battery(),
            self.display(),
            self.graphics(),
        ]
        specs = [r.comparison for r in results]
        features = self.feature_advantages()

        analysis = []
        for p in self.products:
            led = [r.comparison.label for r in results if p.slug in r.comparison.best]
            missing = [
                r.comparison.label for r in results
                if r.comparison.key not in ("price",)
                and not (r.comparison.key == "graphics" and p.category.slug != "laptops")
                and self.spec(p, r.comparison.key) is None
            ]
            analysis.append(ProductAnalysis(
                slug=p.slug,
                advantages=[r.advantage[p.slug] for r in results if p.slug in r.advantage] + features[p.slug],
                disadvantages=[r.disadvantage[p.slug] for r in results if p.slug in r.disadvantage],
                specs_led=led,
                missing_specs=missing,
            ))

        return ComparisonResponse(
            products=[ProductRead.model_validate(p) for p in self.products],
            missing=[],
            specs=specs,
            analysis=analysis,
            summary=self.summary(results, analysis),
            method=METHOD,
        )

    def summary(self, results: list[SpecResult], analysis: list[ProductAnalysis]) -> ComparisonSummary:
        if len(self.products) < 2:
            only = self.products[0].name if self.products else "this product"
            return ComparisonSummary(headline=f"Add at least one more product to compare with {only}.", points=[], notes=[],
                                     lowest_price=None, most_specs_led=None, compared_specs=0)

        compared = [r.comparison for r in results if r.comparison.best]
        wins = {a.slug: len(a.specs_led) for a in analysis}
        top = max(wins.values())
        leaders = [s for s, w in wins.items() if w == top]
        price_best = results[0].comparison.best
        prices = {p.slug: float(p.price_inr) for p in self.products}
        cheapest_slug = min(prices, key=prices.get)  # type: ignore[arg-type]

        if not compared:
            headline = "The listed specs don’t show a clear winner in any category."
        elif top == 0:
            headline = "No product leads in any compared spec."
        elif len(leaders) == 1:
            leader = leaders[0]
            headline = f"{self.name(leader)} leads in {top} of {len(compared)} compared specs."
            if price_best and leader not in price_best:
                diff = prices[leader] - prices[cheapest_slug]
                headline += f" {self.name(cheapest_slug)} costs {format_inr(diff)} less."
        else:
            headline = f"{self.names(leaders)} each lead in {top} of {len(compared)} compared specs."

        points = []
        for a in analysis:
            if a.specs_led:
                points.append(f"{self.name(a.slug)} is best for {join_names([l.lower() if l not in ('RAM',) else l for l in a.specs_led])}.")
            else:
                points.append(f"{self.name(a.slug)} doesn’t lead in any compared spec.")
        lo, hi = min(prices.values()), max(prices.values())
        if hi > lo:
            points.append(f"Prices range from {format_inr(lo)} to {format_inr(hi)} — a difference of {format_inr(hi - lo)}.")

        notes = []
        for r in results:
            c = r.comparison
            if c.not_compared and not (c.key == "graphics" and all(v.display is None for v in c.values)):
                notes.append(f"{c.label} not compared: {c.not_compared}")
        if any(r.comparison.key == "battery" and r.comparison.best for r in results):
            notes.append("Battery capacity is not the same as battery life, which also depends on the chip and screen.")
        if not self.same_category:
            notes.append("You’re comparing different product types, so only price, RAM and storage are ranked.")
        if all(p.is_demo for p in self.products):
            notes.append("All compared products are demo data, so these results are illustrative only.")
        elif any(p.is_demo for p in self.products):
            notes.append("Some compared products are demo data.")

        return ComparisonSummary(
            headline=headline,
            points=points,
            notes=notes,
            lowest_price=price_best[0] if len(price_best) == 1 else None,
            most_specs_led=leaders[0] if len(leaders) == 1 and top > 0 else None,
            compared_specs=len(compared),
        )


def compare_products(db: Session, slugs: list[str]) -> ComparisonResponse:
    """Compare up to four products by slug. Unknown slugs are reported in `missing`."""
    unique = list(dict.fromkeys(s.strip() for s in slugs if s.strip()))
    found = {p.slug: p for p in db.scalars(select(Product).where(Product.slug.in_(unique))).unique().all()}
    products = [found[s] for s in unique if s in found]
    response = Comparison(products).build()
    response.missing = [s for s in unique if s not in found]
    return response
