from datetime import date, datetime, timedelta, timezone
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
import numpy as np
import pandas as pd

from app.config import settings
from app.core.logging import logger
from app.schemas.models import (
    DashboardOverviewResponse,
    DayAheadForecastResponse,
    GateClosureOption,
    HealthResponse,
    HorizonDecayMetric,
    HourlyThermalScheduleItem,
    MetaInfoResponse,
    MetricSummary,
    QuantitativeMetrics,
    SettlementPeriodData,
    SettlementPeriodError,
    SettlementPeriodErrorProfile,
    ThermalGapAnalysis,
    ThermalProcurementRequest,
    ThermalProcurementResponse,
    TimeseriesPoint,
)
from app.services.data_processor import DataProcessor, get_data_processor
from app.services.elexon_client import ElexonClient, get_elexon_client
from app.services.metrics_engine import (
    MetricsEngine,
    calculate_error_percentiles,
    calculate_mae,
    calculate_mape,
    calculate_mbe,
    calculate_rmse,
    calculate_wmape,
    get_metrics_engine,
)

router = APIRouter()


def validate_date_string(date_str: str, field_name: str) -> date:
    """Validate ISO YYYY-MM-DD date format, raising HTTP 422 if malformed."""
    if not date_str or not isinstance(date_str, str):
        raise HTTPException(
            status_code=422,
            detail=f"Field '{field_name}' is required and must be a string formatted as YYYY-MM-DD.",
        )
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str.strip()):
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {field_name} format: '{date_str}'. Expected ISO date format YYYY-MM-DD.",
        )
    try:
        return datetime.strptime(date_str.strip(), "%Y-%m-%d").date()
    except ValueError as err:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {field_name} date value: '{date_str}'. {str(err)}",
        )


def compute_settlement_period_errors(aligned_df: pd.DataFrame) -> List[SettlementPeriodError]:
    """Fast vectorized calculation of 48 settlement period error statistics."""
    if aligned_df.empty:
        return []

    df = aligned_df.copy()
    f_col = df["forecastGenerationMW"]
    a_col = df["actualGenerationMW"]
    df["_abs_err"] = (f_col - a_col).abs()
    df["_bias_err"] = f_col - a_col

    grouped = (
        df.groupby("settlementPeriod", as_index=False)
        .agg(
            avgActualMW=("actualGenerationMW", "mean"),
            avgForecastMW=("forecastGenerationMW", "mean"),
            maeMW=("_abs_err", "mean"),
            biasMW=("_bias_err", "mean"),
        )
        .sort_values("settlementPeriod")
    )

    records = grouped.to_dict(orient="records")
    results: List[SettlementPeriodError] = []
    for r in records:
        sp_int = int(r["settlementPeriod"])
        start_m = (sp_int - 1) * 30
        time_label = f"{start_m // 60:02d}:{start_m % 60:02d} - {(start_m + 30) // 60:02d}:{(start_m + 30) % 60:02d}"
        results.append(
            SettlementPeriodError(
                periodNumber=sp_int,
                timeLabel=time_label,
                avgActualMW=round(float(r["avgActualMW"]), 2),
                avgForecastMW=round(float(r["avgForecastMW"]), 2),
                maeMW=round(float(r["maeMW"]), 2),
                biasMW=round(float(r["biasMW"]), 2),
            )
        )
    return results


# =============================================================================
# 1. CORE SYSTEM HEALTH & METADATA ENDPOINTS
# =============================================================================

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
    "/meta/info",
    response_model=MetaInfoResponse,
    tags=["System Health"],
    summary="Returns platform metadata, Elexon BMRS status, target evaluation period, and AI disclosure",
)
async def get_meta_info(
    elexon_client: ElexonClient = Depends(get_elexon_client),
) -> MetaInfoResponse:
    """Returns metadata including data sources, BMRS status, evaluation period, version, and AI tools disclosure."""
    health = await elexon_client.check_health()
    return MetaInfoResponse(
        dataSource="Elexon BMRS (Insights Solution API v1) FUELHH & WINDFOR streams",
        elexonBmrsStatus=health.get("status", "connected"),
        targetPeriod="January 2026",
        version=settings.VERSION,
        aiToolsDisclosure="Architected with Google DeepMind Advanced Agentic Coding for UK Day-Ahead power procurement desks.",
        lastUpdated=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )


