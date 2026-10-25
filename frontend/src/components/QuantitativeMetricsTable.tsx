import React, { useState } from 'react';
import { DollarSign, Search } from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { QuantitativeMetrics, SettlementPeriodData } from '../types';

interface QuantitativeMetricsTableProps {
  metrics: QuantitativeMetrics;
  periods: SettlementPeriodData[];
}

export const QuantitativeMetricsTable: React.FC<QuantitativeMetricsTableProps> = ({
  metrics,
  periods,
}) => {
  const [filterMode, setFilterMode] = useState<'ALL' | 'SHORT' | 'LONG'>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredPeriods = periods.filter((p) => {
    if (filterMode === 'SHORT' && p.imbalance_direction !== 'SHORT') return false;
    if (filterMode === 'LONG' && p.imbalance_direction !== 'LONG') return false;
    if (searchTerm) {
      const matchSp = p.settlement_period.toString().includes(searchTerm);
      const matchTime = p.time_slot.toLowerCase().includes(searchTerm.toLowerCase());
      return matchSp || matchTime;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* 6 Key Trader Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* MAE */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>MAE</span>
            <span className="font-mono text-[10px] text-slate-500">Mean Abs Error</span>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-cyan-300">
              {metrics.mae_mw.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 ml-1">MW</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Average forecast dev</p>
        </div>

        {/* MAPE */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>MAPE</span>
            <span className="font-mono text-[10px] text-slate-500">% Deviation</span>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-cyan-300">
              {metrics.mape_pct.toFixed(2)}%
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Accuracy benchmark</p>
        </div>

        {/* RMSE */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>RMSE</span>
            <span className="font-mono text-[10px] text-slate-500">Vol Weight</span>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-slate-200">
              {metrics.rmse_mw.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 ml-1">MW</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Large error penalizer</p>
        </div>

        {/* Peak Error */}
        <div className="bg-slate-900/90 border border-rose-950/80 rounded-xl p-3.5 flex flex-col justify-between shadow-glow-rose/20">
          <div className="flex items-center justify-between text-rose-400 text-xs font-semibold">
            <span>Peak Deviation</span>
            <span className="font-mono text-[10px] bg-rose-950 px-1 rounded text-rose-300">
              SP {metrics.peak_error_period}
            </span>
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-rose-400">
              {metrics.peak_error_mw.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400 ml-1">MW</span>
          </div>
          <p className="text-[11px] text-rose-400/80 mt-1">Max single half-hour delta</p>
        </div>

        {/* Directional Bias */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Desk Bias</span>
            <span className="font-mono text-[10px] text-slate-500">Sign Bias</span>
          </div>
          <div className="mt-2 flex items-center gap-1">
            <span
              className={`text-xl font-bold font-mono ${
                metrics.directional_bias_mw < 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {metrics.directional_bias_mw > 0
                ? `+${metrics.directional_bias_mw}`
                : metrics.directional_bias_mw}
            </span>
            <span className="text-xs text-slate-400">MW</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {metrics.directional_bias_mw < 0 ? 'Overforecast (Short)' : 'Underforecast (Long)'}
          </p>
        </div>

        {/* Imbalance Cashout Liability */}
        <div className="bg-slate-900/90 border border-amber-900/60 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-400 text-xs font-semibold">
            <span>Cashout Liability</span>
            <DollarSign className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="mt-2">
            <span className="text-xl font-bold font-mono text-amber-300">
              £{metrics.estimated_cashout_exposure_gbp.toLocaleString()}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Net: {metrics.net_imbalance_volume_mwh.toLocaleString()} MWh
          </p>
        </div>
      </div>

      {/* Granular Settlement Periods Table */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Settlement Period Breakdown & Cashout Exposure"
          subtitle="Half-hourly position monitoring for UK Day-Ahead balancing mechanism"
          badge={
            <span className="text-xs text-slate-400 font-mono">
              Showing {filteredPeriods.length} of {periods.length} Periods
            </span>
          }
          action={
            <div className="flex items-center gap-2">
              {/* Search input */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter SP or time..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-36 sm:w-44 font-mono"
                />
              </div>

              {/* Status Filter */}
              <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs">
                <button
                  onClick={() => setFilterMode('ALL')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                    filterMode === 'ALL'
                      ? 'bg-slate-700 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterMode('SHORT')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                    filterMode === 'SHORT'
                      ? 'bg-rose-950 text-rose-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Shorts Only
                </button>
                <button
                  onClick={() => setFilterMode('LONG')}
                  className={`px-2 py-0.5 rounded-md font-medium transition-all ${
                    filterMode === 'LONG'
                      ? 'bg-emerald-950 text-emerald-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Long Only
                </button>
              </div>
            </div>
          }
        />

        <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-950/80 sticky top-0 z-10 border-b border-slate-800 text-slate-400 font-medium">
              <tr>
                <th className="py-2.5 px-4 font-mono">SP</th>
                <th className="py-2.5 px-3">Time Slot (GMT/BST)</th>
                <th className="py-2.5 px-3 text-right">DA Forecast (MW)</th>
                <th className="py-2.5 px-3 text-right">Actual Outturn (MW)</th>
                <th className="py-2.5 px-3 text-right">Error Delta (MW)</th>
                <th className="py-2.5 px-3 text-right">Error (%)</th>
                <th className="py-2.5 px-3 text-center">Market State</th>
                <th className="py-2.5 px-3 text-right">System Price</th>
                <th className="py-2.5 px-4 text-right">Est. Cashout Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {filteredPeriods.map((p) => {
                const isShort = p.imbalance_direction === 'SHORT';
                const isLong = p.imbalance_direction === 'LONG';
                const errorVal = p.error_mw ?? 0;

                return (
                  <tr
                    key={p.settlement_period}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      isShort ? 'bg-rose-950/10' : ''
                    }`}
                  >
                    <td className="py-2 px-4 font-bold text-slate-200">
                      SP {p.settlement_period}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-400">{p.time_slot}</td>
                    <td className="py-2 px-3 text-right text-cyan-300 font-semibold">
                      {p.forecast_mw.toLocaleString()}
                    </td>
                    <td className="py-2 px-3 text-right text-emerald-300 font-semibold">
                      {p.actual_mw ? p.actual_mw.toLocaleString() : '--'}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-bold ${
                        errorVal < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {errorVal > 0 ? `+${errorVal}` : errorVal}
                    </td>
                    <td
                      className={`py-2 px-3 text-right ${
                        (p.error_pct ?? 0) < 0 ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {p.error_pct ? `${p.error_pct}%` : '0.0%'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Badge
                        variant={isShort ? 'rose' : isLong ? 'emerald' : 'slate'}
                        size="sm"
                      >
                        {p.imbalance_direction}
                      </Badge>
                    </td>
                    <td className="py-2 px-3 text-right text-amber-300">
                      £{p.system_price_gbp_mwh?.toFixed(2) ?? '75.00'}
                    </td>
                    <td
                      className={`py-2 px-4 text-right font-bold ${
                        (p.cashout_exposure_gbp ?? 0) > 0 ? 'text-rose-300' : 'text-slate-400'
                      }`}
                    >
                      {(p.cashout_exposure_gbp ?? 0) > 0
                        ? `£${p.cashout_exposure_gbp?.toLocaleString()}`
                        : '£0'}
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
