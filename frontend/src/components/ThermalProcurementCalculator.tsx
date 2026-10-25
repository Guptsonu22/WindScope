import React, { useEffect, useState } from 'react';
import {
  Flame,
  Percent,
  Play,
  Shield,
  Sliders,
} from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import {
  ThermalGapAnalysis,
  ThermalProcurementRequest,
  ThermalProcurementResponse,
} from '../types';
import { tradeApi } from '../services/api';

interface ThermalProcurementCalculatorProps {
  procurementData: ThermalProcurementResponse | null;
  onRecalculate: (params: ThermalProcurementRequest) => void;
  isLoading: boolean;
  targetDate?: string;
}

export const ThermalProcurementCalculator: React.FC<ThermalProcurementCalculatorProps> = ({
  procurementData,
  onRecalculate,
  isLoading,
  targetDate = '2026-01-15',
}) => {
  const [activeMode, setActiveMode] = useState<'DISPATCH_OPTIMIZER' | 'THERMAL_GAP'>('DISPATCH_OPTIMIZER');
  const [reserveMargin, setReserveMargin] = useState<number>(12.0);
  const [ccgtPrice, setCcgtPrice] = useState<number>(78.5);
  const [ocgtPrice, setOcgtPrice] = useState<number>(135.0);
  const [bessPrice, setBessPrice] = useState<number>(95.0);
  const [stagedOrders, setStagedOrders] = useState<number[]>([]);

  // Thermal Gap State
  const [p90Buffer, setP90Buffer] = useState<number>(1450.0);
  const [gapData, setGapData] = useState<ThermalGapAnalysis | null>(null);
  const [loadingGap, setLoadingGap] = useState<boolean>(false);

  const fetchThermalGap = async (bufferVal: number) => {
    setLoadingGap(true);
    try {
      const res = await tradeApi.getThermalGap(targetDate, bufferVal);
      setGapData(res);
    } catch (err) {
      console.error('Error fetching thermal gap analysis:', err);
    } finally {
      setLoadingGap(false);
    }
  };

  useEffect(() => {
    if (activeMode === 'THERMAL_GAP') {
      fetchThermalGap(p90Buffer);
    }
  }, [activeMode, targetDate]);

  const handleRunCalculation = () => {
    onRecalculate({
      reserve_margin_pct: reserveMargin,
      ccgt_heat_rate_price_gbp: ccgtPrice,
      ocgt_peaker_price_gbp: ocgtPrice,
      bess_discharge_cost_gbp: bessPrice,
    });
  };

  const handleStageOrder = (sp: number) => {
    if (stagedOrders.includes(sp)) {
      setStagedOrders(stagedOrders.filter((s) => s !== sp));
    } else {
      setStagedOrders([...stagedOrders, sp]);
    }
  };

  const criticalShortfalls =
    procurementData?.recommendations.filter((r) => r.recommended_procurement_mw > 0) || [];

  return (
    <div className="space-y-4">
      {/* Mode Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveMode('DISPATCH_OPTIMIZER')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeMode === 'DISPATCH_OPTIMIZER'
              ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30 shadow-glow-amber'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="h-4 w-4" />
          Thermal & Flexible Asset Dispatch Optimizer
        </button>

        <button
          onClick={() => setActiveMode('THERMAL_GAP')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
            activeMode === 'THERMAL_GAP'
              ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-glow-cyan'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="h-4 w-4" />
          Utility Thermal Gap & P90 Conservative Safety Buffer
        </button>
      </div>

      {/* MODE 1: DISPATCH OPTIMIZER */}
      {activeMode === 'DISPATCH_OPTIMIZER' && (
        <div className="space-y-4">
          {/* Control Panel & Hedging Parameters */}
          <Card className="p-4 bg-slate-900/90 border border-slate-800">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                    Thermal & Flexible Reserve Procurement Calculator
                    <Badge variant="amber" size="sm">
                      Trader Dispatch Tool
                    </Badge>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Simulate CCGT baseload, OCGT peaker, and BESS capacity calls to hedge wind forecast shortfalls.
                  </p>
                </div>
              </div>

              <button
                onClick={handleRunCalculation}
                disabled={isLoading}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-slate-950 font-bold text-xs shadow-lg transition-all disabled:opacity-50"
              >
                <Play className={`h-3.5 w-3.5 fill-current ${isLoading ? 'animate-spin' : ''}`} />
                Run Optimization Engine
              </button>
            </div>

            {/* Parameter Sliders & Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-slate-300 font-medium flex items-center gap-1">
                    <Percent className="h-3.5 w-3.5 text-cyan-400" />
                    Reserve Safety Buffer
                  </span>
                  <span className="font-mono font-bold text-cyan-300">{reserveMargin}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={reserveMargin}
                  onChange={(e) => setReserveMargin(parseFloat(e.target.value))}
                  className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                  <span>0% (Tight)</span>
                  <span>15% (Nominal)</span>
                  <span>30% (High)</span>
                </div>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-slate-300 font-medium">CCGT Baseload Cost</span>
                  <span className="font-mono font-bold text-amber-300">£{ccgtPrice}/MWh</span>
                </div>
                <input
                  type="number"
                  step="0.5"
                  value={ccgtPrice}
                  onChange={(e) => setCcgtPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-amber-400"
                />
                <p className="text-[10px] text-slate-500 mt-1">Combined cycle gas turbine</p>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-slate-300 font-medium">OCGT Peaker Cost</span>
                  <span className="font-mono font-bold text-orange-400">£{ocgtPrice}/MWh</span>
                </div>
                <input
                  type="number"
                  step="1.0"
                  value={ocgtPrice}
                  onChange={(e) => setOcgtPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-orange-400"
                />
                <p className="text-[10px] text-slate-500 mt-1">Fast-start open cycle peaker</p>
              </div>

              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <div className="flex justify-between items-center text-xs mb-1.5">
                  <span className="text-slate-300 font-medium">BESS Discharge Cost</span>
                  <span className="font-mono font-bold text-purple-300">£{bessPrice}/MWh</span>
                </div>
                <input
                  type="number"
                  step="1.0"
                  value={bessPrice}
                  onChange={(e) => setBessPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-purple-400"
                />
                <p className="text-[10px] text-slate-500 mt-1">Battery storage degradation</p>
              </div>
            </div>
          </Card>

          {/* KPI Cards */}
          {procurementData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/90 border border-amber-900/50 rounded-xl p-3.5">
                <span className="text-xs text-slate-400">Total Thermal Capacity Needed</span>
                <div className="mt-1.5">
                  <span className="text-2xl font-bold font-mono text-amber-300">
                    {procurementData.total_thermal_capacity_needed_mw.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">MW</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Cumulative peak requirements</p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                <span className="text-xs text-slate-400">Total Energy Volume to Buy</span>
                <div className="mt-1.5">
                  <span className="text-2xl font-bold font-mono text-slate-100">
                    {procurementData.total_energy_procured_mwh.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">MWh</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Hedge energy requirement</p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                <span className="text-xs text-slate-400">Procurement Budget Impact</span>
                <div className="mt-1.5">
                  <span className="text-2xl font-bold font-mono text-emerald-400">
                    £{procurementData.total_procurement_budget_gbp.toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Avoids high cashout penalty</p>
              </div>

              <div className="bg-slate-900/90 border border-rose-950/80 rounded-xl p-3.5">
                <span className="text-xs text-rose-400 font-semibold">Peak Capacity Call</span>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-rose-400">
                    {procurementData.peak_procurement_mw.toLocaleString()} MW
                  </span>
                  <span className="text-xs font-mono text-rose-300 bg-rose-950 px-1.5 py-0.5 rounded">
                    SP {procurementData.peak_period}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Highest dispatch requirement</p>
              </div>
            </div>
          )}

          {/* Actionable Dispatch Orders Table */}
          <Card className="overflow-hidden">
            <CardHeader
              title="Optimal Dispatch Recommendations by Settlement Period"
              subtitle="Specific thermal replacement schedules generated for power trading execution"
              badge={
                <Badge variant="amber" size="sm">
                  {criticalShortfalls.length} Critical Half-Hours
                </Badge>
              }
            />

            <div className="overflow-x-auto max-h-[360px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-slate-800 text-slate-400 font-medium">
                  <tr>
                    <th className="py-2.5 px-4 font-mono">SP</th>
                    <th className="py-2.5 px-3">Time Window</th>
                    <th className="py-2.5 px-3 text-right">Wind Deficit (MW)</th>
                    <th className="py-2.5 px-3 text-right">+Reserve (MW)</th>
                    <th className="py-2.5 px-3 text-right">Procure MW</th>
                    <th className="py-2.5 px-3">Recommended Asset</th>
                    <th className="py-2.5 px-3 text-right">Indicative £/MWh</th>
                    <th className="py-2.5 px-3 text-right">Est. Cost (£)</th>
                    <th className="py-2.5 px-3 text-center">Urgency</th>
                    <th className="py-2.5 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {criticalShortfalls.map((item) => {
                    const isStaged = stagedOrders.includes(item.settlement_period);
                    const urgencyVariants: Record<string, 'rose' | 'amber' | 'cyan' | 'slate'> = {
                      CRITICAL: 'rose',
                      HIGH: 'amber',
                      MODERATE: 'cyan',
                      LOW: 'slate',
                    };

                    return (
                      <tr
                        key={item.settlement_period}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          item.urgency === 'CRITICAL' ? 'bg-rose-950/20' : ''
                        }`}
                      >
                        <td className="py-2 px-4 font-bold text-slate-100">
                          SP {item.settlement_period}
                        </td>
                        <td className="py-2 px-3 font-sans text-slate-400">{item.time_slot}</td>
                        <td className="py-2 px-3 text-right text-rose-400 font-semibold">
                          {item.wind_deficit_mw.toLocaleString()} MW
                        </td>
                        <td className="py-2 px-3 text-right text-slate-400">
                          +{item.required_reserve_mw}
                        </td>
                        <td className="py-2 px-3 text-right font-bold text-amber-300">
                          {item.recommended_procurement_mw.toLocaleString()} MW
                        </td>
                        <td className="py-2 px-3 font-sans">
                          <span className="font-semibold text-slate-200">{item.recommended_asset}</span>
                        </td>
                        <td className="py-2 px-3 text-right text-slate-300">
                          £{item.indicative_spark_spread_price_gbp.toFixed(2)}
                        </td>
                        <td className="py-2 px-3 text-right text-emerald-400 font-bold">
                          £{item.estimated_procurement_cost_gbp.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <Badge variant={urgencyVariants[item.urgency] || 'slate'} size="sm">
                            {item.urgency}
                          </Badge>
                        </td>
                        <td className="py-2 px-4 text-center">
                          <button
                            onClick={() => handleStageOrder(item.settlement_period)}
                            className={`px-2.5 py-1 rounded text-[11px] font-sans font-semibold transition-all ${
                              isStaged
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {isStaged ? 'Staged' : 'Stage Order'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* MODE 2: UTILITY THERMAL GAP & P90 CONSERVATIVE SAFETY BUFFER */}
      {activeMode === 'THERMAL_GAP' && (
        <div className="space-y-4">
          {/* Header & P90 Slider Bar */}
          <Card className="p-4 bg-slate-900/90 border border-slate-800">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                    Utility Thermal Gap & P90 Safety Procurement
                    <Badge variant="cyan" size="sm">
                      Utility Risk Model
                    </Badge>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Given Customer Demand(t), computes Thermal_expected = max(0, Demand - Wind) vs Conservative Safety Procure = max(0, Demand - (Wind - P90_Buffer)).
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => fetchThermalGap(p90Buffer)}
                  disabled={loadingGap}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs transition-all disabled:opacity-50"
                >
                  <Play className={`h-3.5 w-3.5 fill-current ${loadingGap ? 'animate-spin' : ''}`} />
                  Recalculate Gap
                </button>
              </div>
            </div>

            {/* P90 Buffer Slider */}
            <div className="pt-4 max-w-xl">
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="text-slate-300 font-medium flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                  Conservative P90 Wind Error Buffer (MW)
                </span>
                <span className="font-mono font-bold text-cyan-300">{p90Buffer.toLocaleString()} MW</span>
              </div>
              <input
                type="range"
                min="0"
                max="3000"
                step="50"
                value={p90Buffer}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setP90Buffer(val);
                }}
                onMouseUp={() => fetchThermalGap(p90Buffer)}
                onTouchEnd={() => fetchThermalGap(p90Buffer)}
                className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 mt-1 font-mono">
                <span>0 MW (Risky - Zero Buffer)</span>
                <span>1,450 MW (Standard UK Winter P90)</span>
                <span>3,000 MW (Extreme Stress)</span>
              </div>
            </div>
          </Card>

          {/* Gap KPI Results */}
          {gapData && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                <span className="text-xs text-slate-400">Total Customer Demand</span>
                <div className="mt-1.5">
                  <span className="text-2xl font-bold font-mono text-slate-100">
                    {gapData.total_demand_mwh.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">MWh</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Full delivery day volume</p>
              </div>

              <div className="bg-slate-900/90 border border-cyan-900/50 rounded-xl p-3.5">
                <span className="text-xs text-cyan-400 font-medium">Expected Thermal Needed</span>
                <div className="mt-1.5">
                  <span className="text-2xl font-bold font-mono text-cyan-300">
                    {gapData.total_thermal_expected_mwh.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">MWh</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Based on point wind forecast</p>
              </div>

              <div className="bg-slate-900/90 border border-amber-900/50 rounded-xl p-3.5">
                <span className="text-xs text-amber-400 font-medium">Conservative P90 Safety Procure</span>
                <div className="mt-1.5">
                  <span className="text-2xl font-bold font-mono text-amber-300">
                    {gapData.total_thermal_conservative_mwh.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">MWh</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Insulates against 90% shortfall</p>
              </div>

              <div className="bg-slate-900/90 border border-purple-900/50 rounded-xl p-3.5">
                <span className="text-xs text-purple-300 font-medium">Imbalance Safety Margin</span>
                <div className="mt-1.5">
                  <span className="text-2xl font-bold font-mono text-purple-300">
                    +{gapData.total_safety_margin_mwh.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">MWh</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Peak: {gapData.peak_thermal_conservative_mw} MW (SP {gapData.peak_thermal_period})
                </p>
              </div>
            </div>
          )}

          {/* Granular Thermal Gap Table */}
          {gapData && (
            <Card className="overflow-hidden">
              <CardHeader
                title="Half-Hourly Thermal Gap & Safety Buffer Breakdown"
                subtitle="Calculates required thermal generation to cover customer demand when wind fluctuates"
                badge={
                  <span className="text-xs text-cyan-300 font-mono">
                    Buffer: {gapData.p90_buffer_mw} MW
                  </span>
                }
              />

              <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-slate-800 text-slate-400 font-medium">
                    <tr>
                      <th className="py-2.5 px-4 font-mono">SP</th>
                      <th className="py-2.5 px-3">Time Window</th>
                      <th className="py-2.5 px-3 text-right">Customer Demand (MW)</th>
                      <th className="py-2.5 px-3 text-right">Wind Forecast (MW)</th>
                      <th className="py-2.5 px-3 text-right text-cyan-300">Thermal Expected (MW)</th>
                      <th className="py-2.5 px-3 text-right text-amber-300">Thermal P90 Conservative (MW)</th>
                      <th className="py-2.5 px-4 text-right text-purple-300">Imbalance Exposure Risk (MW)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {gapData.periods.map((p) => {
                      const isHighExposure = p.imbalance_exposure_mw >= 1000.0;

                      return (
                        <tr
                          key={p.settlement_period}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isHighExposure ? 'bg-amber-950/10' : ''
                          }`}
                        >
                          <td className="py-2 px-4 font-bold text-slate-200">
                            SP {p.settlement_period}
                          </td>
                          <td className="py-2 px-3 font-sans text-slate-400">{p.time_slot}</td>
                          <td className="py-2 px-3 text-right font-bold text-slate-100">
                            {p.demand_mw.toLocaleString()} MW
                          </td>
                          <td className="py-2 px-3 text-right text-cyan-400 font-semibold">
                            {p.wind_forecast_mw.toLocaleString()} MW
                          </td>
                          <td className="py-2 px-3 text-right text-cyan-300 font-bold">
                            {p.thermal_expected_mw.toLocaleString()} MW
                          </td>
                          <td className="py-2 px-3 text-right text-amber-300 font-bold">
                            {p.thermal_conservative_mw.toLocaleString()} MW
                          </td>
                          <td className="py-2 px-4 text-right text-purple-300 font-bold">
                            +{p.imbalance_exposure_mw.toLocaleString()} MW
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
