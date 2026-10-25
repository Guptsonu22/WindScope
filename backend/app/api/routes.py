from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.config import settings
from app.core.logging import logger
from app.schemas.models import (
    DayAheadForecastResponse,
    GateClosureOption,
    HealthResponse,
    HorizonDecayMetric,
    QuantitativeMetrics,
    SettlementPeriodErrorProfile,
    ThermalGapAnalysis,
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
            gate_closure_time=gate_closure_id,
        )
        data_source = "elexon_insights"

    # Compute quantitative verification metrics
    metrics = metrics_engine.compute_quantitative_metrics(periods)

    gate_names = {
        "d1-1100": "Day-Ahead 11:00 Power Auction (EPEX/N2EX)",
        "11:00": "Day-Ahead 11:00 Power Auction (EPEX/N2EX)",
        "09:00": "Day-Ahead 09:00 Early Outlook",
        "d1-1200": "Day-Ahead 12:00 Auction Gate Closure",
        "14:00": "Day-Ahead 14:00 Post-Auction Adjustment",
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
    "/forecast/gate-comparison",
    tags=["Day-Ahead Trading"],
    summary="Compare forecast accuracy across multiple gate closure times (09:00, 11:00, 14:00, Intraday)",
)
async def get_gate_comparison(
    target_date: Optional[str] = Query(None, description="Delivery date e.g. 2026-01-15"),
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
):
    if not target_date:
        target_date = "2026-01-15"
    actuals = await elexon_client.fetch_actual_wind(target_date, target_date)
    forecasts = await elexon_client.fetch_forecast_wind(target_date, target_date)
    comp_df = processor.compare_gate_closure_accuracies(actuals, forecasts, target_date)
    return comp_df.to_dict(orient="records")


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


@router.get(
    "/metrics/thermal-gap",
    response_model=ThermalGapAnalysis,
    tags=["Quantitative Analytics"],
    summary="Compute utility thermal gap, expected & P90 conservative procurement and imbalance exposure risk",
)
async def get_thermal_gap(
    target_date: Optional[str] = Query("2026-01-15", description="Target delivery date (YYYY-MM-DD)"),
    p90_buffer: Optional[float] = Query(None, description="Custom P90 safety buffer in MW. If omitted, calculated from historical errors."),
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
    metrics_engine: MetricsEngine = Depends(get_metrics_engine),
) -> ThermalGapAnalysis:
    periods = processor.load_cache(target_date)
    if not periods:
        fc = await elexon_client.fetch_day_ahead_wind_forecast(target_date)
        act = await elexon_client.fetch_wind_actual_outturn(target_date)
        prices = await elexon_client.fetch_system_prices(target_date)
        periods = processor.align_and_process_dataset(target_date, fc, act, prices)

    forecast_mw = [p.forecast_mw for p in periods]
    actual_mw = [p.actual_mw if p.actual_mw is not None else p.forecast_mw for p in periods]

    return metrics_engine.calculate_thermal_gap(
        forecast_mw=forecast_mw,
        actual_mw=actual_mw,
        p90_buffer_mw=p90_buffer,
        target_date=target_date,
    )


@router.get(
    "/metrics/settlement-profile",
    response_model=List[SettlementPeriodErrorProfile],
    tags=["Quantitative Analytics"],
    summary="Calculate average error and uncertainty profile across all 48 settlement periods",
)
async def get_settlement_profile(
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
    metrics_engine: MetricsEngine = Depends(get_metrics_engine),
) -> List[SettlementPeriodErrorProfile]:
    actuals, forecasts = elexon_client.get_or_create_january_2026_data()
    aligned_df = processor.align_day_ahead_forecasts(actuals, forecasts, gate_closure_time="11:00")
    return metrics_engine.calculate_settlement_period_breakdown(aligned_df)


@router.get(
    "/metrics/horizon-decay",
    response_model=List[HorizonDecayMetric],
    tags=["Quantitative Analytics"],
    summary="Evaluate accuracy decay/improvement across forecast lead time horizons (D-1 11:00, D-1 14:00, Intraday H-4, H-1)",
)
async def get_horizon_decay(
    delivery_date: Optional[str] = Query("2026-01-15", description="Target delivery date (YYYY-MM-DD)"),
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
    metrics_engine: MetricsEngine = Depends(get_metrics_engine),
) -> List[HorizonDecayMetric]:
    actuals, forecasts = elexon_client.get_or_create_january_2026_data()
    return metrics_engine.evaluate_forecast_horizon_decay(
        actuals=actuals,
        forecasts=forecasts,
        delivery_date=delivery_date,
        data_processor=processor,
    )



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
            id="d1-1100",
            name="Day-Ahead 11:00 Auction (EPEX/N2EX)",
            short_code="DA-11",
            target_date=tomorrow_str,
            closure_time="11:00 GMT",
            is_active=True,
            status="TRADING",
            description="Primary UK Day-Ahead EPEX SPOT / N2EX power auction gate closure. Bids matched against pre-11:00 forecasts.",
        ),
        GateClosureOption(
            id="d1-1200",
            name="Day-Ahead 12:00 Power Auction",
            short_code="DA-12",
            target_date=tomorrow_str,
            closure_time="12:00 GMT",
            is_active=False,
            status="SCHEDULED",
            description="Secondary UK Day-Ahead exchange matching and intra-utility schedule nominations.",
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
