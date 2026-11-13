"""
Siftwell AI Decision Assistant — answers questions about the current results.

Kept separate from the scoring engine: scores are computed by
app/services/scoring_engine.py and passed in as facts (see assistant_context.py).
Gemini only *explains* them in plain language.

Safeguards against invented information
---------------------------------------
* The prompt contains only facts read from PostgreSQL plus the engine's scores,
  and an explicit list of data Siftwell doesn't have (ratings, benchmarks, …).
* The reply is structured JSON, validated with Pydantic.
* Product references are limited to products in the context.
* Every number in the answer is checked against the numbers in the facts (and
  the user's own messages). If something can't be matched, the model is asked
  once to rewrite; if it still can't be matched, the answer is returned with a
  visible warning instead of being presented as fact.
"""

import logging
import re
import time

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy.orm import Session

from app.ai.assistant_context import BuiltContext, build_context
from app.ai.errors import (
    AIAuthError,
    AIBadResponseError,
    AIError,
    AIModelNotFoundError,
    AINotConfiguredError,
    AIRateLimitError,
    AITimeoutError,
)
from app.ai.gemini_client import GeminiClient
from app.core.config import settings
from app.core.errors import (
    AIServiceError,
    AIServiceUnavailableError,
    AITimedOutError,
    NotFoundError,
    RateLimitedError,
)
from app.schemas.assistant import ChatRequest, ChatResponse, CitedProduct

logger = logging.getLogger("siftwell.ai")

SYSTEM_PROMPT = """You are Siftwell's Decision Assistant. You help a shopper understand the products and recommendations they are looking at.
Answer ONLY from the DATA section. Rules:
- Use only specifications, prices, scores and facts that appear in DATA. Never invent or estimate specifications, prices, ratings, reviews or benchmarks.
- If the question needs information that isn't in DATA, say plainly that Siftwell doesn't have it, and list it in "unavailable".
- Scores come from Siftwell's rule-based scoring engine. Explain them with the breakdown, weights, strengths and weaknesses; don't recalculate them.
- Explain trade-offs honestly (for example a higher score versus a higher price). Battery figures are capacity only, not battery life.
- If products are fictional demo data, mention it when judging whether something is worth buying.
- Be concise: about 150 words at most. Use plain sentences and, if helpful, short lines starting with "- ". Refer to products by name.
- "cited_products": the [slug] of each product your answer discusses.
- Only discuss these products and this buying decision; politely decline anything else."""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "cited_products": {"type": "array", "items": {"type": "string"}, "maxItems": 8},
        "unavailable": {"type": "array", "items": {"type": "string"}, "maxItems": 5},
    },
    "required": ["answer", "cited_products", "unavailable"],
}

SMALL_NUMBER = 12          # counts and ranks ("2 products", "rank 1") are always allowed
MIN_RETRY_SECONDS = 3.0


class AssistantReply(BaseModel):
    answer: str = Field(min_length=1, max_length=4000)
    cited_products: list[str] = Field(default_factory=list)
    unavailable: list[str] = Field(default_factory=list)


# Units Siftwell never lists, so any value with them must have been invented
_UNLISTED_UNITS = re.compile(
    r"\d[\d,]*(?:\.\d+)?\s*(?:kg|kilograms?|grams?|g\b|lbs?|hours?|hrs?|fps|mp\b|megapixels?|nits|stars?|/5\b|/10\b|mm\b)",
    re.IGNORECASE,
)


def unverified_numbers(answer: str, allowed: set[str]) -> list[str]:
    """Numbers in the answer that don't appear in the facts, or that use units Siftwell doesn't have."""
    found: list[str] = [m.group(0).strip() for m in _UNLISTED_UNITS.finditer(answer)]
    for raw in re.findall(r"\d[\d,]*(?:\.\d+)?", answer):
        value = raw.replace(",", "")
        try:
            number = float(value)
        except ValueError:
            continue
        if number <= SMALL_NUMBER and number == int(number):
            continue
        if value in allowed or f"{number:g}" in allowed or str(round(number)) in allowed:
            continue
        if raw not in found and not any(f.startswith(raw) for f in found):
            found.append(raw)
    return found


