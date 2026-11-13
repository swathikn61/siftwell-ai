"""
AI preference extraction: turn a shopping request into structured preferences.

    "I need a laptop under ₹70,000 for Java development … Battery life is important."
      -> category=laptops, max_budget_inr=70000, use_cases=[…], priorities=["Battery life"], …

How it works
------------
1. Ask Gemini for JSON that follows RESPONSE_SCHEMA
   (structured output, temperature 0).
2. Tidy the reply (e.g. "₹70,000" -> 70000, "laptop" -> "laptops") and
   validate it with Pydantic. If the JSON is broken or invalid, ask once more,
   telling the model what was wrong.
3. Check the result against the user's own words so nothing is made up:
   budgets and brands must appear in the request, explicit category words win,
   and hardware suggestions that name specific chips/products are removed.
4. If Gemini is unavailable, rate-limited, too slow, or keeps returning bad
   data, fall back to the rule-based parser and say so in `warnings`.

This module knows nothing about HTTP routes; the API layer just calls
`PreferenceExtractor.extract()`.
"""

import logging
import re
import time
from typing import Any

from pydantic import ValidationError

from app.ai import rules
from app.ai.errors import AIBadResponseError, AIError, AIUnavailableError
from app.ai.gemini_client import CallTiming, GeminiClient
from app.core.config import settings
from app.schemas.ai import AIDiagnostics, PreferenceResponse, SearchFilters, ShoppingPreferences

logger = logging.getLogger("siftwell.ai")

SPECS = ["processor", "ram", "storage", "battery", "display", "graphics"]

# Kept short on purpose: fewer prompt tokens and shorter answers = faster replies.
SYSTEM_PROMPT = """Extract a shopper's preferences from their request to an Indian electronics store. Return JSON only.
- category: "laptops" or "smartphones" only if the product type is named, else null.
- max_budget_inr, min_budget_inr: whole rupees ("₹70,000"->70000, "50k"->50000, "1.5 lakh"->150000). min only if a lower limit is stated. Never guess: use null.
- use_cases, priorities: short phrases from the shopper's words. Priorities only if stated.
- hardware_preferences: up to 3 general guidelines for the specs that matter most; reason under 10 words. Never name products, brands or chips.
  Laptops: coding/multitasking -> ram "At least 16 GB"; gaming -> graphics "Dedicated graphics"; editing -> processor "High-performance processor"; battery life -> battery "Large battery capacity"; many files -> storage "At least 512 GB".
  Phones: battery life -> battery "5,000 mAh or more"; gaming -> display "High refresh rate". No graphics for phones.
- brands: only brands the shopper named."""

# JSON Schema subset supported by Gemini structured output (nullable = ["type", "null"]).
# Small maxItems limits keep the answer short.
_NULLABLE_INT = {"type": ["integer", "null"]}
_SHORT_LIST = lambda n: {"type": "array", "items": {"type": "string"}, "maxItems": n}  # noqa: E731
RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "category": {"type": ["string", "null"]},
        "min_budget_inr": _NULLABLE_INT,
        "max_budget_inr": _NULLABLE_INT,
        "use_cases": _SHORT_LIST(4),
        "priorities": _SHORT_LIST(3),
        "hardware_preferences": {
            "type": "array",
            "maxItems": 3,
            "items": {
                "type": "object",
                "properties": {"spec": {"type": "string", "enum": SPECS}, "preference": {"type": "string"}, "reason": {"type": "string"}},
                "required": ["spec", "preference", "reason"],
            },
        },
        "brands": _SHORT_LIST(3),
    },
    "required": ["category", "min_budget_inr", "max_budget_inr", "use_cases", "priorities", "hardware_preferences", "brands"],
}

# A retry only happens if the first attempt failed quickly and there is enough time left,
# so users never wait for two slow calls in a row.
FAST_FAILURE_SECONDS = 3.0
MIN_RETRY_SECONDS = 3.0

