from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field


# =============================================================================
# 1. CORE SYSTEM & MARKET OPERATION MODELS
# =============================================================================

class HealthResponse(BaseModel):
    """Health check payload for trading desk uptime monitoring."""
    status: Literal["ok", "degraded", "error"] = Field(default="ok", description="Overall system health")
    version: str = Field(default="1.0.0", description="API version")
    environment: str = Field(default="production", description="Runtime environment")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    elexon_api_status: str = Field(default="ready", description="Status of Elexon BMRS connection")
    services: Dict[str, str] = Field(
        default_factory=lambda: {
            "elexon_client": "healthy",
            "data_processor": "healthy",
            "metrics_engine": "healthy",
        }
    )


class GateClosureOption(BaseModel):
    """Auction gate closure run configuration."""
    id: str
    name: str
    short_code: str
    target_date: str
    closure_time: str
    is_active: bool
    status: Literal["LOCKED", "TRADING", "SCHEDULED"]
    description: str


class MetaInfoResponse(BaseModel):
    """Metadata response for API disclosure, dataset calibration, and service status."""
    dataSource: str = Field(
        default="Elexon BMRS (Insights Solution API v1) FUELHH & WINDFOR streams",
        description="Primary energy system data stream",
    )
    elexonBmrsStatus: str = Field(default="connected", description="External BMRS status")
    targetPeriod: str = Field(default="January 2026", description="Target evaluation period")
    version: str = Field(default="1.0.0", description="API version")
    aiToolsDisclosure: str = Field(
        default="Architected with Google DeepMind Advanced Agentic Coding for UK Day-Ahead power procurement desks.",
        description="AI tooling disclosure",
    )
    lastUpdated: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        description="ISO timestamp of system state",
    )


# =============================================================================
# 2. TIME SERIES & SETTLEMENT PERIOD SCHEMAS
# =============================================================================

class TimeseriesPoint(BaseModel):
    """Half-hourly time series record for actual outturn vs forecast comparison."""
    startTime: str = Field(..., description="ISO 8601 interval start timestamp (UTC)")
    publishTime: str = Field(..., description="Forecast publication timestamp prior to gate closure")
    forecastMW: float = Field(..., description="Day-Ahead wind forecast in MW")
    actualMW: Optional[float] = Field(None, description="Actual wind generation outturn in MW")
    errorMW: Optional[float] = Field(None, description="Forecast Error Delta (Forecast - Actual) in MW")
    settlementPeriod: int = Field(ge=1, le=50, description="UK Settlement Period (1-48)")


class SettlementPeriodData(BaseModel):
    """Single half-hour UK Settlement Period record (1 to 48/50)."""
    settlement_period: int = Field(ge=1, le=50, description="UK Settlement Period (1-48 on standard days)")
    time_slot: str = Field(..., description="Time interval e.g. 00:00 - 00:30")
    start_time: str = Field(..., description="ISO start time in UTC/BST")
    end_time: str = Field(..., description="ISO end time in UTC/BST")
    forecast_mw: float = Field(..., description="Day-Ahead Wind Forecast in Megawatts (MW)")
    actual_mw: Optional[float] = Field(None, description="Actual Generation Outturn in Megawatts (MW)")
    error_mw: Optional[float] = Field(None, description="Forecast Error Delta (Actual - Forecast) in MW")
    error_pct: Optional[float] = Field(None, description="Percentage Forecast Deviation")
    imbalance_direction: Literal["SHORT", "LONG", "BALANCED"] = Field(
        default="BALANCED",
        description="Desk imbalance state: SHORT (wind deficit, purchase needed) or LONG (wind surplus)",
    )
    system_price_gbp_mwh: Optional[float] = Field(
        None, description="Settlement System Buy/Sell Cashout Price (£/MWh)"
    )
    cashout_exposure_gbp: Optional[float] = Field(
        None, description="Estimated Cashout Financial Exposure (£) for the half-hour"
    )


# =============================================================================
# 3. STATISTICAL & QUANTITATIVE METRICS SCHEMAS
# =============================================================================

class MetricSummary(BaseModel):
    """Exact mathematical forecast error metrics and energy volume aggregations."""
    mae: float = Field(..., description="Mean Absolute Error in MW")
    rmse: float = Field(..., description="Root Mean Squared Error in MW")
    mape: float = Field(..., description="Mean Absolute Percentage Error (%)")
    wmape: float = Field(..., description="Weighted Mean Absolute Percentage Error (%) - avoids low-wind distortion")
    bias: float = Field(..., description="Mean Bias Error (MW). Positive = over-forecast, Negative = under-forecast")
    p10: float = Field(..., description="10th percentile of signed error (MW)")
    p50: float = Field(..., description="50th percentile (median) of signed error (MW)")
    p90: float = Field(..., description="90th percentile of signed error (MW)")
    totalGenerationForecastMWh: float = Field(..., description="Total forecasted wind volume (MWh)")
    totalGenerationActualMWh: float = Field(..., description="Total actual wind generation volume (MWh)")


