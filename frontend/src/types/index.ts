export type ImbalanceDirection = 'SHORT' | 'LONG' | 'BALANCED';
export type AssetType = 'CCGT Base' | 'OCGT Peaker' | 'BESS Fast Reserve' | 'Demand Side Balancing';
export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
export type GateClosureStatus = 'LOCKED' | 'TRADING' | 'SCHEDULED';

export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  environment: string;
  timestamp: string;
  elexon_api_status: string;
  services: Record<string, string>;
}

export interface SettlementPeriodData {
  settlement_period: number;
  time_slot: string;
  start_time: string;
  end_time: string;
  forecast_mw: number;
  actual_mw: number | null;
  error_mw: number | null;
  error_pct: number | null;
  imbalance_direction: ImbalanceDirection;
  system_price_gbp_mwh: number | null;
  cashout_exposure_gbp: number | null;
}

export interface QuantitativeMetrics {
  mae_mw: number;
  mape_pct: number;
  rmse_mw: number;
  peak_error_mw: number;
  peak_error_period: number;
  directional_bias_mw: number;
  total_short_volume_mwh: number;
  total_long_volume_mwh: number;
  net_imbalance_volume_mwh: number;
  estimated_cashout_exposure_gbp: number;
  wmape_pct?: number;
  mbe_mw?: number;
  pearson_correlation?: number;
  r2_score?: number;
  p10_error_mw?: number;
  p50_error_mw?: number;
  p90_error_mw?: number;
  p95_error_mw?: number;
  p90_abs_error_mw?: number;
}

export interface SettlementPeriodErrorProfile {
  settlement_period: number;
  time_slot: string;
  mean_forecast_mw: number;
  mean_actual_mw: number;
  mae_mw: number;
  rmse_mw: number;
  wmape_pct: number;
  mbe_mw: number;
  p90_abs_error_mw: number;
  uncertainty_tier: 'HIGH_VOLATILITY' | 'MODERATE' | 'STABLE';
}

export interface HorizonDecayMetric {
  horizon: string;
  lead_time_hours: number;
  mae_mw: number;
  rmse_mw: number;
  wmape_pct: number;
  mbe_mw: number;
  pearson_r: number;
  mae_reduction_pct_vs_day_ahead: number;
}

export interface ThermalGapPeriod {
  settlement_period: number;
  time_slot: string;
  demand_mw: number;
  wind_forecast_mw: number;
  wind_actual_mw?: number | null;
  thermal_expected_mw: number;
  thermal_conservative_mw: number;
  p90_buffer_mw: number;
  imbalance_exposure_mw: number;
}

export interface ThermalGapAnalysis {
  target_date: string;
  p90_buffer_mw: number;
  total_demand_mwh: number;
  total_thermal_expected_mwh: number;
  total_thermal_conservative_mwh: number;
  peak_thermal_expected_mw: number;
  peak_thermal_conservative_mw: number;
  peak_thermal_period: number;
  total_safety_margin_mwh: number;
  periods: ThermalGapPeriod[];
}


export interface ThermalProcurementItem {
  settlement_period: number;
  time_slot: string;
  wind_forecast_mw: number;
  revised_expected_mw: number;
  wind_deficit_mw: number;
  required_reserve_mw: number;
  recommended_procurement_mw: number;
  recommended_asset: AssetType;
  indicative_spark_spread_price_gbp: number;
  estimated_procurement_cost_gbp: number;
  urgency: UrgencyLevel;
}

export interface ThermalProcurementRequest {
  target_date?: string;
  reserve_margin_pct: number;
  ccgt_heat_rate_price_gbp: number;
  ocgt_peaker_price_gbp: number;
  bess_discharge_cost_gbp: number;
}

export interface ThermalProcurementResponse {
  target_date: string;
  reserve_margin_pct: number;
  total_thermal_capacity_needed_mw: number;
  total_energy_procured_mwh: number;
  total_procurement_budget_gbp: number;
  peak_procurement_mw: number;
  peak_period: number;
  asset_breakdown_mwh: Record<string, number>;
  recommendations: ThermalProcurementItem[];
}

export interface GateClosureOption {
  id: string;
  name: string;
  short_code: string;
  target_date: string;
  closure_time: string;
  is_active: boolean;
  status: GateClosureStatus;
  description: string;
}

export interface DayAheadForecastResponse {
  target_date: string;
  gate_closure_id: string;
  gate_closure_name: string;
  last_updated: string;
  data_source: string;
  periods: SettlementPeriodData[];
  metrics: QuantitativeMetrics;
  procurement_summary?: Record<string, number>;
}

// RESTful v1 Endpoints Types
export interface TimeseriesPoint {
  startTime: string;
  publishTime: string;
  forecastMW: number;
  actualMW: number | null;
  errorMW: number | null;
  settlementPeriod: number;
}

export interface MetricSummary {
  mae: number;
  rmse: number;
  mape: number;
  wmape: number;
  bias: number;
  p10: number;
  p50: number;
  p90: number;
  totalGenerationForecastMWh: number;
  totalGenerationActualMWh: number;
}

export interface SettlementPeriodError {
  periodNumber: number;
  timeLabel: string;
  avgActualMW: number;
  avgForecastMW: number;
  maeMW: number;
  biasMW: number;
}

export interface HourlyThermalScheduleItem {
  time: string;
  demand: number;
  forecastWind: number;
  recommendedThermalProcureMW: number;
  safetyReserveMW: number;
}

export interface ThermalAdvisorRequest {
  targetDate: string;
  customerDemandMW: number;
  gateClosureTime?: string;
  safetyBufferPercentile?: number;
}

export interface ThermalAdvisorResponse {
  targetDate: string;
  hourlySchedule: HourlyThermalScheduleItem[];
  riskMarginMw?: number;
  totalRecommendedThermalMWh?: number;
  confidencePercentile?: number;
}

export interface DashboardOverviewResponse {
  dateRange: string;
  metrics: MetricSummary;
  timeseries: TimeseriesPoint[];
  periodErrors: SettlementPeriodError[];
}

export interface MetaInfoResponse {
  dataSource: string;
  elexonBmrsStatus: string;
  targetPeriod: string;
  version: string;
  aiToolsDisclosure: string;
  lastUpdated: string;
}

