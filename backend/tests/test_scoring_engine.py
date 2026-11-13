"""Unit tests for the deterministic scoring engine (no database, no AI)."""

import inspect

import pytest

from app.schemas.ai import ShoppingPreferences
from app.services import scoring_engine as engine
from app.services.scoring_engine import ProductInput, Scale, score_products


def laptop(slug, price, *, processor="8-core CPU, up to 4.0 GHz", ram="16 GB", storage="512 GB SSD", battery="60 Wh",
           display='14" 1920×1200 IPS, 60 Hz', graphics="Integrated"):
    return ProductInput(slug=slug, name=slug.upper(), category="laptops", price=price, processor=processor, ram=ram,
                        storage=storage, battery=battery, display=display, graphics=graphics)


def phone(slug, price, *, ram="8 GB", storage="128 GB", battery="5,000 mAh", display='6.5" OLED, 120 Hz', processor="Octa-core 4 nm chip"):
    return ProductInput(slug=slug, name=slug.upper(), category="smartphones", price=price, processor=processor, ram=ram,
                        storage=storage, battery=battery, display=display, graphics=None)


def prefs(**kw) -> ShoppingPreferences:
    return ShoppingPreferences(**kw)


def criterion(item, name):
    return next(r for r in item.breakdown if r.criterion == name)


# ---------------------------------------------------------------------------
# Scales and criterion scores
# ---------------------------------------------------------------------------
def test_linear_and_log_scales_clamp():
    linear = Scale(40, 100, "Wh")
    assert (linear.score(40), linear.score(70), linear.score(100)) == (0.0, 50.0, 100.0)
    assert (linear.score(10), linear.score(150)) == (0.0, 100.0)
    log = Scale(4, 32, "GB", log=True)
    assert (log.score(4), log.score(8), log.score(16), log.score(32)) == (0.0, 33.3, 66.7, 100.0)


def test_processor_needs_cores_and_clock_speed():
    r = engine.score_processor(laptop("a", 1, processor="16-core CPU, up to 5.0 GHz"))
    assert r.score == 100.0 and "16 cores × 5 GHz = 80" in r.detail
    phone_r = engine.score_processor(phone("p", 1))
    assert phone_r.score is None and "core count and a clock speed" in phone_r.detail
    missing = engine.score_processor(laptop("b", 1, processor=None))
    assert missing.score is None and "not listed" in missing.detail


def test_ram_and_storage_use_category_scales():
    assert engine.score_specs(laptop("a", 1, ram="8 GB", storage="1 TB SSD"))["ram"].score == 33.3
    assert engine.score_specs(laptop("a", 1, storage="1 TB SSD"))["storage"].score == 75.0
    assert engine.score_specs(phone("p", 1, ram="8 GB"))["ram"].score == 50.0  # phones: 4–16 GB


def test_battery_unit_must_match_category():
    assert engine.score_battery(laptop("a", 1, battery="70 Wh")).score == 50.0
    assert engine.score_battery(phone("p", 1, battery="4,500 mAh")).score == 50.0
    wrong = engine.score_battery(laptop("a", 1, battery="5000 mAh"))
    assert wrong.score is None and "doesn’t match" in wrong.detail


def test_display_averages_listed_parts_only():
    both = engine.score_display(laptop("a", 1, display='16" 3840×2400 OLED, 240 Hz'))
    assert both.score == 100.0
    refresh_only = engine.score_display(phone("p", 1, display='6.6" AMOLED, 144 Hz'))
    assert refresh_only.score == 100.0 and "resolution not listed" in refresh_only.detail
    nothing = engine.score_display(laptop("a", 1, display="Big and bright"))
    assert nothing.score is None


# ---------------------------------------------------------------------------
# Weights
# ---------------------------------------------------------------------------
def test_default_weights_sum_to_100():
    effective, info, adjustments = engine.resolve_weights(prefs(), None, True)
    assert round(sum(effective.values()), 1) == 100.0
    assert adjustments == [] and all(w.multiplier == 1.0 for w in info)


