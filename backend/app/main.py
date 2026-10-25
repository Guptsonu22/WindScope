from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.config import settings
from app.core.logging import logger
from app.schemas.models import HealthResponse


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle hooks for trading desk engine startup and shutdown."""
    logger.info("=" * 60)
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    logger.info(f"Environment: {settings.ENVIRONMENT} | Port: {settings.PORT}")
    logger.info(f"Elexon BMRS Endpoint: {settings.ELEXON_API_BASE_URL}")
    logger.info(f"CORS Allowed Origins: {settings.CORS_ORIGINS}")
    logger.info("=" * 60)
    try:
        from app.services.elexon_client import ElexonClient
        client = ElexonClient()
        client.get_or_create_january_2026_data()
        logger.info("Pre-warmed January 2026 Elexon data cache in memory.")
    except Exception as e:
        logger.warning(f"Cache pre-warm skipped or failed: {e}")
    yield
    logger.info("WindScope trading portal backend shutting down...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="High-frequency, decision-support platform for UK Day-Ahead wind energy trading and thermal procurement hedging.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS Middleware for Frontend Portals
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Root health check endpoint (Requirement 3: Health check endpoint at /health)
@app.get("/health", response_model=HealthResponse, tags=["System Health"])
async def root_health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        elexon_api_status="ready",
        services={
            "api_server": "healthy",
            "data_processor": "healthy",
            "metrics_engine": "healthy",
        },
    )


# Root information endpoint
@app.get("/", tags=["Overview"])
async def root_overview():
    return {
        "platform": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "operational",
        "health": "/health",
        "api_v1": settings.API_V1_PREFIX,
        "docs": "/docs",
        "description": "UK Power Trading Desk Wind Forecast & Thermal Reserve Decision Support",
    }


# Include v1 API routes (Provides /api/v1/health, /api/v1/forecast/day-ahead, /api/v1/metrics/summary, etc.)
app.include_router(api_router, prefix=settings.API_V1_PREFIX)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