# Mentions of specific hardware that a *preference* should never contain
_SPECIFIC_HARDWARE = re.compile(
    r"\b(intel|amd|ryzen|core\s*i[3579]|core\s*ultra|rtx|gtx|radeon|geforce|nvidia|snapdragon|dimensity|exynos|tensor|"
    r"bionic|apple\s*m\d|m[1-4]\s*(pro|max)?\s*chip|a1\d\s*bionic|iphone|galaxy|pixel|macbook|thinkpad)\b",
    re.IGNORECASE,
)

_SPEC_SYNONYMS = {
    "cpu": "processor", "chip": "processor", "chipset": "processor", "processor": "processor",
    "ram": "ram", "memory": "ram",
    "storage": "storage", "ssd": "storage", "disk": "storage", "rom": "storage",
    "battery": "battery", "battery life": "battery",
    "display": "display", "screen": "display",
    "graphics": "graphics", "gpu": "graphics", "graphics card": "graphics",
}

_CATEGORY_SYNONYMS = {
    "laptop": "laptops", "laptops": "laptops", "notebook": "laptops",
    "smartphone": "smartphones", "smartphones": "smartphones", "phone": "smartphones", "mobile": "smartphones",
}


class InvalidAIResponse(AIBadResponseError):
    """The model replied with JSON that failed validation."""


def _to_int(value: Any) -> int | None:
    """70000, 70000.0, "70000", "₹70,000", "70k" -> 70000. Anything else -> None."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value) if value > 0 else None
    if isinstance(value, str):
        m = re.search(r"(\d+(?:[.,]\d+)*)\s*(k|l|lakh|lakhs)?\b", value.lower())
        if m:
            amount = rules.to_rupees(m.group(1), m.group(2))
            return amount if amount > 0 else None
    return None


def _to_str_list(value: Any) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    return [str(v) for v in value if isinstance(v, (str, int, float)) and str(v).strip()]


def tidy_ai_output(data: Any, warnings: list[str]) -> dict[str, Any]:
    """Coerce the model's JSON into the shape ShoppingPreferences expects."""
    if not isinstance(data, dict):
        raise InvalidAIResponse("The model’s JSON wasn’t an object.")

    category = data.get("category")
    if isinstance(category, str):
        category = _CATEGORY_SYNONYMS.get(category.strip().lower())
    else:
        category = None

    min_b, max_b = _to_int(data.get("min_budget_inr")), _to_int(data.get("max_budget_inr"))
    if min_b is not None and max_b is not None and min_b > max_b:
        min_b, max_b = max_b, min_b
        warnings.append("Swapped the minimum and maximum budget, which were the wrong way round.")

    hardware = []
    for item in data.get("hardware_preferences") or []:
        if not isinstance(item, dict):
            continue
        spec = _SPEC_SYNONYMS.get(str(item.get("spec", "")).strip().lower())
        preference = str(item.get("preference") or "").strip()
        if spec and preference:
            hardware.append({"spec": spec, "preference": preference[:80], "reason": str(item.get("reason") or "")[:140]})

    return {
        "category": category,
        "min_budget_inr": min_b,
        "max_budget_inr": max_b,
        "use_cases": _to_str_list(data.get("use_cases")),
        "priorities": _to_str_list(data.get("priorities")),
        "hardware_preferences": hardware,
        "brands": _to_str_list(data.get("brands")),
    }


def search_filters(prefs: ShoppingPreferences) -> SearchFilters:
    return SearchFilters(category=prefs.category, min_price=prefs.min_budget_inr, max_price=prefs.max_budget_inr, brand=prefs.brands)


