"""
Minimal client for the Google Gemini API (REST, no extra SDK).

  * `status()`    — is an API key set, and does the configured model respond?
  * `chat_json()` — send messages and get back JSON that follows a JSON Schema
                    (Gemini structured output: responseMimeType + responseJsonSchema).

Every call records a timing breakdown (connection setup, waiting for the model,
Google's own server time) and token usage, so latency can be measured instead
of guessed. The HTTP connection is reused between requests to avoid repeating
the TLS handshake.

The client never retries by itself; the caller decides whether there is time
left for another attempt (see preference_extractor.py).

Security: the API key is read from the GEMINI_API_KEY environment variable on
the server only. It is sent in the `x-goog-api-key` header (never in the URL),
and it is never logged or included in error messages.
"""

import json
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.ai.errors import (
    AIAuthError,
    AIBadResponseError,
    AIBlockedError,
    AIError,
    AIModelNotFoundError,
    AINotConfiguredError,
    AIRateLimitError,
    AITimeoutError,
    AIUnavailableError,
)
from app.core.config import settings

CONNECT_TIMEOUT = 3.0  # seconds to open a connection; the rest of the budget is for the model


@dataclass
class CallTiming:
    """Where the time went in one API call (milliseconds)."""

    connect_ms: int | None = None       # TCP + TLS setup; 0 when an existing connection was reused
    wait_ms: int | None = None          # request sent -> response headers (model processing + network)
    server_ms: int | None = None        # Google's own processing time (Server-Timing header)
    total_ms: int = 0                   # whole call as seen by the client
    prompt_tokens: int | None = None
    output_tokens: int | None = None    # answer tokens
    thought_tokens: int | None = None   # "thinking" tokens (count toward maxOutputTokens)


@dataclass
class ChatResult:
    data: Any
    raw: str
    model: str
    timing: CallTiming = field(default_factory=CallTiming)

    @property
    def duration_ms(self) -> int:
        return self.timing.total_ms


@dataclass
class AIStatusInfo:
    configured: bool
    reachable: bool
    model: str
    message: str


class _Tracer:
    """Collects httpcore trace events to split connection time from model time."""

    def __init__(self) -> None:
        self.marks: dict[str, float] = {}

    def __call__(self, event: str, info: dict) -> None:
        # e.g. "connection.connect_tcp.started", "http11.receive_response_headers.complete"
        self.marks.setdefault(event, time.perf_counter())

    def span(self, suffix: str) -> int | None:
        start = next((v for k, v in self.marks.items() if k.endswith(f"{suffix}.started")), None)
        end = next((v for k, v in self.marks.items() if k.endswith(f"{suffix}.complete")), None)
        return int((end - start) * 1000) if start is not None and end is not None else None

    def connect_ms(self) -> int | None:
        if not self.marks:
            return None  # transport doesn't emit traces (e.g. tests)
        tcp, tls = self.span("connect_tcp"), self.span("start_tls")
        return (tcp or 0) + (tls or 0)

    def wait_ms(self) -> int | None:
        return self.span("receive_response_headers")


def _server_ms(response: httpx.Response) -> int | None:
    m = re.search(r"dur=(\d+(?:\.\d+)?)", response.headers.get("server-timing", ""))
    return int(float(m.group(1))) if m else None


def _retry_after(response: httpx.Response) -> float | None:
    """Seconds to wait, from a Retry-After header or Google's RetryInfo detail ("12s")."""
    header = response.headers.get("retry-after")
    if header and header.replace(".", "", 1).isdigit():
        return float(header)
    try:
        for detail in response.json().get("error", {}).get("details", []):
            delay = detail.get("retryDelay")
            if isinstance(delay, str) and delay.endswith("s"):
                return float(delay[:-1])
    except (ValueError, AttributeError):
        pass
    return None


def _google_message(response: httpx.Response) -> str:
    try:
        return str(response.json().get("error", {}).get("message", ""))[:200]
    except ValueError:
        return response.text[:200]


