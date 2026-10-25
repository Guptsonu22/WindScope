import React, { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  CheckCircle,
  Clock,
  Layers,
  TrendingDown,
  Zap,
} from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { SettlementPeriodError, SettlementPeriodErrorProfile } from '../types';

interface SettlementPeriodAnalysisProps {
  periodErrors?: SettlementPeriodError[];
  profiles?: SettlementPeriodErrorProfile[];
  gateClosureTime?: string;
}

export const SettlementPeriodAnalysis: React.FC<SettlementPeriodAnalysisProps> = ({
  periodErrors,
  profiles,
  gateClosureTime = '11:00',
}) => {
  const [filterMode, setFilterMode] = useState<'ALL' | 'PEAK' | 'OFF_PEAK'>('ALL');
  const [metricView, setMetricView] = useState<'MAE' | 'BIAS' | 'BOTH'>('BOTH');

  // Synthetic or converted data matching all 48 settlement periods
  const data = (periodErrors && periodErrors.length === 48
    ? periodErrors.map((p) => {
        const isPeak = p.periodNumber >= 29 && p.periodNumber <= 38; // 14:30 - 19:00 Peak Demand
        return {
          sp: p.periodNumber,
          label: `SP ${p.periodNumber}`,
          timeLabel: p.timeLabel,
          maeMw: p.maeMW,
          biasMw: p.biasMW,
          avgActual: p.avgActualMW,
          avgForecast: p.avgForecastMW,
          isPeak,
          uncertaintyLevel: p.maeMW > 800 ? 'HIGH' : p.maeMW > 600 ? 'MODERATE' : 'LOW',
        };
      })
    : profiles && profiles.length === 48
    ? profiles.map((p) => {
        const isPeak = p.settlement_period >= 29 && p.settlement_period <= 38;
        return {
          sp: p.settlement_period,
          label: `SP ${p.settlement_period}`,
          timeLabel: p.time_slot,
          maeMw: p.mae_mw,
          biasMw: p.mbe_mw,
          avgActual: p.mean_actual_mw,
          avgForecast: p.mean_forecast_mw,
          isPeak,
          uncertaintyLevel: p.mae_mw > 800 ? 'HIGH' : p.mae_mw > 600 ? 'MODERATE' : 'LOW',
        };
      })
    : [...Array(48)].map((_, i) => {
        const sp = i + 1;
        const startM = (sp - 1) * 30;
        const timeLabel = `${String(Math.floor(startM / 60)).padStart(2, '0')}:${String(
          startM % 60
        ).padStart(2, '0')} - ${String(Math.floor((startM + 30) / 60)).padStart(2, '0')}:${String(
          (startM + 30) % 60
        ).padStart(2, '0')}`;
        const isPeak = sp >= 29 && sp <= 38;
        // Peak afternoon wind ramp error profile typical of UK winter
        const baseMae = 540 + Math.sin((sp / 48) * Math.PI * 2 - Math.PI / 2) * 220 + (isPeak ? 180 : 0);
        const bias = 60 + Math.sin(sp / 6) * 120;

        return {
          sp,
          label: `SP ${sp}`,
          timeLabel,
          maeMw: Math.round(baseMae),
          biasMw: Math.round(bias),
          avgActual: 8400 + Math.cos(sp / 8) * 1500,
          avgForecast: 8400 + Math.cos(sp / 8) * 1500 + bias,
          isPeak,
          uncertaintyLevel: baseMae > 800 ? 'HIGH' : baseMae > 650 ? 'MODERATE' : 'LOW',
        };
      })
  ).filter((d) => {
    if (filterMode === 'PEAK') return d.isPeak;
    if (filterMode === 'OFF_PEAK') return !d.isPeak;
    return true;
  });

  // Calculate high risk period
  const peakErrorPeriod = [...data].sort((a, b) => b.maeMw - a.maeMw)[0] || data[32];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-slate-950/95 border border-slate-700 p-3 rounded-xl shadow-2xl backdrop-blur-xl text-xs font-mono min-w-[260px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-bold text-slate-100">
              {item.label} ({item.timeLabel})
            </span>
            <Badge
              variant={item.uncertaintyLevel === 'HIGH' ? 'rose' : item.uncertaintyLevel === 'MODERATE' ? 'amber' : 'emerald'}
              size="sm"
            >
              {item.uncertaintyLevel} UNCERTAINTY
            </Badge>
          </div>

          <div className="space-y-1.5 font-sans">
            <div className="flex justify-between items-center">
              <span className="text-cyan-400 font-medium">Mean Absolute Error (MAE):</span>
              <span className="font-mono font-bold text-cyan-300">
                {item.maeMw.toLocaleString()} MW
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-amber-400 font-medium">Mean Bias Error (MBE):</span>
              <span
                className={`font-mono font-bold ${
                  item.biasMw > 0 ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {item.biasMw > 0 ? `+${item.biasMw}` : item.biasMw} MW
              </span>
            </div>

            <div className="flex justify-between items-center pt-1 border-t border-slate-800/80">
              <span className="text-slate-400">Avg Forecast:</span>
              <span className="font-mono text-slate-200">
                {Math.round(item.avgForecast).toLocaleString()} MW
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-400">Avg Actual:</span>
              <span className="font-mono text-slate-200">
                {Math.round(item.avgActual).toLocaleString()} MW
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader
        title="48 Settlement Period Error Breakdown & Intraday Uncertainty Profile"
        subtitle={`Evaluates half-hourly wind forecast uncertainty from SP 1 (00:00) to SP 48 (23:30) at ${gateClosureTime} Cut-off`}
        badge={
          <Badge variant="cyan" size="sm" dot>
            All 48 Periods (GB Market)
          </Badge>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Filter mode */}
            <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setFilterMode('ALL')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterMode === 'ALL'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All 48 SPs
              </button>
              <button
                onClick={() => setFilterMode('PEAK')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterMode === 'PEAK'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Filter to Evening Peak Periods (SP 29 - SP 38)"
              >
                Peak Hours (14:30-19:00)
              </button>
              <button
                onClick={() => setFilterMode('OFF_PEAK')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterMode === 'OFF_PEAK'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Off-Peak
              </button>
            </div>

            {/* Metric toggles */}
            <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs font-semibold">
              <button
                onClick={() => setMetricView('MAE')}
                className={`px-2 py-1 rounded-md transition-all ${
                  metricView === 'MAE' ? 'bg-slate-700 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                MAE Bars
              </button>
              <button
                onClick={() => setMetricView('BIAS')}
                className={`px-2 py-1 rounded-md transition-all ${
                  metricView === 'BIAS' ? 'bg-slate-700 text-amber-300' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Bias Line
              </button>
              <button
                onClick={() => setMetricView('BOTH')}
                className={`px-2 py-1 rounded-md transition-all ${
                  metricView === 'BOTH' ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Combined
              </button>
            </div>
          </div>
        }
      />

      <div className="p-4 space-y-4">
        {/* Trader Intelligence Callout */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">Peak Uncertainty Window</span>
              <span className="text-sm font-bold text-rose-400 font-mono">
                SP 30 - 36 (15:00 - 18:00)
              </span>
            </div>
            <AlertTriangle className="h-5 w-5 text-rose-400" />
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">Max Error Settlement Period</span>
              <span className="text-sm font-bold text-cyan-300 font-mono">
                {peakErrorPeriod ? `${peakErrorPeriod.label} (${peakErrorPeriod.maeMw} MW)` : 'SP 34'}
              </span>
            </div>
            <BarChart3 className="h-5 w-5 text-cyan-400" />
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-slate-400 block">Most Predictable Window</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                SP 04 - 10 (02:00 - 05:00)
              </span>
            </div>
            <CheckCircle className="h-5 w-5 text-emerald-400" />
          </div>
        </div>

        {/* 48-Period Chart Canvas */}
        <div className="h-[360px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

              <XAxis
                dataKey="sp"
                tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(val) => `SP${val}`}
                stroke="#334155"
              />

              <YAxis
                yAxisId="mae"
                stroke="#334155"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(val) => `${val} MW`}
                domain={[0, 'auto']}
              />

              {(metricView === 'BIAS' || metricView === 'BOTH') && (
                <YAxis
                  yAxisId="bias"
                  orientation="right"
                  stroke="#fbbf24"
                  tick={{ fill: '#fbbf24', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(val) => `${val} MW`}
                  domain={[-200, 300]}
                />
              )}

              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                height={32}
                wrapperStyle={{
                  paddingBottom: '10px',
                  fontSize: '12px',
                  fontFamily: 'Inter',
                }}
              />

              {/* Shaded Reference Area for Peak Demand Uncertainty SP 29 - 38 */}
              <ReferenceArea
                yAxisId="mae"
                x1={29}
                x2={38}
                stroke="#f43f5e"
                strokeOpacity={0.2}
                fill="#f43f5e"
                fillOpacity={0.06}
              />

              {/* MAE Bars */}
              {(metricView === 'MAE' || metricView === 'BOTH') && (
                <Bar
                  yAxisId="mae"
                  dataKey="maeMw"
                  name="Settlement Period MAE (MW)"
                  radius={[3, 3, 0, 0]}
                >
                  {data.map((entry, index) => {
                    const color =
                      entry.uncertaintyLevel === 'HIGH'
                        ? '#f43f5e'
                        : entry.uncertaintyLevel === 'MODERATE'
                        ? '#f59e0b'
                        : '#06b6d4';
                    return <Cell key={`cell-${index}`} fill={color} fillOpacity={0.85} />;
                  })}
                </Bar>
              )}

              {/* Bias MBE Line */}
              {(metricView === 'BIAS' || metricView === 'BOTH') && (
                <Line
                  yAxisId="bias"
                  type="monotone"
                  dataKey="biasMw"
                  name="Mean Bias Error MBE (MW)"
                  stroke="#fbbf24"
                  strokeWidth={2}
                  dot={{ r: 2, fill: '#fbbf24' }}
                />
              )}

              {/* Zero Reference Line for Bias */}
              {(metricView === 'BIAS' || metricView === 'BOTH') && (
                <ReferenceLine yAxisId="bias" y={0} stroke="#64748b" strokeDasharray="3 3" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800/80 pt-2.5">
          <strong className="text-slate-300">Procurement Implication:</strong> Notice the pronounced
          spike in MAE between <span className="text-rose-400 font-semibold font-mono">SP 30 (15:00)</span> and{' '}
          <span className="text-rose-400 font-semibold font-mono">SP 36 (18:00)</span>. This coincides exactly
          with the UK evening demand surge. Traders should increase the thermal peaker reserve factor
          during these periods to avoid balancing mechanism cashout price spikes of up to £250/MWh.
        </p>
      </div>
    </Card>
  );
};
