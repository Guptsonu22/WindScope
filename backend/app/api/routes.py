from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import settings
from app.core.logging import logger
from app.schemas.models import (
    DayAheadForecastResponse,
    GateClosureOption,
    HealthResponse,
    QuantitativeMetrics,
    ThermalProcurementRequest,
    ThermalProcurementResponse,
)
from app.services.data_processor import DataProcessor, get_data_processor
from app.services.elexon_client import ElexonClient, get_elexon_client
from app.services.metrics_engine import MetricsEngine, get_metrics_engine

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthResponse,
    tags=["System Health"],
    summary="Health check for day-ahead trading API",
)
async def get_health(
    elexon_client: ElexonClient = Depends(get_elexon_client),
) -> HealthResponse:
    """Returns runtime health, environment details, and external Elexon BMRS connection status."""
    elexon_health = await elexon_client.check_health()
    status = "ok" if elexon_health["status"] in ["connected", "mock_fallback"] else "degraded"

    return HealthResponse(
        status=status,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        elexon_api_status=elexon_health.get("status", "unknown"),
        services={
            "elexon_client": elexon_health.get("status", "unknown"),
            "data_processor": "healthy",
            "metrics_engine": "healthy",
        },
    )


@router.get(
    "/forecast/day-ahead",
    response_model=DayAheadForecastResponse,
    tags=["Day-Ahead Trading"],
    summary="Retrieve 48 settlement period wind forecast, actual outturns, and error statistics",
)
async def get_day_ahead_forecast(
    target_date: Optional[str] = Query(
        None,
        description="Target electricity delivery date (YYYY-MM-DD). Defaults to current UK trading day.",
    ),
    gate_closure_id: str = Query(
        "d1-1200",
        description="Gate closure run identifier (e.g., d1-1200, d1-1700, intra-h4)",
    ),
    force_refresh: bool = Query(
        False, description="Bypass local parquet/json cache and re-query Elexon API"
    ),
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
    metrics_engine: MetricsEngine = Depends(get_metrics_engine),
) -> DayAheadForecastResponse:
    # Resolve target delivery date (Tomorrow if Day-Ahead, or today)
    if not target_date:
        target_date = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")

    logger.info(f"Day-Ahead forecast request for target delivery date: {target_date} (Gate: {gate_closure_id})")

    # Check cache if not force refreshing
    cached_periods = None if force_refresh else processor.load_cache(target_date)

    if cached_periods:
        periods = cached_periods
        data_source = "cached_archive"
    else:
        # Fetch from Elexon client
        forecast_raw = await elexon_client.fetch_day_ahead_wind_forecast(target_date)
        actual_raw = await elexon_client.fetch_wind_actual_outturn(target_date)
        prices_raw = await elexon_client.fetch_system_prices(target_date)

        periods = processor.align_and_process_dataset(
            target_date=target_date,
            forecast_raw=forecast_raw,
            actual_raw=actual_raw,
            prices_raw=prices_raw,
        )
        data_source = "elexon_insights"

    # Compute quantitative verification metrics
    metrics = metrics_engine.compute_quantitative_metrics(periods)

    gate_names = {
        "d1-1200": "Day-Ahead 12:00 Auction Gate Closure",
        "d1-1700": "Day-Ahead 17:00 Interim Balancing Run",
        "intra-h4": "Intraday H-4 Continuous Trading",
        "intra-h1": "Intraday H-1 Final Physical Notification (FPN)",
    }

    return DayAheadForecastResponse(
        target_date=target_date,
        gate_closure_id=gate_closure_id,
        gate_closure_name=gate_names.get(gate_closure_id, "Custom Gate Closure"),
        last_updated=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        data_source=data_source,
        periods=periods,
        metrics=metrics,
    )


