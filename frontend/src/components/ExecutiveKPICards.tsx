import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CheckCircle,
  HelpCircle,
  Percent,
  ShieldAlert,
  Zap,
} from 'lucide-react';
import { MetricSummary, QuantitativeMetrics } from '../types';

interface ExecutiveKPICardsProps {
  metrics: MetricSummary | QuantitativeMetrics | null;
  nominalCapacityMW?: number;
  isLoading?: boolean;
}

export const ExecutiveKPICards: React.FC<ExecutiveKPICardsProps> = ({
  metrics,
  nominalCapacityMW = 14200,
  isLoading = false,
}) => {
  if (isLoading || !metrics) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="h-28 rounded-xl bg-slate-900/60 border border-slate-800/80 animate-pulse p-4 flex flex-col justify-between"
          >
            <div className="h-3 w-20 bg-slate-800 rounded" />
            <div className="h-7 w-28 bg-slate-700/60 rounded" />
            <div className="h-2.5 w-36 bg-slate-800/80 rounded" />
          </div>
        ))}
      </div>
    );
  }

  // Normalize metric keys whether from MetricSummary or QuantitativeMetrics
  const mae = 'mae' in metrics ? metrics.mae : metrics.mae_mw;
  const rmse = 'rmse' in metrics ? metrics.rmse : metrics.rmse_mw;
  const wmape =
    'wmape' in metrics
      ? metrics.wmape
      : metrics.wmape_pct ?? metrics.mape_pct;
  const bias =
    'bias' in metrics
      ? metrics.bias
      : metrics.mbe_mw ?? metrics.directional_bias_mw;
  const p90 =
    'p90' in metrics
      ? metrics.p90
      : metrics.p90_abs_error_mw ?? metrics.p90_error_mw ?? Math.round(mae * 1.65);

  const maePctOfNominal = ((mae / nominalCapacityMW) * 100).toFixed(1);
  const rmseMaeRatio = mae > 0 ? (rmse / mae).toFixed(2) : '1.00';
  const isOverforecast = bias > 0;
  const isUnderforecast = bias < 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
      {/* 1. MAE (Mean Absolute Error) */}
      <div className="trading-card p-4 relative overflow-hidden group hover:border-cyan-500/50">
        <div className="absolute top-0 right-0 left-0 h-1 bg-cyan-500" />
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-cyan-400" />
            MAE (Mean Absolute Error)
          </span>
          <span className="font-mono text-[10px] text-slate-500 px-1 rounded bg-slate-800">
            L1 Norm
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-black font-mono tracking-tight text-cyan-300">
            {Math.round(mae).toLocaleString()}
          </span>
          <span className="text-xs font-mono font-medium text-slate-400">MW</span>
        </div>
        <p className="text-[11px] text-cyan-400/90 font-medium mt-1.5 flex items-center gap-1">
          <span>{maePctOfNominal}% of nominal capacity</span>
          <span className="text-slate-500 font-mono">({nominalCapacityMW.toLocaleString()} MW)</span>
        </p>
      </div>

      {/* 2. RMSE (Root Mean Squared Error) */}
      <div className="trading-card p-4 relative overflow-hidden group hover:border-sky-500/50">
        <div className="absolute top-0 right-0 left-0 h-1 bg-sky-500" />
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-sky-400" />
            RMSE (Volatility Penalty)
          </span>
          <span className="font-mono text-[10px] text-slate-500 px-1 rounded bg-slate-800">
            L2 Quad
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-black font-mono tracking-tight text-slate-100">
            {Math.round(rmse).toLocaleString()}
          </span>
          <span className="text-xs font-mono font-medium text-slate-400">MW</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
          <span className="text-sky-300 font-mono font-semibold">{rmseMaeRatio}x</span>
          <span>MAE ratio (highlighting tail risk / swings)</span>
        </p>
      </div>

      {/* 3. Forecast Bias (MBE) */}
      <div
        className={`trading-card p-4 relative overflow-hidden group ${
          isOverforecast ? 'hover:border-rose-500/50' : 'hover:border-emerald-500/50'
        }`}
      >
        <div
          className={`absolute top-0 right-0 left-0 h-1 ${
            isOverforecast ? 'bg-rose-500' : isUnderforecast ? 'bg-emerald-500' : 'bg-slate-500'
          }`}
        />
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <BarChart2 className="h-3.5 w-3.5 text-amber-400" />
            Forecast Bias (MBE)
          </span>
          <span
            className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
              isOverforecast
                ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
            }`}
          >
            {isOverforecast ? (
              <>
                <ArrowUpRight className="h-3 w-3" /> Over-forecast
              </>
            ) : (
              <>
                <ArrowDownRight className="h-3 w-3" /> Under-forecast
              </>
            )}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span
            className={`text-2xl font-black font-mono tracking-tight ${
              isOverforecast ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {bias > 0 ? `+${Math.round(bias).toLocaleString()}` : Math.round(bias).toLocaleString()}
          </span>
          <span className="text-xs font-mono font-medium text-slate-400">MW</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5 leading-tight">
          {isOverforecast
            ? 'Over-forecasting tendency (buys too little thermal)'
            : 'Under-forecasting tendency (conservative hedge)'}
        </p>
      </div>

      {/* 4. wMAPE (Weighted Mean Absolute Percentage Error) */}
      <div className="trading-card p-4 relative overflow-hidden group hover:border-amber-500/50">
        <div className="absolute top-0 right-0 left-0 h-1 bg-amber-500" />
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Percent className="h-3.5 w-3.5 text-amber-400" />
            wMAPE (Weighted MAPE)
          </span>
          <span className="font-mono text-[10px] text-amber-300 px-1 rounded bg-amber-950/80 border border-amber-800/60">
            Energy Std
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-black font-mono tracking-tight text-amber-300">
            {wmape.toFixed(1)}%
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5">
          Volume-weighted error; avoids low-wind zero division
        </p>
      </div>

      {/* 5. P90 Conservative Downside Risk Buffer */}
      <div className="trading-card p-4 relative overflow-hidden group hover:border-purple-500/50">
        <div className="absolute top-0 right-0 left-0 h-1 bg-purple-500" />
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span className="font-semibold text-slate-200 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-purple-400" />
            P90 Downside Risk Buffer
          </span>
          <span className="font-mono text-[10px] text-purple-300 px-1 rounded bg-purple-950/80 border border-purple-800/60">
            90% Conf
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-2xl font-black font-mono tracking-tight text-purple-300">
            {Math.round(p90).toLocaleString()}
          </span>
          <span className="text-xs font-mono font-medium text-slate-400">MW</span>
        </div>
        <p className="text-[11px] text-purple-300/90 font-medium mt-1.5">
          Reserve required for 90% confidence against drop-offs
        </p>
      </div>
    </div>
  );
};
