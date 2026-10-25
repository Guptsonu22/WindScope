from functools import lru_cache
from pathlib import Path
from typing import List, Union
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration settings for WindScope Trading Support."""

    # Project Information
    PROJECT_NAME: str = "WindScope UK Day-Ahead Trading Portal"
    VERSION: str = "1.0.0"
    API_V1_PREFIX: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server Configuration
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Elexon BMRS API
    ELEXON_API_BASE_URL: str = Field(
        default="https://data.elexon.co.uk/bmrs/api/v1",
        description="Elexon Insights Solution (BMRS) REST API v1 Base URL",
    )
    ELEXON_API_KEY: str = Field(
        default="",
        description="Optional API key for Elexon BMRS API (if using authenticated tiers)",
    )
    ELEXON_TIMEOUT_SECONDS: float = 15.0

    # CORS Settings
    CORS_ORIGINS: Union[List[str], str] = Field(
        default=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "*",
        ],
        description="Allowed CORS origins for trading desk frontend and dashboard clients",
    )

    # Storage & Cache Directories
    BASE_DIR: Path = Path(__file__).resolve().parent.parent
    DATA_CACHE_DIR: Path = BASE_DIR / "data"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",") if i.strip()]
        elif isinstance(v, list):
            return v
        return [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "*",
        ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    """Return cached instance of application settings."""
    settings = Settings()
    # Ensure cache directory exists
    settings.DATA_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return settings


settings = get_settings()
