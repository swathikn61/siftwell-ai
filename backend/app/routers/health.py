"""Health-check endpoint — a quick way to confirm the API and database are up."""

import logging

from fastapi import APIRouter, Response, status

from app import __version__
from app.core.config import settings
from app.database import check_database_connection
from app.schemas.health import HealthResponse

router = APIRouter(prefix="/api", tags=["Health"])
logger = logging.getLogger("siftwell")


@router.get("/health", response_model=HealthResponse, summary="Check API and database status")
def health_check(response: Response) -> HealthResponse:
    """
    Returns **200** when the API and database are both working, or **503**
    when the API is running but the database can't be reached.
    """
    try:
        check_database_connection()
        database = "connected"
    except Exception as exc:  # any connection problem means "unavailable"
        logger.warning("Health check: database unavailable (%s)", exc)
        database = "unavailable"
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthResponse(
        status="ok" if database == "connected" else "degraded",
        app=settings.app_name,
        environment=settings.app_env,
        version=__version__,
        database=database,
    )
