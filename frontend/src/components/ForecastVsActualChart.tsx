import React, { useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, Eye, Layers, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { SettlementPeriodData } from '../types';

interface ForecastVsActualChartProps {
  periods: SettlementPeriodData[];
  targetDate: string;
}

export const ForecastVsActualChart: React.FC<ForecastVsActualChartProps> = ({
  periods,
  targetDate,
}) => {
  const [showPriceOverlay, setShowPriceOverlay] = useState<boolean>(true);
  const [showDeltaBars, setShowDeltaBars] = useState<boolean>(true);
  const [filterRange, setFilterRange] = useState<'ALL' | 'MORNING' | 'EVENING'>('ALL');

  const filteredPeriods = periods.filter((p) => {
    if (filterRange === 'MORNING') return p.settlement_period <= 24;
    if (filterRange === 'EVENING') return p.settlement_period >= 25;
    return true;
  });

  const chartData = filteredPeriods.map((p) => ({
    sp: p.settlement_period,
    name: `SP ${p.settlement_period}`,
    time_slot: p.time_slot,
    forecast: p.forecast_mw,
    actual: p.actual_mw,
    error: p.error_mw ?? 0,
    error_pct: p.error_pct ?? 0,
    short_deficit: p.error_mw && p.error_mw < 0 ? Math.abs(p.error_mw) : 0,
    surplus: p.error_mw && p.error_mw > 0 ? p.error_mw : 0,
    price: p.system_price_gbp_mwh ?? 75,
    cashout: p.cashout_exposure_gbp ?? 0,
    imbalance: p.imbalance_direction,
  }));

  // Custom Trading Desk Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isShort = data.imbalance === 'SHORT';
      const isLong = data.imbalance === 'LONG';

      return (
        <div className="bg-slate-950/95 border border-slate-700/80 p-3.5 rounded-xl shadow-2xl backdrop-blur-xl text-xs font-mono min-w-[240px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-bold text-slate-200">
              {label} ({data.time_slot})
            </span>
            <Badge
              variant={isShort ? 'rose' : isLong ? 'emerald' : 'slate'}
              size="sm"
            >
              {data.imbalance}
            </Badge>
          </div>

          <div className="space-y-1.5 font-sans">
            <div className="flex justify-between items-center">
              <span className="text-cyan-400 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                DA Forecast:
              </span>
              <span className="font-mono font-bold text-slate-100">
                {data.forecast.toLocaleString()} MW
              </span>
            </div>

            {data.actual !== null && (
              <div className="flex justify-between items-center">
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Actual Outturn:
                </span>
                <span className="font-mono font-bold text-slate-100">
                  {data.actual.toLocaleString()} MW
                </span>
              </div>
            )}

            <div className="flex justify-between items-center pt-1 border-t border-slate-800/60">
              <span className="text-slate-400">Forecast Error (Delta):</span>
              <span
                className={`font-mono font-bold ${
                  data.error < 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {data.error > 0 ? `+${data.error}` : data.error} MW ({data.error_pct}%)
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-amber-400">System Cashout Price:</span>
              <span className="font-mono font-bold text-amber-300">
                £{data.price.toFixed(2)}/MWh
              </span>
            </div>

            {data.cashout > 0 && (
              <div className="flex justify-between items-center bg-rose-950/40 px-2 py-1 rounded border border-rose-900/50 mt-1">
                <span className="text-rose-300 font-semibold">Cashout Risk:</span>
                <span className="font-mono font-bold text-rose-200">
                  £{data.cashout.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader
        title="Day-Ahead Wind Forecast vs. Actual Outturn"
        subtitle={`48 Settlement Periods (Half-Hourly) for GB Delivery Date ${targetDate}`}
        badge={
          <Badge variant="cyan" size="sm" dot>
            BMRS Outturn Feed
          </Badge>
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Range Toggle */}
            <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs font-medium">
              <button
                onClick={() => setFilterRange('ALL')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterRange === 'ALL'
                    ? 'bg-slate-700 text-cyan-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                SP 1-48 (Full)
              </button>
              <button
                onClick={() => setFilterRange('MORNING')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterRange === 'MORNING'
                    ? 'bg-slate-700 text-cyan-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Morning (1-24)
              </button>
              <button
                onClick={() => setFilterRange('EVENING')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  filterRange === 'EVENING'
                    ? 'bg-slate-700 text-cyan-300 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Peak (25-48)
              </button>
            </div>

            {/* Overlays toggle */}
            <button
              onClick={() => setShowPriceOverlay(!showPriceOverlay)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                showPriceOverlay
                  ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              System Price
            </button>

            <button
              onClick={() => setShowDeltaBars(!showDeltaBars)}
              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                showDeltaBars
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              Shortfall Delta
            </button>
          </div>
        }
      />

      <div className="p-4 pt-6">
        <div className="h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 30, left: 10, bottom: 20 }}
            >
              <defs>
                <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

              <XAxis
                dataKey="sp"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(val) => `SP ${val}`}
                stroke="#334155"
              />

              {/* Left Y-Axis: Megawatts (MW) */}
              <YAxis
                yAxisId="mw"
                stroke="#334155"
                tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                tickFormatter={(val) => `${val.toLocaleString()} MW`}
                domain={['auto', 'auto']}
              />

              {/* Right Y-Axis: System Price (£/MWh) */}
              {showPriceOverlay && (
                <YAxis
                  yAxisId="price"
                  orientation="right"
                  stroke="#fbbf24"
                  tick={{ fill: '#fbbf24', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(val) => `£${val}`}
                  domain={[30, 'auto']}
                />
              )}

              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                height={36}
                wrapperStyle={{
                  paddingBottom: '10px',
                  fontSize: '12px',
                  fontFamily: 'Inter',
                }}
              />

              {/* Shortfall Deficit Bars */}
              {showDeltaBars && (
                <Bar
                  yAxisId="mw"
                  dataKey="short_deficit"
                  name="Wind Shortfall (MW)"
                  fill="#f43f5e"
                  opacity={0.65}
                  radius={[3, 3, 0, 0]}
                />
              )}

              {/* Day-Ahead Forecast Area */}
              <Area
                yAxisId="mw"
                type="monotone"
                dataKey="forecast"
                name="Day-Ahead Forecast (MW)"
                stroke="#06b6d4"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#forecastFill)"
              />

              {/* Actual Generation Outturn */}
              <Line
                yAxisId="mw"
                type="monotone"
                dataKey="actual"
                name="Actual Outturn (MW)"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={false}
              />

              {/* System Price (£/MWh) overlay */}
              {showPriceOverlay && (
                <Line
                  yAxisId="price"
                  type="monotone"
                  dataKey="price"
                  name="System Cashout (£/MWh)"
                  stroke="#fbbf24"
                  strokeWidth={1.75}
                  strokeDasharray="4 4"
                  dot={false}
                />
              )}

              {/* Peak Evening Demand Threshold marker */}
              <ReferenceLine
                yAxisId="mw"
                x={35}
                stroke="#f43f5e"
                strokeDasharray="3 3"
                label={{
                  value: 'Evening Peak Deficit Risk',
                  fill: '#f43f5e',
                  fontSize: 10,
                  position: 'top',
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
};