# =============================================================================
# 2. RESTFUL WIND ANALYTICS & OVERVIEW ENDPOINTS (TASK SPECIFICATION)
# =============================================================================

@router.get(
    "/wind/overview",
    response_model=DashboardOverviewResponse,
    tags=["Wind Overview"],
    summary="Consolidated monthly/range overview with metrics, timeseries, and 48-period error breakdown",
)
async def get_wind_overview(
    startDate: str = Query("2026-01-01", description="Start date in YYYY-MM-DD format"),
    endDate: str = Query("2026-01-31", description="End date in YYYY-MM-DD format"),
    gateClosureTime: str = Query("11:00", description="Gate closure run time (default '11:00' UK Day-Ahead)"),
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
) -> DashboardOverviewResponse:
    """
    Returns consolidated overview including:
    - High-level statistical accuracy metrics (MAE, RMSE, wMAPE, MAPE, MBE Bias, P10/P50/P90)
    - Full 30-minute timeseries actual vs forecast points
    - Error breakdown across all 48 settlement periods.
    """
    validate_date_string(startDate, "startDate")
    validate_date_string(endDate, "endDate")

    actuals, forecasts = elexon_client.get_or_create_january_2026_data()
    aligned_df = processor.align_day_ahead_forecasts(
        actuals=actuals,
        forecasts=forecasts,
        gate_closure_time=gateClosureTime,
        start_date=startDate,
        end_date=endDate,
    )

    if aligned_df.empty:
        raise HTTPException(
            status_code=404,
            detail=f"No aligned wind forecast/actual records found for date range {startDate} to {endDate}.",
        )

    # 1. Timeseries points (fast list comprehension)
    records = aligned_df.to_dict(orient="records")
    timeseries: List[TimeseriesPoint] = [
        TimeseriesPoint(
            startTime=str(r["startTime"]),
            publishTime=str(r["publishTime"]),
            forecastMW=round(float(r["forecastGenerationMW"]), 1),
            actualMW=round(float(r["actualGenerationMW"]), 1) if pd.notnull(r.get("actualGenerationMW")) else None,
            errorMW=round(float(r["forecastErrorMW"]), 1) if pd.notnull(r.get("forecastErrorMW")) else None,
            settlementPeriod=int(r["settlementPeriod"]),
        )
        for r in records
    ]

    # 2. Mathematical Metric Summary
    f_vals = aligned_df["forecastGenerationMW"].values
    a_vals = aligned_df["actualGenerationMW"].values
    mae = calculate_mae(f_vals, a_vals)
    rmse = calculate_rmse(f_vals, a_vals)
    mape = calculate_mape(f_vals, a_vals)
    wmape = calculate_wmape(f_vals, a_vals)
    bias = calculate_mbe(f_vals, a_vals)
    pcts = calculate_error_percentiles(f_vals, a_vals, percentiles=(10, 50, 90))
    total_fc_mwh = float(np.sum(f_vals) * 0.5)
    total_act_mwh = float(np.sum(a_vals) * 0.5)

    metrics = MetricSummary(
        mae=round(mae, 2),
        rmse=round(rmse, 2),
        mape=round(mape, 2),
        wmape=round(wmape, 2),
        bias=round(bias, 2),
        p10=round(pcts.get("P10", 0.0), 2),
        p50=round(pcts.get("P50", 0.0), 2),
        p90=round(pcts.get("P90", 0.0), 2),
        totalGenerationForecastMWh=round(total_fc_mwh, 2),
        totalGenerationActualMWh=round(total_act_mwh, 2),
    )

    # 3. 48-Period Settlement Period Errors
    period_errors = compute_settlement_period_errors(aligned_df)

    return DashboardOverviewResponse(
        dateRange=f"{startDate} to {endDate}",
        metrics=metrics,
        timeseries=timeseries,
        periodErrors=period_errors,
    )