def test_usage_and_priority_adjust_weights_with_reasons():
    p = prefs(use_cases=["Java development"], priorities=["Battery life"])
    effective, info, adjustments = engine.resolve_weights(p, None, True)
    base, _, _ = engine.resolve_weights(prefs(), None, True)
    assert effective["ram"] > base["ram"] and effective["battery"] > base["battery"]
    assert effective["storage"] < base["storage"]  # others shrink after normalising
    reasons = {(a.criterion, a.reason) for a in adjustments}
    assert ("ram", "Use “Java development” (programming / multitasking)") in reasons
    assert ("battery", "Priority “Battery life”") in reasons


def test_usage_adjustment_can_be_turned_off():
    p = prefs(use_cases=["Gaming"])
    effective, _, adjustments = engine.resolve_weights(p, None, adjust_for_usage=False)
    assert adjustments == []
    assert effective == engine.resolve_weights(prefs(), None, True)[0]


def test_custom_weights_and_all_zero_fallback():
    effective, _, _ = engine.resolve_weights(prefs(), {"ram": 100, "processor": 0, "battery": 0, "storage": 0, "display": 0, "value": 0}, False)
    assert effective["ram"] == 100.0 and effective["value"] == 0.0
    fallback, _, _ = engine.resolve_weights(prefs(), {c: 0 for c in engine.CRITERIA}, False)
    assert fallback == engine.resolve_weights(prefs(), None, False)[0]


def test_multipliers_are_capped():
    p = prefs(use_cases=["Java coding", "programming", "software development", "multitasking"])
    _, info, _ = engine.resolve_weights(p, None, True)
    assert next(w for w in info if w.criterion == "ram").multiplier == engine.MAX_MULTIPLIER


# ---------------------------------------------------------------------------
# Totals, ranking and explanations
# ---------------------------------------------------------------------------
def test_total_is_weighted_average_and_contributions_add_up():
    items = score_products([laptop("a", 50000), laptop("b", 90000, ram="32 GB", battery="90 Wh")], prefs()).items
    for item in items:
        assert 0 <= item.score <= 100
        assert sum(r.contribution for r in item.breakdown if r.contribution is not None) == pytest.approx(item.score, abs=0.3)
        assert round(sum(r.weight for r in item.breakdown), 1) == 100.0


def test_ranked_best_to_worst_with_sequential_ranks():
    items = score_products([laptop("weak", 60000, ram="8 GB", battery="45 Wh"),
                            laptop("strong", 60000, ram="32 GB", battery="90 Wh", processor="16-core CPU, up to 5.0 GHz")], prefs()).items
    assert [i.product.slug for i in items] == ["strong", "weak"]
    assert [i.rank for i in items] == [1, 2]
    assert items[0].score > items[1].score


def test_missing_spec_is_not_scored_and_lowers_coverage():
    item = next(i for i in score_products([laptop("full", 60000), laptop("gap", 60000, battery=None)], prefs()).items if i.product.slug == "gap")
    battery = criterion(item, "battery")
    assert battery.score is None and battery.contribution is None
    assert "not listed" in battery.detail
    assert item.coverage < 100
    assert any("Battery not scored" in w for w in item.weaknesses)
    assert "based on" in item.summary  # summary mentions partial data


def test_missing_spec_is_not_treated_as_zero():
    # Same product with and without a listed weak battery: missing must not score like the weak one
    weak_battery = score_products([laptop("x", 60000, battery="40 Wh"), laptop("ref", 70000)], prefs()).items
    no_battery = score_products([laptop("x", 60000, battery=None), laptop("ref", 70000)], prefs()).items
    score = lambda items: next(i.score for i in items if i.product.slug == "x")  # noqa: E731
    assert score(no_battery) > score(weak_battery)


def test_value_for_money_is_relative_and_needs_two_products():
    items = score_products([laptop("cheap", 40000), laptop("pricey", 120000)], prefs()).items
    by_slug = {i.product.slug: criterion(i, "value").score for i in items}
    assert by_slug == {"cheap": 100.0, "pricey": 0.0}  # same specs, a third of the price
    single = score_products([laptop("only", 40000)], prefs()).items[0]
    assert criterion(single, "value").score is None
    assert "only one" in criterion(single, "value").detail


