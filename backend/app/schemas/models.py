from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, Field


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
    # Advanced Statistical & Risk Metrics
    wmape_pct: Optional[float] = Field(None, description="Weighted Mean Absolute Percentage Error (%)")
    mbe_mw: Optional[float] = Field(None, description="Mean Bias Error in MW (positive = overforecast)")
    pearson_correlation: Optional[float] = Field(None, description="Pearson correlation coefficient r")
    r2_score: Optional[float] = Field(None, description="Coefficient of determination R²")
    p10_error_mw: Optional[float] = Field(None, description="10th percentile of signed error (MW)")
    p50_error_mw: Optional[float] = Field(None, description="Median signed error (MW)")
    p90_error_mw: Optional[float] = Field(None, description="90th percentile of signed error (MW)")
    p95_error_mw: Optional[float] = Field(None, description="95th percentile of signed error (MW)")
    p90_abs_error_mw: Optional[float] = Field(None, description="90th percentile of absolute error (MW)")


class SettlementPeriodErrorProfile(BaseModel):
    """Half-hourly forecast accuracy and uncertainty profile across SP 1 to 48."""
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
    """Parameters for thermal generation procurement simulation."""
    target_date: Optional[str] = Field(None, description="Date in YYYY-MM-DD format")
    reserve_margin_pct: float = Field(
        default=12.0, ge=0.0, le=50.0, description="Spinning reserve safety buffer percentage"
    )
    ccgt_heat_rate_price_gbp: float = Field(
        default=78.50, description="Indicative Day-Ahead CCGT dispatch cost (£/MWh)"
    )
    ocgt_peaker_price_gbp: float = Field(
        default=135.00, description="Indicative Peaker fast-start dispatch cost (£/MWh)"
    )
    bess_discharge_cost_gbp: float = Field(
        default=95.00, description="Battery storage discharge cycling cost (£/MWh)"
    )


class ThermalProcurementResponse(BaseModel):
    """Calculated thermal capacity procurement strategy for trading desk dispatchers."""
    target_date: str
    reserve_margin_pct: float
    total_thermal_capacity_needed_mw: float
    total_energy_procured_mwh: float
    total_procurement_budget_gbp: float
    peak_procurement_mw: float
    peak_period: int
    asset_breakdown_mwh: Dict[str, float]
    recommendations: List[ThermalProcurementItem]


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