@router.get(
    "/wind/timeseries",
    response_model=List[TimeseriesPoint],
    tags=["Wind Overview"],
    summary="Get 30-min resolution actuals vs forecasts for a single day or date range",
)
async def get_wind_timeseries(
    date: Optional[str] = Query(None, description="Single day view (YYYY-MM-DD)"),
    startDate: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
    endDate: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
    gateClosureTime: str = Query("11:00", description="Gate closure run time"),
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
) -> List[TimeseriesPoint]:
    """Returns 30-minute resolution wind generation actual outturns vs forecasts."""
    if date:
        validate_date_string(date, "date")
        s_date, e_date = date, date
    else:
        s_date = startDate or "2026-01-01"
        e_date = endDate or "2026-01-31"
        validate_date_string(s_date, "startDate")
        validate_date_string(e_date, "endDate")

    actuals, forecasts = elexon_client.get_or_create_january_2026_data()
    aligned_df = processor.align_day_ahead_forecasts(
        actuals=actuals,
        forecasts=forecasts,
        gate_closure_time=gateClosureTime,
        start_date=s_date,
        end_date=e_date,
    )

    records = aligned_df.to_dict(orient="records")
    return [
        TimeseriesPoint(
            startTime=str(r["startTime"]),
            publishTime=str(r["publishTime"]),
            forecastMW=round(float(r["forecastGenerationMW"]), 1),
            actualMW=round(float(r["actualGenerationMW"]), 1) if pd.notnull(r.get("actualGenerationMW")) else None,
            errorMW=round(float(r["forecastErrorMW"]), 1) if pd.notnull(r.get("forecastErrorMW")) else None,
            settlementPeriod=int(r["settlementPeriod"]),
        )
        for r in records
    ]


@router.get(
    "/wind/metrics",
    response_model=MetricSummary,
    tags=["Wind Overview"],
    summary="Returns statistical accuracy metrics breakdown for date range",
)
async def get_wind_metrics(
    startDate: str = Query("2026-01-01", description="Start date (YYYY-MM-DD)"),
    endDate: str = Query("2026-01-31", description="End date (YYYY-MM-DD)"),
    gateClosureTime: str = Query("11:00", description="Gate closure run time"),
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
) -> MetricSummary:
    """Returns exact error metrics (MAE, RMSE, wMAPE, MAPE, MBE, P10, P50, P90)."""
    validate_date_string(startDate, "startDate")
    validate_date_string(endDate, "endDate")

    actuals, forecasts = elexon_client.get_or_create_january_2026_data()
    aligned_df = processor.align_day_ahead_forecasts(
        actuals=actuals,
        forecasts=forecasts,
        gate_closure_time=gateClosureTime,
        start_date=startDate,
        end_date=endDate,
    )

    if aligned_df.empty:
        raise HTTPException(status_code=404, detail="No data found for given parameters")

    f_vals = aligned_df["forecastGenerationMW"].values
    a_vals = aligned_df["actualGenerationMW"].values
    mae = calculate_mae(f_vals, a_vals)
    rmse = calculate_rmse(f_vals, a_vals)
    mape = calculate_mape(f_vals, a_vals)
    wmape = calculate_wmape(f_vals, a_vals)
    bias = calculate_mbe(f_vals, a_vals)
    pcts = calculate_error_percentiles(f_vals, a_vals, percentiles=(10, 50, 90))
    total_fc_mwh = float(np.sum(f_vals) * 0.5)
    total_act_mwh = float(np.sum(a_vals) * 0.5)

    return MetricSummary(
        mae=round(mae, 2),
        rmse=round(rmse, 2),
        mape=round(mape, 2),
        wmape=round(wmape, 2),
        bias=round(bias, 2),
        p10=round(pcts.get("P10", 0.0), 2),
        p50=round(pcts.get("P50", 0.0), 2),
        p90=round(pcts.get("P90", 0.0), 2),
        totalGenerationForecastMWh=round(total_fc_mwh, 2),
        totalGenerationActualMWh=round(total_act_mwh, 2),
    )


@router.get(
    "/wind/settlement-analysis",
    response_model=List[SettlementPeriodError],
    tags=["Wind Overview"],
    summary="Returns error breakdown for all 48 settlement periods",
)
async def get_settlement_analysis(
    startDate: str = Query("2026-01-01", description="Start date (YYYY-MM-DD)"),
    endDate: str = Query("2026-01-31", description="End date (YYYY-MM-DD)"),
    gateClosureTime: str = Query("11:00", description="Gate closure run time"),
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
) -> List[SettlementPeriodError]:
    """Returns half-hourly error profile across all 48 settlement periods."""
    validate_date_string(startDate, "startDate")
    validate_date_string(endDate, "endDate")

    actuals, forecasts = elexon_client.get_or_create_january_2026_data()
    aligned_df = processor.align_day_ahead_forecasts(
        actuals=actuals,
        forecasts=forecasts,
        gate_closure_time=gateClosureTime,
        start_date=startDate,
        end_date=endDate,
    )

    if aligned_df.empty:
        raise HTTPException(status_code=404, detail="No data found for given parameters")

    return compute_settlement_period_errors(aligned_df)