def _to_service_error(exc: AIError) -> Exception:
    if isinstance(exc, AIRateLimitError):
        return RateLimitedError(str(exc), details={"retry_after_seconds": exc.retry_after_seconds})
    if isinstance(exc, AITimeoutError):
        return AITimedOutError(str(exc))
    if isinstance(exc, (AINotConfiguredError, AIAuthError, AIModelNotFoundError)):
        return AIServiceUnavailableError(f"The assistant isn’t available right now: {exc}")
    return AIServiceError(f"The assistant couldn’t answer: {exc}")


class DecisionAssistant:
    def __init__(self, client: GeminiClient) -> None:
        self.client = client

    def answer(self, db: Session, request: ChatRequest) -> ChatResponse:
        start = time.perf_counter()
        context = build_context(db, request.context)
        if not context.products:
            raise NotFoundError("None of the products in this conversation exist in the catalogue any more.")

        user_numbers = set()
        for text in [request.question] + [m.content for m in request.history if m.role == "user"]:
            user_numbers |= {n.replace(",", "") for n in re.findall(r"\d[\d,]*(?:\.\d+)?", text)}
        allowed = context.numbers | user_numbers

        messages = [{"role": "system", "content": f"{SYSTEM_PROMPT}\n\nDATA\n{context.text}"}]
        messages += [{"role": m.role, "content": m.content} for m in request.history]
        messages.append({"role": "user", "content": request.question})

        try:
            reply, model, warnings = self._ask(messages, allowed)
        except AIError as exc:
            logger.warning("Assistant failed (%s): %s", exc.code, exc)
            raise _to_service_error(exc) from exc

        cited = [CitedProduct(slug=s, name=context.products[s]) for s in dict.fromkeys(reply.cited_products) if s in context.products]
        if context.missing_slugs:
            warnings.append(f"{len(context.missing_slugs)} product(s) from your results are no longer in the catalogue and weren’t considered.")
        return ChatResponse(
            answer=reply.answer.strip(),
            cited_products=cited,
            unavailable=[u.strip() for u in reply.unavailable if u.strip()][:5],
            warnings=warnings,
            model=model,
            duration_ms=int((time.perf_counter() - start) * 1000),
            products_in_context=len(context.products),
        )

    def _ask(self, messages: list[dict[str, str]], allowed: set[str]) -> tuple[AssistantReply, str, list[str]]:
        """One call, plus at most one retry (invalid JSON, or numbers that aren't in the data) if time allows."""
        deadline = time.perf_counter() + settings.gemini_total_timeout_seconds
        last_bad: AIBadResponseError | None = None
        reply: AssistantReply | None = None
        model = self.client.model
        unknown: list[str] = []
        for attempt in (1, 2):
            remaining = deadline - time.perf_counter()
            if attempt == 2 and remaining < MIN_RETRY_SECONDS:
                break
            try:
                result = self.client.chat_json(messages, RESPONSE_SCHEMA, timeout=remaining)
                model = result.model
                reply = AssistantReply.model_validate(result.data)
            except (AIBadResponseError, ValidationError) as exc:
                last_bad = exc if isinstance(exc, AIBadResponseError) else AIBadResponseError("The assistant’s reply wasn’t in the expected format.")
                messages = messages + [{"role": "user", "content": "Reply again with valid JSON only, following the schema."}]
                continue
            unknown = unverified_numbers(reply.answer, allowed)
            if not unknown:
                return reply, model, []
            logger.info("Assistant answer had unverified numbers: %s", unknown)
            messages = messages + [
                {"role": "assistant", "content": result.raw},
                {"role": "user", "content": f"These numbers are not in DATA: {', '.join(unknown)}. Rewrite the answer using only values from DATA, or say the information is unavailable."},
            ]
        if reply is None:
            raise last_bad or AIBadResponseError("The assistant didn’t return an answer.")
        warning = f"Some numbers in this answer couldn’t be matched to Siftwell’s data ({', '.join(unknown)}). Treat them with caution."
        return reply, model, [warning] if unknown else []
