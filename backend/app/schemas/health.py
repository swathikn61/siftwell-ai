from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    app: str
    environment: str
    version: str
    database: Literal["connected", "unavailable"]