@router.post(
    "/procurement/thermal-advisor",
    response_model=ThermalProcurementResponse,
    tags=["Trading & Hedging"],
    summary="Accepts ThermalProcurementRequest and returns hourly thermal procurement recommendation with quantified risk margins",
)
async def post_thermal_advisor(
    request: ThermalProcurementRequest,
    elexon_client: ElexonClient = Depends(get_elexon_client),
    processor: DataProcessor = Depends(get_data_processor),
    metrics_engine: MetricsEngine = Depends(get_metrics_engine),
) -> ThermalProcurementResponse:
    """Calculates hourly thermal procurement schedule with safety reserve margins based on forecast errors."""
    target_date = request.targetDate or request.target_date or "2026-01-15"
    validate_date_string(target_date, "targetDate")

    actuals, forecasts = elexon_client.get_or_create_january_2026_data()
    aligned_df = processor.align_day_ahead_forecasts(
        actuals=actuals,
        forecasts=forecasts,
        delivery_date=target_date,
        gate_closure_time=request.gateClosureTime,
    )

    if aligned_df.empty:
        aligned_df = processor.align_day_ahead_forecasts(
            actuals=actuals,
            forecasts=forecasts,
            delivery_date="2026-01-15",
            gate_closure_time=request.gateClosureTime,
        )

    # Calculate percentile safety buffer
    p_level = max(1.0, min(99.0, request.safetyBufferPercentile))
    f_all = aligned_df["forecastGenerationMW"].values
    a_all = aligned_df["actualGenerationMW"].values
    shortfalls = np.maximum(0.0, f_all - a_all)
    safety_buffer = float(np.percentile(shortfalls, p_level)) if np.any(shortfalls > 0) else float(np.percentile(np.abs(f_all - a_all), p_level))

    # Customer demand curve (custom or typical UK winter demand)
    n_records = len(aligned_df)
    if request.customerDemandMW is not None and request.customerDemandMW > 0:
        demand_profile = np.full(n_records, float(request.customerDemandMW))
    else:
        demand_profile = metrics_engine._generate_typical_uk_winter_demand(n_records)

    hourly_schedule: List[HourlyThermalScheduleItem] = []
    total_thermal_mwh = 0.0

    for idx, (_, row) in enumerate(aligned_df.iterrows()):
        sp = int(row["settlementPeriod"])
        start_m = (sp - 1) * 30
        time_slot = f"{start_m // 60:02d}:{start_m % 60:02d} - {(start_m + 30) // 60:02d}:{(start_m + 30) % 60:02d}"
        d_val = float(demand_profile[idx])
        fc_wind = float(row["forecastGenerationMW"])

        # Expected Thermal: max(0, Demand(t) - Forecast(t))
        thermal_exp = max(0.0, d_val - fc_wind)

        # Conservative P-percentile Safety Procure: max(0, Demand(t) - (Forecast(t) - SafetyBuffer))
        thermal_cons = max(0.0, d_val - (fc_wind - safety_buffer))

        # Safety reserve volume
        safety_reserve = thermal_cons - thermal_exp

        total_thermal_mwh += thermal_exp * 0.5

        hourly_schedule.append(
            HourlyThermalScheduleItem(
                time=time_slot,
                demand=round(d_val, 1),
                forecastWind=round(fc_wind, 1),
                recommendedThermalProcureMW=round(thermal_exp, 1),
                safetyReserveMW=round(safety_reserve, 1),
            )
        )

    peak_cap = round(float(np.max([item.recommendedThermalProcureMW for item in hourly_schedule])), 1) if hourly_schedule else 0.0

    return ThermalProcurementResponse(
        targetDate=target_date,
        hourlySchedule=hourly_schedule,
        total_energy_procured_mwh=round(total_thermal_mwh, 2),
        total_thermal_capacity_needed_mw=peak_cap,
    )


# =============================================================================
# 3. OPERATIONAL PORTAL & LEGACY ROUTE SUPPORT
# =============================================================================

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
    if not target_date:
        target_date = (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")

    cached_periods = None if force_refresh else processor.load_cache(target_date)

    if cached_periods:
        periods = cached_periods
        data_source = "cached_archive"
    else:
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
    target_date = params.targetDate or params.target_date or (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d")
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