class GeminiClient:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
        base_url: str | None = None,
        transport: httpx.BaseTransport | None = None,  # lets tests fake the API
        thinking_level: str | None = None,
    ) -> None:
        key = api_key if api_key is not None else (settings.gemini_api_key.get_secret_value() if settings.gemini_api_key else "")
        self._api_key = key.strip()
        self.model = model or settings.gemini_model
        self.timeout = timeout if timeout is not None else settings.gemini_timeout_seconds
        self.base_url = (base_url or settings.gemini_api_base).rstrip("/")
        self.thinking_level = settings.gemini_thinking_level if thinking_level is None else thinking_level
        self._transport = transport
        self._http: httpx.Client | None = None
        self._lock = threading.Lock()

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    def __repr__(self) -> str:  # never show the key
        return f"GeminiClient(model={self.model!r}, configured={self.configured})"

    def _client(self) -> httpx.Client:
        """One shared HTTP client, so the TLS connection is reused between requests."""
        with self._lock:
            if self._http is None:
                self._http = httpx.Client(
                    base_url=self.base_url,
                    transport=self._transport,
                    headers={"x-goog-api-key": self._api_key, "Content-Type": "application/json"},
                    timeout=httpx.Timeout(self.timeout, connect=CONNECT_TIMEOUT),
                )
            return self._http

    def close(self) -> None:
        if self._http is not None:
            self._http.close()
            self._http = None

    # -- status -----------------------------------------------------------------
    def status(self) -> AIStatusInfo:
        if not self.configured:
            return AIStatusInfo(False, False, self.model, "GEMINI_API_KEY isn’t set on the server.")
        try:
            response = self._client().get(f"/models/{self.model}", timeout=5)
        except httpx.HTTPError as exc:
            return AIStatusInfo(True, False, self.model, f"Can’t reach the Gemini API ({type(exc).__name__}).")
        if response.status_code == 200:
            methods = response.json().get("supportedGenerationMethods", [])
            if "generateContent" not in methods:
                return AIStatusInfo(True, False, self.model, f"Model '{self.model}' doesn’t support generateContent.")
            return AIStatusInfo(True, True, self.model, "Ready")
        if response.status_code == 404:
            return AIStatusInfo(True, False, self.model, f"Model '{self.model}' wasn’t found. Check GEMINI_MODEL.")
        if response.status_code in (400, 401, 403):
            return AIStatusInfo(True, False, self.model, "The Gemini API key was rejected. Check GEMINI_API_KEY.")
        return AIStatusInfo(True, False, self.model, f"Gemini API returned HTTP {response.status_code}.")

    # -- chat -------------------------------------------------------------------
    def build_body(self, messages: list[dict[str, str]], schema: dict[str, Any]) -> dict[str, Any]:
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        contents = [
            {"role": "model" if m["role"] == "assistant" else "user", "parts": [{"text": m["content"]}]}
            for m in messages
            if m["role"] != "system"
        ]
        config: dict[str, Any] = {
            "temperature": 0,  # same input -> same output
            "maxOutputTokens": settings.gemini_max_output_tokens,
            "responseMimeType": "application/json",
            "responseJsonSchema": schema,  # structured output
        }
        level = (self.thinking_level or "").strip().lower()
        if level and self.model.startswith("gemini-3"):
            config["thinkingConfig"] = {"thinkingLevel": level}
        elif level == "minimal" and self.model.startswith("gemini-2.5"):
            config["thinkingConfig"] = {"thinkingBudget": 0}
        body: dict[str, Any] = {"contents": contents, "generationConfig": config}
        if system:
            body["systemInstruction"] = {"parts": [{"text": system}]}
        return body

    def chat_json(self, messages: list[dict[str, str]], schema: dict[str, Any], timeout: float | None = None) -> ChatResult:
        """
        `messages` uses the common format [{"role": "system"|"user"|"assistant", "content": "..."}].
        `timeout` (seconds) overrides the default for this call — used to respect an overall deadline.
        """
        if not self.configured:
            raise AINotConfiguredError("GEMINI_API_KEY isn’t set on the server.")
        call_timeout = min(timeout, self.timeout) if timeout else self.timeout
        tracer = _Tracer()
        start = time.perf_counter()
        try:
            response = self._client().post(
                f"/models/{self.model}:generateContent",
                json=self.build_body(messages, schema),
                timeout=httpx.Timeout(call_timeout, connect=min(CONNECT_TIMEOUT, call_timeout)),
                extensions={"trace": tracer},
            )
        except httpx.TimeoutException as exc:
            raise AITimeoutError(f"Gemini didn’t answer within {call_timeout:g} seconds.") from exc
        except httpx.HTTPError as exc:
            raise AIUnavailableError("Can’t reach the Gemini API. Check your internet connection.") from exc

        timing = CallTiming(
            connect_ms=tracer.connect_ms(),
            wait_ms=tracer.wait_ms(),
            server_ms=_server_ms(response),
            total_ms=int((time.perf_counter() - start) * 1000),
        )
        self._raise_for_status(response, timing)
        return self._parse(response, timing)

    @staticmethod
    def _raise_for_status(response: httpx.Response, timing: CallTiming) -> None:
        status = response.status_code
        if status < 400:
            return
        message = _google_message(response)
        if status == 429:
            wait = _retry_after(response)
            hint = f" Try again in about {int(wait) + 1} seconds." if wait else " Try again in a minute."
            raise AIRateLimitError("Gemini’s rate limit was reached." + hint, retry_after_seconds=wait)
        if status in (401, 403) or (status == 400 and "api key" in message.lower()):
            raise AIAuthError("The Gemini API key was rejected. Check GEMINI_API_KEY.")
        if status == 404:
            raise AIModelNotFoundError("The Gemini model wasn’t found. Check GEMINI_MODEL.")
        if status >= 500:
            err = AIUnavailableError(f"Gemini is temporarily unavailable (HTTP {status}). Please try again shortly.")
            err.elapsed_ms = timing.total_ms  # type: ignore[attr-defined]
            raise err
        raise AIError(f"Gemini API error (HTTP {status}): {message}")

    def _parse(self, response: httpx.Response, timing: CallTiming) -> ChatResult:
        try:
            payload = response.json()
        except ValueError as exc:
            raise AIBadResponseError("Gemini’s reply wasn’t valid JSON.") from exc

        usage = payload.get("usageMetadata") or {}
        timing.prompt_tokens = usage.get("promptTokenCount")
        timing.output_tokens = usage.get("candidatesTokenCount")
        timing.thought_tokens = usage.get("thoughtsTokenCount", 0 if usage else None)

        if block := (payload.get("promptFeedback") or {}).get("blockReason"):
            raise AIBlockedError(f"Gemini declined to answer ({block}).")
        candidates = payload.get("candidates") or []
        if not candidates:
            raise AIBadResponseError("Gemini returned no answer.")
        candidate = candidates[0]
        finish = candidate.get("finishReason")
        if finish == "MAX_TOKENS":
            raise AIBadResponseError("Gemini’s reply was cut off before it finished.")
        if finish in ("SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"):
            raise AIBlockedError(f"Gemini declined to answer ({finish}).")

        parts = (candidate.get("content") or {}).get("parts") or []
        raw = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        if not raw.strip():
            raise AIBadResponseError("Gemini returned an empty answer.")
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise AIBadResponseError(f"Gemini didn’t return valid JSON: {raw[:120]!r}") from exc
        return ChatResult(data=data, raw=raw, model=payload.get("modelVersion") or self.model, timing=timing)

    # -- token counting (free; used to measure prompt size) ---------------------
    def count_tokens(self, messages: list[dict[str, str]], schema: dict[str, Any]) -> int | None:
        body = self.build_body(messages, schema)
        request = {"generateContentRequest": {"model": f"models/{self.model}", **body}}
        response = self._client().post(f"/models/{self.model}:countTokens", json=request, timeout=10)
        if response.status_code != 200:
            return None
        return response.json().get("totalTokens")