def test_strengths_and_weaknesses_follow_thresholds():
    item = score_products([laptop("a", 60000, ram="32 GB", display='14" 1920×1080 IPS, 60 Hz'), laptop("b", 60000)], prefs()).items
    a = next(i for i in item if i.product.slug == "a")
    assert any(s.startswith("RAM: 32 GB") for s in a.strengths)
    assert any(w.startswith("Display:") for w in a.weaknesses)


def test_deterministic_tie_break_by_coverage_price_then_name():
    items = score_products([laptop("b", 60000), laptop("a", 60000), laptop("c", 50000)], prefs(), adjust_for_usage=False,
                           base_weights={"ram": 100, "processor": 0, "battery": 0, "storage": 0, "display": 0, "value": 0}).items
    assert [i.product.slug for i in items] == ["c", "a", "b"]  # equal scores -> cheaper, then name


def test_same_input_gives_identical_output():
    products = [laptop("a", 60000), laptop("b", 80000, ram="32 GB"), laptop("c", 45000, battery=None)]
    p = prefs(use_cases=["Gaming"], priorities=["Battery life"])
    first, second = score_products(products, p), score_products(products, p)
    assert [(i.product.slug, i.score, i.coverage) for i in first.items] == [(i.product.slug, i.score, i.coverage) for i in second.items]


# ---------------------------------------------------------------------------
# Requirements (must-haves)
# ---------------------------------------------------------------------------
def hw(spec, preference, mandatory=False):
    return {"spec": spec, "preference": preference, "reason": "", "mandatory": mandatory}


def test_mandatory_requirement_excludes_failing_and_unconfirmed_products():
    products = [laptop("ok", 60000, ram="16 GB"), laptop("low", 50000, ram="8 GB"), laptop("unknown", 55000, ram=None)]
    result = score_products(products, prefs(hardware_preferences=[hw("ram", "At least 16 GB", mandatory=True)]))
    assert [i.product.slug for i in result.items] == ["ok"]
    reasons = {e.product.slug: e.reasons[0] for e in result.excluded}
    assert "not met" in reasons["low"] and "can’t confirm" in reasons["unknown"]


def test_optional_requirement_only_explains_without_excluding():
    products = [laptop("ok", 60000, ram="16 GB"), laptop("low", 50000, ram="8 GB")]
    result = score_products(products, prefs(hardware_preferences=[hw("ram", "At least 16 GB")]))
    assert len(result.items) == 2 and result.excluded == []
    low = next(i for i in result.items if i.product.slug == "low")
    assert low.weaknesses[0] == "Doesn’t meet “RAM: At least 16 GB” (8 GB)"


def test_dedicated_graphics_requirement():
    products = [laptop("gpu", 90000, graphics="Dedicated GPU, 8 GB"), laptop("igpu", 60000)]
    result = score_products(products, prefs(hardware_preferences=[hw("graphics", "Dedicated graphics", mandatory=True)]))
    assert [i.product.slug for i in result.items] == ["gpu"]


def test_phone_battery_threshold():
    products = [phone("big", 30000, battery="5,000 mAh"), phone("small", 25000, battery="4,000 mAh")]
    result = score_products(products, prefs(hardware_preferences=[hw("battery", "5,000 mAh or more", mandatory=True)]))
    assert [i.product.slug for i in result.items] == ["big"]


def test_unmeasurable_mandatory_requirement_is_reported_not_applied():
    result = score_products([laptop("a", 60000)], prefs(hardware_preferences=[hw("processor", "High-performance processor", mandatory=True)]))
    assert len(result.items) == 1
    assert result.unchecked_requirements[0][0] == "Processor: High-performance processor"
    assert any("isn’t used as a must-have" in w for w in result.warnings)


def test_warns_when_a_criterion_cannot_be_scored_for_any_product():
    result = score_products([phone("a", 30000), phone("b", 40000)], prefs())
    assert any("Processor couldn’t be scored for any matching product" in w for w in result.warnings)


def test_engine_does_not_use_ai():
    source = inspect.getsource(engine)
    assert "gemini" not in source.lower().replace("gemini only extracts", "")
    assert "import httpx" not in source and "app.ai" not in source