@router.get(
    "/metrics/summary",
    response_model=QuantitativeMetrics,
    tags=["Quantitative Analytics"],
    summary="Get aggregated MAE, MAPE, RMSE, peak deviations, and imbalance exposure",
)
async def get_metrics_summary(
    target_date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format"),
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
    metrics_engine: MetricsEngine = Depends(get_metrics_engine),
) -> QuantitativeMetrics:
    if not target_date:
        target_date = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")

    periods = processor.load_cache(target_date)
    if not periods:
        fc = await elexon_client.fetch_day_ahead_wind_forecast(target_date)
        act = await elexon_client.fetch_wind_actual_outturn(target_date)
        prices = await elexon_client.fetch_system_prices(target_date)
        periods = processor.align_and_process_dataset(target_date, fc, act, prices)

    return metrics_engine.compute_quantitative_metrics(periods)


@router.post(
    "/trading/thermal-procurement",
    response_model=ThermalProcurementResponse,
    tags=["Trading & Hedging"],
    summary="Calculate optimal CCGT/OCGT/BESS thermal procurement to hedge wind shortfall",
)
async def calculate_thermal_procurement(
    params: ThermalProcurementRequest,
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
    metrics_engine: MetricsEngine = Depends(get_metrics_engine),
) -> ThermalProcurementResponse:
    target_date = params.target_date or (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
    periods = processor.load_cache(target_date)

    if not periods:
        fc = await elexon_client.fetch_day_ahead_wind_forecast(target_date)
        act = await elexon_client.fetch_wind_actual_outturn(target_date)
        prices = await elexon_client.fetch_system_prices(target_date)
        periods = processor.align_and_process_dataset(target_date, fc, act, prices)

    return metrics_engine.calculate_thermal_procurement(periods, params)


@router.get(
    "/trading/thermal-procurement",
    response_model=ThermalProcurementResponse,
    tags=["Trading & Hedging"],
    summary="Query thermal procurement with default or query params",
)
async def get_thermal_procurement(
    target_date: Optional[str] = Query(None),
    reserve_margin_pct: float = Query(12.0),
    ccgt_price: float = Query(78.50),
    ocgt_price: float = Query(135.00),
    bess_price: float = Query(95.00),
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
    metrics_engine: MetricsEngine = Depends(get_metrics_engine),
) -> ThermalProcurementResponse:
    request_params = ThermalProcurementRequest(
        target_date=target_date,
        reserve_margin_pct=reserve_margin_pct,
        ccgt_heat_rate_price_gbp=ccgt_price,
        ocgt_peaker_price_gbp=ocgt_price,
        bess_discharge_cost_gbp=bess_price,
    )
    return await calculate_thermal_procurement(
        params=request_params,
        elexon_client=elexon_client,
        processor=processor,
        metrics_engine=metrics_engine,
    )


@router.get(
    "/gate-closures",
    response_model=List[GateClosureOption],
    tags=["Market Operations"],
    summary="List available UK power auction gate closures and physical notification milestones",
)
async def get_gate_closures() -> List[GateClosureOption]:
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    tomorrow_str = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")

    return [
        GateClosureOption(
            id="d1-1200",
            name="Day-Ahead 12:00 Power Auction",
            short_code="DA-12",
            target_date=tomorrow_str,
            closure_time="12:00 BST",
            is_active=True,
            status="TRADING",
            description="Primary UK Day-Ahead Nord Pool / EPEX SPOT power exchange matching gate closure.",
        ),
        GateClosureOption(
            id="d1-1700",
            name="Day-Ahead 17:00 Interim Balancing Run",
            short_code="DA-17",
            target_date=tomorrow_str,
            closure_time="17:00 BST",
            is_active=False,
            status="SCHEDULED",
            description="Post-auction trade matching and National Grid ESO preliminary margin assessment.",
        ),
        GateClosureOption(
            id="intra-h4",
            name="Intraday H-4 Rolling Optimization",
            short_code="ID-H4",
            target_date=today_str,
            closure_time="Rolling H-4",
            is_active=False,
            status="SCHEDULED",
            description="Four-hour forward rolling balancing snapshot for rapid wind ramp adjustments.",
        ),
        GateClosureOption(
            id="intra-h1",
            name="Intraday H-1 Final Physical Notification (FPN)",
            short_code="FPN-H1",
            target_date=today_str,
            closure_time="Rolling H-1",
            is_active=False,
            status="LOCKED",
            description="Statutory Balancing Mechanism Gate Closure. Submissions locked with National Grid ESO.",
        ),
    ]
