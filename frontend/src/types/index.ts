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
