import axios from 'axios';
import {
  DayAheadForecastResponse,
  GateClosureOption,
  HealthResponse,
  QuantitativeMetrics,
  ThermalProcurementRequest,
  ThermalProcurementResponse,
} from '../types';

// API client with baseURL fallback and timeout
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const tradeApi = {
  /**
   * Health status probe
   */
  async getHealth(): Promise<HealthResponse> {
    const response = await api.get<HealthResponse>('/health');
    return response.data;
  },

  /**
   * Fetch Day-Ahead forecast and settlement period data
   */
  async getDayAheadForecast(
    targetDate?: string,
    gateClosureId: string = 'd1-1200',
    forceRefresh: boolean = false
  ): Promise<DayAheadForecastResponse> {
    const params: Record<string, string | boolean> = {
      gate_closure_id: gateClosureId,
      force_refresh: forceRefresh,
    };
    if (targetDate) {
      params.target_date = targetDate;
    }

    const response = await api.get<DayAheadForecastResponse>('/api/v1/forecast/day-ahead', {
      params,
    });
    return response.data;
  },

  /**
   * Fetch quantitative accuracy and error metrics
   */
  async getMetrics(targetDate?: string): Promise<QuantitativeMetrics> {
    const params = targetDate ? { target_date: targetDate } : {};
    const response = await api.get<QuantitativeMetrics>('/api/v1/metrics/summary', { params });
    return response.data;
  },

  /**
   * Fetch list of auction gate closures
   */
  async getGateClosures(): Promise<GateClosureOption[]> {
    const response = await api.get<GateClosureOption[]>('/api/v1/gate-closures');
    return response.data;
  },

  /**
   * Calculate thermal replacement generation hedge requirements
   */
  async calculateThermalProcurement(
    request: ThermalProcurementRequest
  ): Promise<ThermalProcurementResponse> {
    const response = await api.post<ThermalProcurementResponse>(
      '/api/v1/trading/thermal-procurement',
      request
    );
    return response.data;
  },
};

export default tradeApi;
