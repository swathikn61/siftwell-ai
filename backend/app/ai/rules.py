"""
Plain-Python reading of a shopping request (no AI).

Used in two ways:
  1. To double-check the AI: a budget or brand the AI returns must actually
     appear in the user's words, otherwise it is treated as made up.
  2. As a fallback when the AI is unavailable, slow or returns bad data.
"""

import re
from dataclasses import dataclass, field

CATEGORY_WORDS = {
    "laptops": ["laptop", "laptops", "notebook", "notebooks", "ultrabook", "macbook"],
    "smartphones": ["phone", "phones", "smartphone", "smartphones", "mobile", "mobiles", "iphone", "android"],
}

# word in the request -> how we describe it
USE_CASE_WORDS = {
    "gaming": "Gaming",
    "game": "Gaming",
    "games": "Gaming",
    "coding": "Programming",
    "programming": "Programming",
    "software development": "Programming",
    "java": "Programming",
    "python": "Programming",
    "development": "Programming",
    "college": "College work",
    "student": "College work",
    "school": "College work",
    "office": "Office work",
    "video editing": "Video editing",
    "editing": "Video editing",
    "photography": "Photography",
    "photos": "Photography",
    "camera": "Photography",
    "travel": "Travel",
    "streaming": "Streaming",
    "music": "Music",
}

PRIORITY_WORDS = {
    "battery": "Battery life",
    "performance": "Performance",
    "fast": "Performance",
    "display": "Display quality",
    "screen": "Display quality",
    "camera": "Camera",
    "light": "Portability",
    "lightweight": "Portability",
    "portable": "Portability",
    "storage": "Storage",
    "value": "Value for money",
    "cheap": "Value for money",
    "durable": "Build quality",
    "build quality": "Build quality",
}

_AMOUNT = r"(?:₹|rs\.?|inr|\$)?\s*(\d+(?:[.,]\d+)*)\s*(k|thousand|l|lakh|lakhs|lac|lacs)?\b"


def to_rupees(number: str, unit: str | None) -> int:
    value = float(number.replace(",", ""))
    if unit:
        u = unit.lower()
        value *= 1_000 if u in ("k", "thousand") else 100_000
    return int(round(value))


@dataclass
class RuleResult:
    category: str | None = None
    min_budget_inr: int | None = None
    max_budget_inr: int | None = None
    use_cases: list[str] = field(default_factory=list)
    priorities: list[str] = field(default_factory=list)
    amounts: set[int] = field(default_factory=set)  # every rupee amount mentioned


def mentioned_amounts(text: str) -> set[int]:
    """All amounts in the text that look like prices (>= ₹1,000)."""
    found = {to_rupees(m.group(1), m.group(2)) for m in re.finditer(_AMOUNT, text.lower())}
    return {a for a in found if a >= 1000}


def parse(text: str) -> RuleResult:
    lower = f" {text.lower()} "
    result = RuleResult(amounts=mentioned_amounts(text))

    if m := re.search(rf"(?:between\s+)?{_AMOUNT}\s*(?:-|to|and)\s*{_AMOUNT}", lower):
        a, b = to_rupees(m.group(1), m.group(2) or m.group(4)), to_rupees(m.group(3), m.group(4))
        if a >= 1000 and b >= 1000:
            result.min_budget_inr, result.max_budget_inr = min(a, b), max(a, b)
    if result.max_budget_inr is None and (
        m := re.search(rf"(?:under|below|less than|upto|up to|within|max(?:imum)?|budget(?: of| is)?|not more than)\s+{_AMOUNT}", lower)
    ):
        result.max_budget_inr = to_rupees(m.group(1), m.group(2))
    if result.min_budget_inr is None and (m := re.search(rf"(?:above|over|more than|at least|starting)\s+{_AMOUNT}", lower)):
        result.min_budget_inr = to_rupees(m.group(1), m.group(2))

    for slug, words in CATEGORY_WORDS.items():
        if re.search(rf"\b({'|'.join(words)})\b", lower):
            result.category = slug
            break

    def collect(mapping: dict[str, str]) -> list[str]:
        seen: list[str] = []
        for word, label in mapping.items():
            if re.search(rf"\b{re.escape(word)}\b", lower) and label not in seen:
                seen.append(label)
        return seen

    result.use_cases = collect(USE_CASE_WORDS)
    result.priorities = collect(PRIORITY_WORDS)
    return result


def amount_supported(amount: int | None, text_amounts: set[int]) -> bool:
    """True if `amount` (from the AI) matches an amount the user wrote (±1%)."""
    if amount is None:
        return True
    return any(abs(amount - a) <= max(1, a * 0.01) for a in text_amounts)


def mentions(text: str, phrase: str) -> bool:
    return re.search(rf"\b{re.escape(phrase.lower())}\b", text.lower()) is not None
