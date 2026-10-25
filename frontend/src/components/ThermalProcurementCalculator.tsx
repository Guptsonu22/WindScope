import React, { useState } from 'react';
import {
  AlertTriangle,
  BatteryCharging,
  Calculator,
  CheckCircle2,
  DollarSign,
  Flame,
  Gauge,
  HelpCircle,
  Percent,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { ThermalProcurementRequest, ThermalProcurementResponse } from '../types';

interface ThermalProcurementCalculatorProps {
  procurementData: ThermalProcurementResponse | null;
  onRecalculate: (params: ThermalProcurementRequest) => void;
  isLoading: boolean;
}

export const ThermalProcurementCalculator: React.FC<ThermalProcurementCalculatorProps> = ({
  procurementData,
  onRecalculate,
  isLoading,
}) => {
  const [reserveMargin, setReserveMargin] = useState<number>(12.0);
  const [ccgtPrice, setCcgtPrice] = useState<number>(78.5);
  const [ocgtPrice, setOcgtPrice] = useState<number>(135.0);
  const [bessPrice, setBessPrice] = useState<number>(95.0);
  const [stagedOrders, setStagedOrders] = useState<number[]>([]);

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
          {/* Reserve Margin Slider */}
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

          {/* CCGT Spark Spread Cost */}
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
            <p className="text-[10px] text-slate-500 mt-1">High-efficiency combined cycle gas</p>
          </div>

          {/* OCGT Peaker Cost */}
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
            <p className="text-[10px] text-slate-500 mt-1">Fast-start open cycle peaker plant</p>
          </div>

          {/* BESS Fast Reserve Cost */}
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
            <p className="text-[10px] text-slate-500 mt-1">Battery storage degradation tariff</p>
          </div>
        </div>
      </Card>

      {/* Summary KPI Result Cards */}
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

      {/* Asset Allocation Breakdown */}
      {procurementData && (
        <Card className="p-4 bg-slate-900/80 border border-slate-800">
          <h4 className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
            <span>Recommended Asset Fuel Mix Allocation (MWh)</span>
            <span className="text-slate-400 font-mono text-[11px]">
              {procurementData.total_energy_procured_mwh} MWh Total
            </span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {Object.entries(procurementData.asset_breakdown_mwh).map(([asset, mwh]) => {
              const total = procurementData.total_energy_procured_mwh || 1;
              const pct = Math.round((mwh / total) * 100);

              const colors: Record<string, string> = {
                'CCGT Base': 'text-amber-400 bg-amber-500',
                'OCGT Peaker': 'text-orange-400 bg-orange-500',
                'BESS Fast Reserve': 'text-purple-400 bg-purple-500',
                'Demand Side Balancing': 'text-cyan-400 bg-cyan-500',
              };

              return (
                <div key={asset} className="bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                  <div className="flex justify-between items-center text-xs mb-1.5">
                    <span className="font-medium text-slate-200">{asset}</span>
                    <span className="font-mono font-bold text-slate-100">{mwh} MWh ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${colors[asset]?.split(' ')[1] || 'bg-cyan-500'}`}
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
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
  );
};
