"""
Application settings.

Values are read from environment variables, or from a `.env` file in the
`backend/` folder. See `.env.example` for every available setting.
"""

from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Siftwell API"
    app_env: str = "development"
    debug: bool = False

    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/siftwell"

    # Stored as a comma-separated string in .env, e.g.
    # CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Google Gemini (AI) ------------------------------------------------
    # The key stays on the server: it is never sent to the browser or logged.
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.5-flash-lite"  # fast Flash model on the free tier
    gemini_timeout_seconds: float = 10.0        # one API call
    gemini_total_timeout_seconds: float = 15.0  # whole extraction, including any retry
    gemini_max_output_tokens: int = 800         # thinking tokens count toward this too
    gemini_thinking_level: str = "minimal"      # Gemini 3: minimal|low|medium|high ("" = model default)
    gemini_api_base: str = "https://generativelanguage.googleapis.com/v1beta"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        """Allow plain `postgresql://` URLs by switching them to the psycopg 3 driver."""
        if value.startswith("postgres://"):
            value = "postgresql://" + value[len("postgres://"):]
        if value.startswith("postgresql://"):
            value = "postgresql+psycopg://" + value[len("postgresql://"):]
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return one shared Settings instance (read once, then cached)."""
    return Settings()


settings = get_settings()