class QuantitativeMetrics(BaseModel):
    """Statistical verification and trading desk risk exposure metrics."""
    mae_mw: float = Field(..., description="Mean Absolute Error in MW")
    mape_pct: float = Field(..., description="Mean Absolute Percentage Error (%)")
    rmse_mw: float = Field(..., description="Root Mean Squared Error in MW")
    peak_error_mw: float = Field(..., description="Maximum absolute forecast deviation in MW")
    peak_error_period: int = Field(..., description="Settlement Period where peak deviation occurred")
    directional_bias_mw: float = Field(
        ...,
        description="Mean Signed Deviation (MW). Positive = systematic overforecast, Negative = underforecast",
    )
    total_short_volume_mwh: float = Field(..., description="Total aggregate short energy exposure in MWh")
    total_long_volume_mwh: float = Field(..., description="Total aggregate long energy exposure in MWh")
    net_imbalance_volume_mwh: float = Field(..., description="Net imbalance volume across delivery day (MWh)")
    estimated_cashout_exposure_gbp: float = Field(
        ..., description="Estimated total imbalance settlement liability (£)"
    )
    wmape_pct: Optional[float] = Field(None, description="Weighted Mean Absolute Percentage Error (%)")
    mbe_mw: Optional[float] = Field(None, description="Mean Bias Error in MW (positive = overforecast)")
    pearson_correlation: Optional[float] = Field(None, description="Pearson correlation coefficient r")
    r2_score: Optional[float] = Field(None, description="Coefficient of determination R²")
    p10_error_mw: Optional[float] = Field(None, description="10th percentile of signed error (MW)")
    p50_error_mw: Optional[float] = Field(None, description="Median signed error (MW)")
    p90_error_mw: Optional[float] = Field(None, description="90th percentile of signed error (MW)")
    p95_error_mw: Optional[float] = Field(None, description="95th percentile of signed error (MW)")
    p90_abs_error_mw: Optional[float] = Field(None, description="90th percentile of absolute error (MW)")


class SettlementPeriodError(BaseModel):
    """Statistical error profile for an individual half-hourly settlement period (1-48)."""
    periodNumber: int = Field(ge=1, le=50, description="Settlement period number (1 to 48)")
    timeLabel: str = Field(..., description="Half-hour time interval (e.g. 00:00 - 00:30)")
    avgActualMW: float = Field(..., description="Average actual wind generation in MW")
    avgForecastMW: float = Field(..., description="Average forecasted wind generation in MW")
    maeMW: float = Field(..., description="Mean Absolute Error in MW")
    biasMW: float = Field(..., description="Mean Bias Error in MW")


class SettlementPeriodErrorProfile(BaseModel):
    """Extended half-hourly forecast accuracy and uncertainty profile across SP 1 to 48."""
    settlement_period: int = Field(ge=1, le=50)
    time_slot: str
    mean_forecast_mw: float
    mean_actual_mw: float
    mae_mw: float
    rmse_mw: float
    wmape_pct: float
    mbe_mw: float
    p90_abs_error_mw: float
    uncertainty_tier: Literal["HIGH_VOLATILITY", "MODERATE", "STABLE"]


class HorizonDecayMetric(BaseModel):
    """Forecast accuracy comparison across lead-time horizons."""
    horizon: str
    lead_time_hours: float
    mae_mw: float
    rmse_mw: float
    wmape_pct: float
    mbe_mw: float
    pearson_r: float
    mae_reduction_pct_vs_day_ahead: float


class DashboardOverviewResponse(BaseModel):
    """Top-level consolidated dashboard overview response for power trading desks."""
    dateRange: str = Field(..., description="Evaluated date interval e.g. 2026-01-01 to 2026-01-31")
    metrics: MetricSummary = Field(..., description="Aggregated mathematical accuracy metrics")
    timeseries: List[TimeseriesPoint] = Field(..., description="30-minute settlement period timeseries")
    periodErrors: List[SettlementPeriodError] = Field(..., description="Settlement period error breakdown (1-48)")


# =============================================================================
# 4. THERMAL PROCUREMENT & ADVISOR DECISION SUPPORT SCHEMAS
# =============================================================================