class PreferenceExtractor:
    def __init__(self, client: GeminiClient | None = None) -> None:
        self.client = client or GeminiClient()

    # -- public ---------------------------------------------------------------
    def extract(self, query: str, known_brands: list[str] | None = None) -> PreferenceResponse:
        start = time.perf_counter()
        parsed = rules.parse(query)
        known_brands = known_brands or []
        warnings: list[str] = []
        calls: list[CallTiming] = []
        try:
            data, model = self._ask_model(query, warnings, calls)
            prefs = self._check_against_request(data, query, parsed, known_brands, warnings)
            source, used_model = "ai", model
        except AIError as exc:
            logger.warning("AI extraction failed (%s): %s", exc.code, exc)
            warnings.append(f"AI wasn’t available ({exc}) Used basic text matching instead.")
            prefs = self._from_rules(query, parsed, known_brands)
            source, used_model = "rules", None
        total_ms = int((time.perf_counter() - start) * 1000)
        diagnostics = self._diagnostics(calls, total_ms) if calls else None
        if diagnostics:
            logger.info(
                "AI timing: total=%sms api=%sms connect=%sms wait=%sms server=%sms tokens in/out/thought=%s/%s/%s attempts=%s",
                diagnostics.extraction_total_ms, diagnostics.api_total_ms, diagnostics.connect_ms, diagnostics.model_wait_ms,
                diagnostics.server_ms, diagnostics.prompt_tokens, diagnostics.output_tokens, diagnostics.thought_tokens, diagnostics.attempts,
            )
        return PreferenceResponse(
            preferences=prefs,
            search=search_filters(prefs),
            source=source,
            model=used_model,
            duration_ms=total_ms,
            warnings=warnings,
            diagnostics=diagnostics,
        )

    @staticmethod
    def from_user(prefs: ShoppingPreferences, warnings: list[str] | None = None) -> PreferenceResponse:
        """Preferences edited by the user (already validated by Pydantic)."""
        return PreferenceResponse(preferences=prefs, search=search_filters(prefs), source="user", model=None, duration_ms=0, warnings=warnings or [])

    # -- steps ----------------------------------------------------------------
    def _ask_model(self, query: str, warnings: list[str], calls: list[CallTiming]) -> tuple[ShoppingPreferences, str]:
        """Call the model; retry once only if the failure was quick and time remains."""
        deadline = time.perf_counter() + settings.gemini_total_timeout_seconds
        messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": query}]
        last_error: AIError | None = None
        last_call_seconds = 0.0
        for attempt in (1, 2):
            remaining = deadline - time.perf_counter()
            if attempt == 2 and remaining < max(MIN_RETRY_SECONDS, last_call_seconds * 1.2):
                logger.info("Not retrying: %.1fs left, last call took %.1fs", remaining, last_call_seconds)
                break
            call_start = time.perf_counter()
            try:
                result = self.client.chat_json(messages, RESPONSE_SCHEMA, timeout=remaining)
                calls.append(result.timing)
                tidy_warnings: list[str] = []
                prefs = ShoppingPreferences.model_validate(tidy_ai_output(result.data, tidy_warnings))
                warnings.extend(tidy_warnings)
                if attempt == 2:
                    warnings.append("The first AI reply was invalid, so it was asked again.")
                return prefs, result.model
            except ValidationError as exc:
                problems = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()[:5])
                last_error = InvalidAIResponse(f"The AI reply didn’t pass validation ({problems}).")
                feedback = f"Your JSON had problems: {problems}. Reply again with corrected JSON only."
                messages = messages[:2] + [{"role": "assistant", "content": result.raw}, {"role": "user", "content": feedback}]
            except AIBadResponseError as exc:  # not JSON at all, cut off, or empty
                last_error = exc
                messages = messages[:2] + [{"role": "user", "content": "Reply with valid JSON only, following the schema exactly."}]
            except AIUnavailableError as exc:
                # Temporary server error: worth one retry only if it failed fast (e.g. instant 503)
                if getattr(exc, "elapsed_ms", None) is None or (time.perf_counter() - call_start) > FAST_FAILURE_SECONDS:
                    raise
                last_error = exc
            last_call_seconds = time.perf_counter() - call_start
        assert last_error is not None
        raise last_error

    @staticmethod
    def _diagnostics(calls: list[CallTiming], total_ms: int) -> AIDiagnostics:
        def total(values: list[int | None]) -> int | None:
            known = [v for v in values if v is not None]
            return sum(known) if known else None

        return AIDiagnostics(
            attempts=len(calls),
            connect_ms=calls[0].connect_ms,
            model_wait_ms=total([c.wait_ms for c in calls]),
            server_ms=total([c.server_ms for c in calls]),
            api_total_ms=sum(c.total_ms for c in calls),
            extraction_total_ms=total_ms,
            prompt_tokens=total([c.prompt_tokens for c in calls]),
            output_tokens=total([c.output_tokens for c in calls]),
            thought_tokens=total([c.thought_tokens for c in calls]),
            thinking_level=settings.gemini_thinking_level or None,
        )

    def _check_against_request(self, prefs: ShoppingPreferences, query: str, parsed: rules.RuleResult,
                               known_brands: list[str], warnings: list[str]) -> ShoppingPreferences:
        """Make sure the AI didn’t add anything the user didn’t say."""
        data = prefs.model_dump()

        # Budgets must be amounts the user actually wrote
        for key, rule_value, label in (("max_budget_inr", parsed.max_budget_inr, "maximum"), ("min_budget_inr", parsed.min_budget_inr, "minimum")):
            ai_value = data[key]
            if ai_value is not None and not rules.amount_supported(ai_value, parsed.amounts):
                data[key] = rule_value
                replacement = f"₹{rule_value:,}" if rule_value else "no limit"
                warnings.append(f"The AI suggested a {label} budget of ₹{ai_value:,}, which isn’t in your request — using {replacement}.")
            elif ai_value is None and rule_value is not None:
                data[key] = rule_value
        if data["min_budget_inr"] and data["max_budget_inr"] and data["min_budget_inr"] > data["max_budget_inr"]:
            data["min_budget_inr"] = None

        # The category must come from the user's words: an explicit word wins, and a guess is dropped
        if parsed.category and data["category"] != parsed.category:
            if data["category"]:
                warnings.append(f"Your request mentions {parsed.category}, so that category is used.")
            data["category"] = parsed.category
        elif not parsed.category and data["category"]:
            warnings.append(f"The AI guessed “{data['category']}”, but your request doesn’t name a product type — choose a category below.")
            data["category"] = None

        # Brands: keep only ones the user named; add catalogue brands they named but the AI missed
        kept = [b for b in data["brands"] if rules.mentions(query, b)]
        dropped = [b for b in data["brands"] if b not in kept]
        if dropped:
            warnings.append(f"Removed brand{'s' if len(dropped) > 1 else ''} {', '.join(dropped)} — not mentioned in your request.")
        kept += [b for b in known_brands if rules.mentions(query, b) and b.lower() not in {k.lower() for k in kept}]
        data["brands"] = kept

        # Hardware guidance must stay general — no specific chips, products or brands
        clean = []
        for hp in data["hardware_preferences"]:
            if hp["spec"] == "graphics" and data["category"] == "smartphones":
                continue  # phone listings don't include graphics, so this can't be used
            text = f"{hp['preference']} {hp['reason']}"
            named_brand = any(rules.mentions(text, b) for b in known_brands if not rules.mentions(query, b))
            if _SPECIFIC_HARDWARE.search(text) or named_brand:
                warnings.append(f"Removed a {hp['spec']} suggestion that named specific hardware.")
                continue
            clean.append(hp)
        data["hardware_preferences"] = clean

        if not data["use_cases"]:
            data["use_cases"] = parsed.use_cases
        return ShoppingPreferences.model_validate(data)

    @staticmethod
    def _from_rules(query: str, parsed: rules.RuleResult, known_brands: list[str]) -> ShoppingPreferences:
        return ShoppingPreferences(
            category=parsed.category,
            min_budget_inr=parsed.min_budget_inr,
            max_budget_inr=parsed.max_budget_inr,
            use_cases=parsed.use_cases,
            priorities=parsed.priorities,
            hardware_preferences=[],
            brands=[b for b in known_brands if rules.mentions(query, b)],
        )
