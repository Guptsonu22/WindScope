import React, { useState } from 'react';
import {
  Area,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Calendar,
  Clock,
  Maximize2,
  X,
} from 'lucide-react';
import { Card, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { SettlementPeriodData, TimeseriesPoint } from '../types';

interface ForecastVsActualChartProps {
  periods: SettlementPeriodData[];
  timeseries?: TimeseriesPoint[];
  targetDate: string;
  gateClosureTime?: string;
  onSelectDate?: (date: string) => void;
}

export const ForecastVsActualChart: React.FC<ForecastVsActualChartProps> = ({
  periods,
  timeseries,
  targetDate,
  gateClosureTime = '11:00',
  onSelectDate,
}) => {
  const [viewMode, setViewMode] = useState<'DAY' | 'MONTH'>('DAY');
  const [showPriceOverlay, setShowPriceOverlay] = useState<boolean>(true);
  const [showErrorArea, setShowErrorArea] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalDay, setModalDay] = useState<string>(targetDate);

  // 1. Data mapping for single day (48 settlement periods)
  const dayChartData = periods.map((p) => {
    const errorMw = p.error_mw ?? (p.actual_mw !== null ? p.forecast_mw - p.actual_mw : 0);
    const deficitMw = errorMw > 0 ? errorMw : 0; // Overforecast: short physical wind
    const surplusMw = errorMw < 0 ? Math.abs(errorMw) : 0; // Underforecast: surplus physical wind

    return {
      sp: p.settlement_period,
      label: `SP ${p.settlement_period}`,
      timeSlot: p.time_slot,
      startTime: p.start_time,
      publishTime: `${targetDate.slice(0, 10)} ${gateClosureTime} Cut-off`,
      forecast: p.forecast_mw,
      actual: p.actual_mw,
      errorMw: Math.round(errorMw),
      errorPct: p.error_pct ?? (p.actual_mw ? Math.round((Math.abs(errorMw) / p.actual_mw) * 100) : 0),
      deficit: Math.round(deficitMw),
      surplus: Math.round(surplusMw),
      price: p.system_price_gbp_mwh ?? 78.5,
      imbalance: p.imbalance_direction,
    };
  });

  // 2. Data mapping for monthly timeseries (1,488 half-hours)
  const monthChartData = (timeseries || []).map((pt, idx) => {
    const fMw = pt.forecastMW;
    const aMw = pt.actualMW;
    const err = pt.errorMW ?? (aMw !== null ? fMw - aMw : 0);
    const deficitMw = err > 0 ? err : 0;
    const surplusMw = err < 0 ? Math.abs(err) : 0;
    const dateStr = pt.startTime.slice(0, 10);
    const timeStr = pt.startTime.slice(11, 16);

    return {
      idx,
      sp: pt.settlementPeriod,
      label: `${dateStr} SP${pt.settlementPeriod}`,
      dateStr,
      timeSlot: `${timeStr} UTC`,
      startTime: pt.startTime,
      publishTime: pt.publishTime,
      forecast: fMw,
      actual: aMw,
      errorMw: Math.round(err),
      errorPct: aMw ? Math.round((Math.abs(err) / aMw) * 100) : 0,
      deficit: Math.round(deficitMw),
      surplus: Math.round(surplusMw),
      imbalance: err > 0 ? 'SHORT' : 'LONG',
    };
  });

  const activeData = viewMode === 'MONTH' && monthChartData.length > 0 ? monthChartData : dayChartData;

  // Custom Trading Desk Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isDeficit = data.errorMw > 0; // Overforecast means wind deficit

      return (
        <div className="bg-slate-950/95 border border-slate-700 p-3 rounded-xl shadow-2xl backdrop-blur-xl text-xs font-mono min-w-[270px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-bold text-slate-100">
              {data.label} ({data.timeSlot})
            </span>
            <Badge
              variant={isDeficit ? 'rose' : 'emerald'}
              size="sm"
            >
              {isDeficit ? 'WIND DEFICIT (SHORT)' : 'WIND SURPLUS (LONG)'}
            </Badge>
          </div>

          <div className="space-y-1.5 font-sans">
            {/* Publish Time of Forecast */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pb-1 border-b border-slate-900">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 text-cyan-400" />
                Forecast Publish Time:
              </span>
              <span className="font-mono text-cyan-300 font-semibold truncate max-w-[140px]">
                {data.publishTime}
              </span>
            </div>

            {/* Day-Ahead Forecast */}
            <div className="flex justify-between items-center">
              <span className="text-cyan-400 flex items-center gap-1.5 font-medium">
                <span className="h-2 w-2 rounded-full bg-cyan-400" />
                DA Forecast ({gateClosureTime}):
              </span>
              <span className="font-mono font-bold text-slate-100">
                {data.forecast?.toLocaleString()} MW
              </span>
            </div>

            {/* Actual Wind Generation */}
            {data.actual !== null && (
              <div className="flex justify-between items-center">
                <span className="text-emerald-400 flex items-center gap-1.5 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Actual Wind Generation:
                </span>
                <span className="font-mono font-bold text-slate-100">
                  {data.actual?.toLocaleString()} MW
                </span>
              </div>
            )}

            {/* Delta / Forecast Error */}
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/80">
              <span className="text-slate-400 font-medium">Forecast Delta (F - A):</span>
              <span
                className={`font-mono font-bold ${
                  data.errorMw > 0 ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {data.errorMw > 0 ? `+${data.errorMw.toLocaleString()}` : data.errorMw?.toLocaleString()} MW
                {data.errorPct ? ` (${data.errorPct}%)` : ''}
              </span>
            </div>

            {/* System Price */}
            {data.price && (
              <div className="flex justify-between items-center text-[11px] text-amber-300 pt-1">
                <span>System Cashout:</span>
                <span className="font-mono font-bold">£{Number(data.price).toFixed(2)}/MWh</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const handleOpenModal = (day?: string) => {
    setModalDay(day || targetDate);
    setIsModalOpen(true);
  };

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <CardHeader
          title="Actual Wind Outturn vs. Day-Ahead Forecast"
          subtitle={
            viewMode === 'MONTH'
              ? `Full Month View: January 2026 (1,488 Half-Hourly Settlement Periods) at ${gateClosureTime} Cut-off`
              : `GB Delivery Day ${targetDate}: 48 Settlement Periods at ${gateClosureTime} Auction Cut-off`
          }
          badge={
            <Badge variant="cyan" size="sm" dot>
              Elexon BMRS FUELHH & WINDFOR
            </Badge>
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              {/* Day / Month View Toggle */}
              <div className="flex rounded-lg bg-slate-800 p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setViewMode('DAY')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    viewMode === 'DAY'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  24h Day View
                </button>
                <button
                  onClick={() => setViewMode('MONTH')}
                  className={`px-3 py-1 rounded-md transition-all ${
                    viewMode === 'MONTH'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Full Jan 2026 (Brush)
                </button>
              </div>

              {/* Shaded Area Toggle */}
              <button
                onClick={() => setShowErrorArea(!showErrorArea)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${
                  showErrorArea
                    ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle Shaded Forecast Error Area"
              >
                Error Shading
              </button>

              {/* Price Overlay Toggle */}
              {viewMode === 'DAY' && (
                <button
                  onClick={() => setShowPriceOverlay(!showPriceOverlay)}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold transition-all ${
                    showPriceOverlay
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                  title="Toggle System Imbalance Price Overlay"
                >
                  Cashout £
                </button>
              )}

              {/* 24-Hour Modal Inspect Button */}
              <button
                onClick={() => handleOpenModal()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                title="Open 24-Hour Deep Inspection Modal"
              >
                <Maximize2 className="h-3.5 w-3.5 text-cyan-400" />
                <span className="hidden sm:inline">24h Inspect Modal</span>
              </button>
            </div>
          }
        />

        {/* Chart Canvas */}
        <div className="p-4 pt-6">
          <div className="h-[420px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={activeData}
                margin={{ top: 10, right: 30, left: 10, bottom: viewMode === 'MONTH' ? 10 : 20 }}
              >
                <defs>
                  {/* Deficit Gradient (Rose/Orange) */}
                  <linearGradient id="deficitGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.05} />
                  </linearGradient>
                  {/* Surplus Gradient (Light Emerald) */}
                  <linearGradient id="surplusGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

                <XAxis
                  dataKey={viewMode === 'MONTH' ? 'idx' : 'sp'}
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(val) => {
                    if (viewMode === 'MONTH') {
                      const item = monthChartData[val];
                      return item && item.sp === 1 ? item.dateStr.slice(5) : '';
                    }
                    return `SP ${val}`;
                  }}
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
                {viewMode === 'DAY' && showPriceOverlay && (
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
                    paddingBottom: '12px',
                    fontSize: '12px',
                    fontFamily: 'Inter',
                  }}
                />

                {/* 1. Shaded Forecast Error Deficit (Red/Orange) */}
                {showErrorArea && (
                  <Area
                    yAxisId="mw"
                    type="monotone"
                    dataKey="deficit"
                    name="Deficit Risk: Overforecast Area (MW)"
                    fill="url(#deficitGradient)"
                    stroke="#f43f5e"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                )}

                {/* 2. Shaded Forecast Error Surplus (Light Green) */}
                {showErrorArea && (
                  <Area
                    yAxisId="mw"
                    type="monotone"
                    dataKey="surplus"
                    name="Surplus Cushion: Underforecast Area (MW)"
                    fill="url(#surplusGradient)"
                    stroke="#10b981"
                    strokeWidth={1}
                    strokeDasharray="2 2"
                  />
                )}

                {/* 3. Actual Wind Generation (Solid Green) */}
                <Line
                  yAxisId="mw"
                  type="monotone"
                  dataKey="actual"
                  name="Actual Wind Generation (Solid Green)"
                  stroke="#10b981"
                  strokeWidth={2.75}
                  dot={false}
                  activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                />

                {/* 4. Day-Ahead Forecast at 11:00 Cut-off (Dashed Cyan) */}
                <Line
                  yAxisId="mw"
                  type="monotone"
                  dataKey="forecast"
                  name={`Day-Ahead Forecast at ${gateClosureTime} (Dashed Cyan)`}
                  stroke="#06b6d4"
                  strokeWidth={2.5}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={{ r: 6, fill: '#06b6d4', stroke: '#fff', strokeWidth: 2 }}
                />

                {/* 5. System Cashout Price Overlay */}
                {viewMode === 'DAY' && showPriceOverlay && (
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="price"
                    name="System Price (£/MWh)"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={false}
                  />
                )}

                {/* Recharts Brush Control for Zoom/Pan across January 2026 */}
                {viewMode === 'MONTH' && (
                  <Brush
                    dataKey="idx"
                    height={32}
                    stroke="#06b6d4"
                    fill="#0f172a"
                    tickFormatter={(val) => {
                      const item = monthChartData[val];
                      return item ? item.dateStr : '';
                    }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Card>

      {/* 24-HOUR SINGLE-DAY DEEP INSPECTION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 px-6 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Maximize2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    24-Hour Settlement Period Inspection
                    <Badge variant="cyan" size="sm">
                      {modalDay}
                    </Badge>
                  </h3>
                  <p className="text-xs text-slate-400">
                    Detailed half-hour actuals outturn vs {gateClosureTime} Day-Ahead forecast delta
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
                  <Calendar className="h-3.5 w-3.5 text-cyan-400" />
                  <input
                    type="date"
                    value={modalDay}
                    min="2026-01-01"
                    max="2026-01-31"
                    onChange={(e) => {
                      setModalDay(e.target.value);
                      if (onSelectDate) onSelectDate(e.target.value);
                    }}
                    className="bg-transparent border-0 text-slate-200 text-xs focus:outline-none cursor-pointer font-mono"
                  />
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Table Body */}
            <div className="flex-1 overflow-y-auto p-4 px-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider sticky top-0 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">SP</th>
                      <th className="py-2.5 px-3">Time Slot</th>
                      <th className="py-2.5 px-3">DA Forecast ({gateClosureTime})</th>
                      <th className="py-2.5 px-3">Actual Outturn</th>
                      <th className="py-2.5 px-3">Error Delta</th>
                      <th className="py-2.5 px-3">% Error</th>
                      <th className="py-2.5 px-3">Imbalance Risk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {dayChartData.map((row) => (
                      <tr key={row.sp} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-2 px-3 font-bold text-cyan-300">SP {row.sp}</td>
                        <td className="py-2 px-3 text-slate-300 font-sans">{row.timeSlot}</td>
                        <td className="py-2 px-3 text-cyan-400 font-semibold">
                          {row.forecast?.toLocaleString()} MW
                        </td>
                        <td className="py-2 px-3 text-emerald-400 font-semibold">
                          {row.actual !== null ? `${row.actual?.toLocaleString()} MW` : 'N/A'}
                        </td>
                        <td
                          className={`py-2 px-3 font-bold ${
                            row.errorMw > 0 ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {row.errorMw > 0 ? `+${row.errorMw.toLocaleString()}` : row.errorMw?.toLocaleString()} MW
                        </td>
                        <td className="py-2 px-3 text-slate-300">{row.errorPct}%</td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              row.errorMw > 0
                                ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                                : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                            }`}
                          >
                            {row.errorMw > 0 ? 'SHORT (DEFICIT)' : 'LONG (SURPLUS)'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 px-6 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
              <span>Showing all 48 half-hour settlement periods for {modalDay}.</span>
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
