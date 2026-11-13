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

    # --- Authentication ----------------------------------------------------
    # Secret used to sign login tokens (JWT). REQUIRED in production; generate one with:
    #   python -c "import secrets; print(secrets.token_urlsafe(48))"
    jwt_secret_key: SecretStr | None = None
    jwt_expire_minutes: int = 720              # 12 hours
    login_max_failures: int = 5                # failed logins allowed per email+IP...
    login_lockout_minutes: int = 15            # ...within this window

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in ("production", "prod")

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
