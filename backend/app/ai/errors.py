"""
Errors raised by the AI client.

They don't depend on any particular provider, so the extractor and the API
routes only need to know these classes.
"""


class AIError(Exception):
    """Base class for all AI problems."""

    code = "ai_error"


class AINotConfiguredError(AIError):
    """No API key has been set."""

    code = "ai_not_configured"


class AIUnavailableError(AIError):
    """Network problem, or the provider is down/overloaded."""

    code = "ai_unavailable"


class AITimeoutError(AIError):
    code = "ai_timeout"


class AIRateLimitError(AIError):
    """Too many requests (e.g. free-tier quota used up)."""

    code = "ai_rate_limited"

    def __init__(self, message: str, retry_after_seconds: float | None = None) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class AIAuthError(AIError):
    """The API key is missing permissions or invalid."""

    code = "ai_auth_failed"


class AIModelNotFoundError(AIError):
    code = "ai_model_not_found"


class AIBlockedError(AIError):
    """The provider refused to answer (safety filters)."""

    code = "ai_blocked"


class AIBadResponseError(AIError):
    """The provider answered, but not with the JSON we asked for. Worth retrying once."""

    code = "ai_bad_response"