class HourlyThermalScheduleItem(BaseModel):
    """Hourly/half-hourly thermal procurement advice with risk buffer."""
    time: str = Field(..., description="Settlement period time window")
    demand: float = Field(..., description="Customer electricity demand in MW")
    forecastWind: float = Field(..., description="Forecasted wind generation in MW")
    recommendedThermalProcureMW: float = Field(..., description="Recommended thermal generation procurement (MW)")
    safetyReserveMW: float = Field(..., description="Safety reserve buffer volume (MW)")


class ThermalGapPeriod(BaseModel):
    """Half-hourly thermal procurement requirement under expected and conservative P90 strategies."""
    settlement_period: int = Field(ge=1, le=50)
    time_slot: str
    demand_mw: float
    wind_forecast_mw: float
    wind_actual_mw: Optional[float] = None
    thermal_expected_mw: float
    thermal_conservative_mw: float
    p90_buffer_mw: float
    imbalance_exposure_mw: float


class ThermalGapAnalysis(BaseModel):
    """Procurement decision-support gap analysis balancing wind forecast with thermal dispatch."""
    target_date: str
    p90_buffer_mw: float
    total_demand_mwh: float
    total_thermal_expected_mwh: float
    total_thermal_conservative_mwh: float
    peak_thermal_expected_mw: float
    peak_thermal_conservative_mw: float
    peak_thermal_period: int
    total_safety_margin_mwh: float
    periods: List[ThermalGapPeriod]


class ThermalProcurementItem(BaseModel):
    """Specific thermal replacement procurement recommendation for an individual settlement period."""
    settlement_period: int = Field(ge=1, le=50)
    time_slot: str
    wind_forecast_mw: float
    revised_expected_mw: float
    wind_deficit_mw: float
    required_reserve_mw: float
    recommended_procurement_mw: float
    recommended_asset: Literal["CCGT Base", "OCGT Peaker", "BESS Fast Reserve", "Demand Side Balancing"]
    indicative_spark_spread_price_gbp: float
    estimated_procurement_cost_gbp: float
    urgency: Literal["CRITICAL", "HIGH", "MODERATE", "LOW"]


class ThermalProcurementRequest(BaseModel):
    """Parameters for thermal procurement analysis and asset dispatch simulation."""
    targetDate: Optional[str] = Field(default="2026-01-15", alias="target_date", description="Target delivery date (YYYY-MM-DD)")
    customerDemandMW: Optional[float] = Field(default=None, alias="customer_demand_mw", description="Customer demand baseline in MW")
    gateClosureTime: str = Field(default="11:00", alias="gate_closure_time", description="Gate closure run time (e.g. 11:00)")
    safetyBufferPercentile: float = Field(default=90.0, alias="safety_buffer_percentile", description="Safety buffer percentile e.g. 90")

    # Asset simulation parameters (retained for backward compatibility)
    reserve_margin_pct: Optional[float] = Field(default=12.0, ge=0.0, le=50.0)
    ccgt_heat_rate_price_gbp: Optional[float] = Field(default=78.50)
    ocgt_peaker_price_gbp: Optional[float] = Field(default=135.00)
    bess_discharge_cost_gbp: Optional[float] = Field(default=95.00)

    class Config:
        populate_by_name = True


class ThermalProcurementResponse(BaseModel):
    """Thermal procurement schedule and portfolio hedge advice for trading dispatchers."""
    targetDate: str = Field(..., alias="target_date", description="Delivery date (YYYY-MM-DD)")
    hourlySchedule: Optional[List[HourlyThermalScheduleItem]] = Field(
        default=None, alias="hourly_schedule", description="Hourly schedule of demand, wind, and thermal procure"
    )

    # Optional fields for asset portfolio breakdown
    reserve_margin_pct: Optional[float] = 12.0
    total_thermal_capacity_needed_mw: Optional[float] = 0.0
    total_energy_procured_mwh: Optional[float] = 0.0
    total_procurement_budget_gbp: Optional[float] = 0.0
    peak_procurement_mw: Optional[float] = 0.0
    peak_period: Optional[int] = 1
    asset_breakdown_mwh: Optional[Dict[str, float]] = None
    recommendations: Optional[List[ThermalProcurementItem]] = None

    class Config:
        populate_by_name = True


class DayAheadForecastResponse(BaseModel):
    """Consolidated Day-Ahead operational response."""
    target_date: str
    gate_closure_id: str
    gate_closure_name: str
    last_updated: str
    data_source: str
    periods: List[SettlementPeriodData]
    metrics: QuantitativeMetrics
    procurement_summary: Optional[Dict[str, float]] = None
