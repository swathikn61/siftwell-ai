"""
Schemas for AI preference extraction.

`ShoppingPreferences` is the validated, cleaned-up result. It is used both for
what the AI extracts and for preferences the user edits afterwards, so every
value goes through the same checks.
"""

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Category = Literal["laptops", "smartphones"]
SpecName = Literal["processor", "ram", "storage", "battery", "display", "graphics"]

MAX_BUDGET_INR = 10_000_000  # ₹1 crore — anything above is treated as a mistake


def _clean_list(values: list[str], max_items: int, max_len: int) -> list[str]:
    """Trim, drop blanks and duplicates (case-insensitive), and cap length."""
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = " ".join(str(value).split())[:max_len].strip(" .,-")
        key = text.lower()
        if text and key not in seen:
            seen.add(key)
            out.append(text[0].upper() + text[1:])
        if len(out) == max_items:
            break
    return out


class HardwarePreference(BaseModel):
    """General guidance derived from how the product will be used — not a product spec."""

    spec: SpecName
    preference: str = Field(min_length=1, max_length=80, examples=["At least 16 GB"])
    reason: str = Field(default="", max_length=140, examples=["Java IDEs and multitasking use a lot of memory"])
    mandatory: bool = Field(default=False, description="Set by the user: products that don’t meet it are excluded")

    @field_validator("preference", "reason", mode="before")
    @classmethod
    def tidy(cls, value: object) -> object:
        return " ".join(str(value).split()) if value is not None else ""


class ShoppingPreferences(BaseModel):
    category: Category | None = Field(default=None, examples=["laptops"])
    min_budget_inr: int | None = Field(default=None, ge=0, le=MAX_BUDGET_INR)
    max_budget_inr: int | None = Field(default=None, gt=0, le=MAX_BUDGET_INR, examples=[70000])
    use_cases: list[str] = Field(default_factory=list, examples=[["Java development", "College work", "Gaming"]])
    priorities: list[str] = Field(default_factory=list, examples=[["Battery life"]])
    hardware_preferences: list[HardwarePreference] = Field(default_factory=list)
    brands: list[str] = Field(default_factory=list, description="Only brands the user actually mentioned")

    @field_validator("use_cases", "priorities", mode="after")
    @classmethod
    def clean_text_lists(cls, values: list[str]) -> list[str]:
        return _clean_list(values, max_items=6, max_len=60)

    @field_validator("brands", mode="after")
    @classmethod
    def clean_brands(cls, values: list[str]) -> list[str]:
        return _clean_list(values, max_items=5, max_len=40)

    @field_validator("hardware_preferences", mode="after")
    @classmethod
    def one_per_spec(cls, values: list[HardwarePreference]) -> list[HardwarePreference]:
        seen: set[str] = set()
        out = []
        for hp in values:
            if hp.spec not in seen:
                seen.add(hp.spec)
                out.append(hp)
        return out

    @model_validator(mode="after")
    def budget_order(self) -> "ShoppingPreferences":
        if self.min_budget_inr is not None and self.max_budget_inr is not None and self.min_budget_inr > self.max_budget_inr:
            raise ValueError("min_budget_inr cannot be greater than max_budget_inr")
        return self


class PreferenceRequest(BaseModel):
    query: str = Field(min_length=3, max_length=500, examples=[
        "I need a laptop under ₹70,000 for Java development, college work and occasional gaming. Battery life is important."
    ])

    @field_validator("query")
    @classmethod
    def not_blank(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 3:
            raise ValueError("Please describe what you’re looking for")
        return value


class SearchFilters(BaseModel):
    """Filters the frontend can pass straight to GET /api/products."""

    category: Category | None
    min_price: int | None
    max_price: int | None
    brand: list[str]


class AIDiagnostics(BaseModel):
    """Measured timing and token usage for one extraction (milliseconds)."""

    attempts: int = Field(description="Gemini calls that returned a response")
    connect_ms: int | None = Field(description="TCP+TLS setup for the first call; 0 when a connection was reused")
    model_wait_ms: int | None = Field(description="Time from sending the request to the first response bytes (model + network)")
    server_ms: int | None = Field(description="Google’s reported server processing time")
    api_total_ms: int = Field(description="Total time inside Gemini API calls")
    extraction_total_ms: int = Field(description="Whole extraction, including validation and checks")
    prompt_tokens: int | None
    output_tokens: int | None
    thought_tokens: int | None
    thinking_level: str | None


class PreferenceResponse(BaseModel):
    preferences: ShoppingPreferences
    search: SearchFilters
    source: Literal["ai", "rules", "user"] = Field(description="`ai` = extracted by the model · `rules` = fallback parser · `user` = edited by the user")
    model: str | None = Field(description="Gemini model used, when source is `ai`")
    duration_ms: int = Field(description="Time spent extracting, in milliseconds")
    warnings: list[str] = Field(default_factory=list, description="Anything that was corrected, removed or couldn’t be done")
    diagnostics: AIDiagnostics | None = Field(default=None, description="Timing and token usage when Gemini was called")


class AIStatus(BaseModel):
    provider: Literal["gemini"] = "gemini"
    available: bool = Field(description="True when an API key is set and the model responds")
    configured: bool = Field(description="True when GEMINI_API_KEY is set on the server")
    model: str
    message: str
