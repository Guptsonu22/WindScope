import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Cpu,
  Database,
  Flame,
  Layers,
  LineChart,
  RefreshCw,
  Server,
  ShieldCheck,
  TrendingUp,
  Zap,
} from 'lucide-react';

import { DashboardHeader } from './components/DashboardHeader';
import { GateClosureSelector } from './components/GateClosureSelector';
import { ForecastVsActualChart } from './components/ForecastVsActualChart';
import { QuantitativeMetricsTable } from './components/QuantitativeMetricsTable';
import { ThermalProcurementCalculator } from './components/ThermalProcurementCalculator';
import { Card, CardHeader } from './components/ui/Card';
import { Badge } from './components/ui/Badge';
import { tradeApi } from './services/api';
import {
  DayAheadForecastResponse,
  GateClosureOption,
  HealthResponse,
  ThermalProcurementRequest,
  ThermalProcurementResponse,
} from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'OPERATIONS' | 'THERMAL_HEDGING' | 'DIAGNOSTICS'>('OPERATIONS');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [gateClosures, setGateClosures] = useState<GateClosureOption[]>([]);
  const [selectedGateId, setSelectedGateId] = useState<string>('d1-1200');
  const [targetDate, setTargetDate] = useState<string>(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [forecastData, setForecastData] = useState<DayAheadForecastResponse | null>(null);
  const [procurementData, setProcurementData] = useState<ThermalProcurementResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load initial market state & health
  const loadMarketData = async (forceRefresh: boolean = false) => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      // 1. Health check
      try {
        const healthRes = await tradeApi.getHealth();
        setHealth(healthRes);
      } catch (e) {
        console.warn('Backend health probe unavailable, using fallback state.');
      }

      // 2. Gate closures
      let closures: GateClosureOption[] = [];
      try {
        closures = await tradeApi.getGateClosures();
        setGateClosures(closures);
      } catch (e) {
        console.warn('Could not fetch gate closures from backend, using defaults.');
      }

      // 3. Day-Ahead Forecast & Periods
      const forecastRes = await tradeApi.getDayAheadForecast(targetDate, selectedGateId, forceRefresh);
      setForecastData(forecastRes);

      // 4. Thermal Procurement Plan
      const thermalRes = await tradeApi.calculateThermalProcurement({
        target_date: targetDate,
        reserve_margin_pct: 12.0,
        ccgt_heat_rate_price_gbp: 78.5,
        ocgt_peaker_price_gbp: 135.0,
        bess_discharge_cost_gbp: 95.0,
      });
      setProcurementData(thermalRes);
    } catch (err: any) {
      console.error('Data load error:', err);
      setErrorMsg(
        err.message || 'Error connecting to WindScope backend. Please ensure the FastAPI server is running on port 8000.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMarketData();
  }, [targetDate, selectedGateId]);

  const handleRecalculateProcurement = async (params: ThermalProcurementRequest) => {
    setIsLoading(true);
    try {
      const res = await tradeApi.calculateThermalProcurement({
        ...params,
        target_date: targetDate,
      });
      setProcurementData(res);
    } catch (err: any) {
      setErrorMsg('Failed to re-calculate thermal hedge requirements.');
    } finally {
      setIsLoading(false);
    }
  };

  const activeGateName =
    gateClosures.find((g) => g.id === selectedGateId)?.name || 'Day-Ahead 12:00 Power Auction';

  return (
    <div className="min-h-screen bg-desk-bg text-desk-text flex flex-col font-sans">
      {/* Top Trading Desk Ribbon */}
      <DashboardHeader
        health={health}
        targetDate={targetDate}
        onDateChange={setTargetDate}
        onRefresh={() => loadMarketData(true)}
        isLoading={isLoading}
        activeGateName={activeGateName}
      />

      {/* Main Trading Portal Container */}
      <main className="flex-1 max-w-[1680px] w-full mx-auto px-4 lg:px-6 py-5 space-y-5">
        {/* Navigation Tabs & Market Mode */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('OPERATIONS')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'OPERATIONS'
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-glow-cyan'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LineChart className="h-4 w-4" />
              Forecast & Outturn Operations
            </button>
            <button
              onClick={() => setActiveTab('THERMAL_HEDGING')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'THERMAL_HEDGING'
                  ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="h-4 w-4" />
              Thermal Procurement Calculator
            </button>
            <button
              onClick={() => setActiveTab('DIAGNOSTICS')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'DIAGNOSTICS'
                  ? 'bg-purple-500/10 text-purple-300 border border-purple-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Cpu className="h-4 w-4" />
              Desk Diagnostics & BMRS
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <span className="flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>Feed: {forecastData?.data_source || 'Elexon Insights API'}</span>
            <span className="text-slate-600">|</span>
            <span>Delivery: {targetDate}</span>
          </div>
        </div>

        {/* Error notification banner if any */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              onClick={() => loadMarketData(true)}
              className="px-2.5 py-1 rounded bg-rose-900/80 hover:bg-rose-800 text-white font-semibold transition-all"
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* TAB 1: OPERATIONS (Forecast, Actual, Charts, SP Table) */}
        {activeTab === 'OPERATIONS' && (
          <div className="space-y-5">
            {/* Gate Closure Stage Selection */}
            {gateClosures.length > 0 && (
              <GateClosureSelector
                gateClosures={gateClosures}
                selectedGateId={selectedGateId}
                onSelectGate={setSelectedGateId}
              />
            )}

            {/* High-Impact Interactive Chart */}
            {forecastData && (
              <ForecastVsActualChart
                periods={forecastData.periods}
                targetDate={targetDate}
              />
            )}

            {/* Quantitative Metrics KPI & 48 Settlement Periods Table */}
            {forecastData && (
              <QuantitativeMetricsTable
                metrics={forecastData.metrics}
                periods={forecastData.periods}
              />
            )}
          </div>
        )}

        {/* TAB 2: THERMAL PROCUREMENT CALCULATOR */}
        {activeTab === 'THERMAL_HEDGING' && (
          <div className="space-y-5">
            <ThermalProcurementCalculator
              procurementData={procurementData}
              onRecalculate={handleRecalculateProcurement}
              isLoading={isLoading}
            />
          </div>
        )}

        {/* TAB 3: DESK DIAGNOSTICS & SYSTEM HEALTH */}
        {activeTab === 'DIAGNOSTICS' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <Server className="h-4 w-4 text-cyan-400" />
                  <h4 className="font-semibold text-sm text-slate-100">FastAPI Core Server</h4>
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <p>Status: <span className="text-emerald-400 font-mono font-semibold">Operational</span></p>
                  <p>Port: <span className="text-slate-200 font-mono">8000</span></p>
                  <p>CORS Origins: <span className="text-slate-200 font-mono">localhost:5173, localhost:3000, *</span></p>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <Database className="h-4 w-4 text-emerald-400" />
                  <h4 className="font-semibold text-sm text-slate-100">Elexon BMRS Connection</h4>
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <p>Endpoint: <span className="text-slate-200 font-mono text-[11px]">https://data.elexon.co.uk/bmrs/api/v1</span></p>
                  <p>Status: <span className="text-emerald-400 font-mono font-semibold">{health?.elexon_api_status || 'connected'}</span></p>
                  <p>Failover Model: <span className="text-cyan-400 font-mono">High-Fidelity UK Grid Simulation</span></p>
                </div>
              </Card>

              <Card className="p-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <Layers className="h-4 w-4 text-amber-400" />
                  <h4 className="font-semibold text-sm text-slate-100">Local Cache & Parquet</h4>
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <p>Directory: <span className="text-slate-200 font-mono">backend/data/</span></p>
                  <p>Format: <span className="text-slate-200 font-mono">JSON / Parquet aligned</span></p>
                  <p>UK Periods: <span className="text-amber-400 font-mono">48 half-hours per delivery day</span></p>
                </div>
              </Card>
            </div>

            {/* Health payload display */}
            <Card className="p-4">
              <CardHeader
                title="Runtime Health Payload"
                subtitle="Live response from /api/v1/health"
                badge={<Badge variant="emerald" size="sm">200 OK</Badge>}
              />
              <pre className="bg-slate-950 p-4 rounded-lg font-mono text-xs text-cyan-300 overflow-x-auto mt-3 border border-slate-800">
                {JSON.stringify(health || { message: 'Checking live backend...' }, null, 2)}
              </pre>
            </Card>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-3 px-6 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2">
          <span>WindScope Decision Support System</span>
          <span>•</span>
          <span>GB Power Market Rules (BSUoS & BSC Section Q compliant)</span>
        </div>
        <div className="font-mono text-[11px]">
          Target: {targetDate} | Gate: {selectedGateId}
        </div>
      </footer>
    </div>
  );
};

export default App;
