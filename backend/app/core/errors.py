"""
Error handling.

Every error the API returns has the same JSON shape, so the frontend only has
to handle one format:

    {
      "error": {
        "code": "not_found",
        "message": "Product 42 was not found",
        "details": null
      }
    }
"""

import logging
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError, SQLAlchemyError
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("siftwell")


# ---------------------------------------------------------------------------
# Custom exceptions — raise these from services and routers
# ---------------------------------------------------------------------------
class AppError(Exception):
    """Base class for errors we expect and want to show to the client."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "bad_request"

    def __init__(self, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details


class BadRequestError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "bad_request"


class InvalidFieldError(AppError):
    """A field passed basic validation but failed a business rule (e.g. unknown category)."""

    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "validation_error"

    def __init__(self, field: str, message: str) -> None:
        super().__init__("Request data is invalid", [{"field": field, "message": message}])


class AIServiceError(AppError):
    """The AI provider failed in an unexpected way."""

    status_code = status.HTTP_502_BAD_GATEWAY
    code = "ai_error"


class AIServiceUnavailableError(AppError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "ai_unavailable"


class AITimedOutError(AppError):
    status_code = status.HTTP_504_GATEWAY_TIMEOUT
    code = "ai_timeout"


class RateLimitedError(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"


# ---------------------------------------------------------------------------
# Handlers — turn exceptions into consistent JSON responses
# ---------------------------------------------------------------------------
def error_response(status_code: int, code: str, message: str, details: Any = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": jsonable_encoder(details)}},
    )


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    return error_response(exc.status_code, exc.code, exc.message, exc.details)


async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = {404: "not_found", 405: "method_not_allowed", 401: "unauthorized", 403: "forbidden"}.get(exc.status_code, "http_error")
    return error_response(exc.status_code, code, str(exc.detail))


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Simplify Pydantic's error list into {field, message} pairs
    details = [
        {"field": ".".join(str(part) for part in err["loc"] if part != "body"), "message": err["msg"]}
        for err in exc.errors()
    ]
    return error_response(status.HTTP_422_UNPROCESSABLE_ENTITY, "validation_error", "Request data is invalid", details)


async def database_error_handler(_: Request, exc: SQLAlchemyError) -> JSONResponse:
    if isinstance(exc, IntegrityError):
        return error_response(status.HTTP_409_CONFLICT, "conflict", "This record conflicts with existing data")
    if isinstance(exc, OperationalError):
        logger.error("Database unavailable: %s", exc)
        return error_response(status.HTTP_503_SERVICE_UNAVAILABLE, "database_unavailable", "The database is not reachable right now")
    logger.exception("Database error")
    return error_response(status.HTTP_500_INTERNAL_SERVER_ERROR, "database_error", "A database error occurred")


async def unhandled_error_handler(_: Request, exc: Exception) -> JSONResponse:
    # Log the full traceback for us, but never leak internals to the client
    logger.exception("Unhandled error: %s", exc)
    return error_response(status.HTTP_500_INTERNAL_SERVER_ERROR, "internal_error", "Something went wrong on our side")


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(AppError, app_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(SQLAlchemyError, database_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_error_handler)
