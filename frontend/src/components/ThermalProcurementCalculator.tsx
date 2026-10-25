import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BatteryCharging,
  DollarSign,
  Flame,
  HelpCircle,
  Info,
  Percent,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  TrendingDown,
  Zap,
} from 'lucide-react';
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
import { Card, CardHeader } from './ui/Card';
import { Badge } from './ui/Badge';
import { SettlementPeriodData } from '../types';

interface ThermalProcurementCalculatorProps {
  targetDate?: string;
  periods?: SettlementPeriodData[];
  defaultP90Buffer?: number;
}

export const ThermalProcurementCalculator: React.FC<ThermalProcurementCalculatorProps> = ({
  targetDate = '2026-01-15',
  periods = [],
  defaultP90Buffer = 1240,
}) => {
  // 1. Consumer Base Demand (MW)
  const [demandMw, setDemandMw] = useState<number>(25000);
  // 2. Safety Buffer Percentile
  const [safetyPercentile, setSafetyPercentile] = useState<number>(90);
  // 3. System Cashout Penalty Price (£/MWh)
  const [cashoutPriceGbp, setCashoutPriceGbp] = useState<number>(145.0);
  // 4. CCGT Spark Spread Fuel Price (£/MWh)
  const [ccgtFuelPriceGbp, setCcgtFuelPriceGbp] = useState<number>(78.5);

  // Quick Preset Presets for UK Demand
  const PRESET_DEMANDS = [
    { label: 'Off-Peak Night', mw: 18000, desc: 'Overnight minimum baseline' },
    { label: 'Typical Winter', mw: 25000, desc: 'Average January daytime demand' },
    { label: 'Peak Cold Snap', mw: 36000, desc: 'Teatime heating & lighting surge' },
    { label: 'Severe Freeze', mw: 42000, desc: 'Extreme Beast-from-the-East winter stress' },
  ];

  // Dynamic P90 buffer multiplier based on percentile slider
  const percentileMultiplier =
    safetyPercentile === 95 ? 1.25 : safetyPercentile === 90 ? 1.0 : safetyPercentile === 80 ? 0.75 : 0.6;
  const activeBufferMw = Math.round(defaultP90Buffer * percentileMultiplier);

  // Calculate average predicted wind across periods (or fallback to typical 8,400 MW)
  const avgWindForecastMw = useMemo(() => {
    if (!periods || periods.length === 0) return 8400;
    const sum = periods.reduce((acc, p) => acc + p.forecast_mw, 0);
    return Math.round(sum / periods.length);
  }, [periods]);

  // Calculations for executive cards
  const standardExpectedProcureMw = Math.max(0, demandMw - avgWindForecastMw);
  const riskAdjustedProcureMw = Math.max(0, demandMw - (avgWindForecastMw - activeBufferMw));
  const additionalBufferProcureMw = riskAdjustedProcureMw - standardExpectedProcureMw;

  // Financial Imbalance Exposure Avoided
  // If wind drops by the buffer during peak 4 hours, what would the cashout penalty cost vs hedging beforehand?
  const cashoutExposureAvoidedGbp = Math.round(
    additionalBufferProcureMw * 4 * Math.max(0, cashoutPriceGbp - ccgtFuelPriceGbp)
  );

  // Half-hourly 48 period schedule
  const scheduleData = useMemo(() => {
    if (periods && periods.length === 48) {
      return periods.map((p) => {
        const wind = p.forecast_mw;
        const expectedThermal = Math.max(0, demandMw - wind);
        const riskAdjustedThermal = Math.max(0, demandMw - (wind - activeBufferMw));
        const peakerNeeded = riskAdjustedThermal > 22000;

        return {
          sp: p.settlement_period,
          label: `SP ${p.settlement_period}`,
          timeSlot: p.time_slot,
          demand: demandMw,
          windForecast: wind,
          expectedThermal: Math.round(expectedThermal),
          riskAdjustedThermal: Math.round(riskAdjustedThermal),
          safetyReserve: activeBufferMw,
          peakerMw: peakerNeeded ? Math.round(riskAdjustedThermal - 22000) : 0,
          ccgtMw: peakerNeeded ? 22000 : Math.round(riskAdjustedThermal),
        };
      });
    }

    // Synthetic fallback for 48 periods
    return [...Array(48)].map((_, i) => {
      const sp = i + 1;
      const startM = (sp - 1) * 30;
      const timeSlot = `${String(Math.floor(startM / 60)).padStart(2, '0')}:${String(
        startM % 60
      ).padStart(2, '0')}`;
      const windProfile = 8400 + Math.sin((sp / 48) * Math.PI * 2) * 2500;
      const expectedThermal = Math.max(0, demandMw - windProfile);
      const riskAdjustedThermal = Math.max(0, demandMw - (windProfile - activeBufferMw));
      const peakerNeeded = riskAdjustedThermal > 22000;

      return {
        sp,
        label: `SP ${sp}`,
        timeSlot,
        demand: demandMw,
        windForecast: Math.round(windProfile),
        expectedThermal: Math.round(expectedThermal),
        riskAdjustedThermal: Math.round(riskAdjustedThermal),
        safetyReserve: activeBufferMw,
        peakerMw: peakerNeeded ? Math.round(riskAdjustedThermal - 22000) : 0,
        ccgtMw: peakerNeeded ? 22000 : Math.round(riskAdjustedThermal),
      };
    });
  }, [demandMw, activeBufferMw, periods]);

  const CustomScheduleTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const row = payload[0].payload;
      return (
        <div className="bg-slate-950/95 border border-slate-700 p-3 rounded-xl shadow-2xl backdrop-blur-xl text-xs font-mono min-w-[270px]">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
            <span className="font-bold text-slate-100">
              {row.label} ({row.timeSlot})
            </span>
            <Badge variant="amber" size="sm">
              DEMAND: {row.demand.toLocaleString()} MW
            </Badge>
          </div>

          <div className="space-y-1.5 font-sans">
            <div className="flex justify-between items-center text-cyan-400">
              <span>Predicted Wind Generation:</span>
              <span className="font-mono font-bold">{row.windForecast.toLocaleString()} MW</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span>Standard Procure (Demand - Wind):</span>
              <span className="font-mono font-bold">{row.expectedThermal.toLocaleString()} MW</span>
            </div>
            <div className="flex justify-between items-center text-amber-300 font-semibold pt-1 border-t border-slate-800">
              <span>P{safetyPercentile} Risk-Adjusted Procure:</span>
              <span className="font-mono font-bold text-amber-200">
                {row.riskAdjustedThermal.toLocaleString()} MW
              </span>
            </div>
            <div className="flex justify-between items-center text-purple-400 text-[11px]">
              <span>Quantified Reserve Margin:</span>
              <span className="font-mono font-bold">+{row.safetyReserve.toLocaleString()} MW</span>
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
        title="Thermal & Flexible Asset Procurement Calculator"
        subtitle={`Hedging Decision Tool: Calculate risk-adjusted thermal replacement procurement for GB delivery on ${targetDate}`}
        badge={
          <Badge variant="amber" size="sm" dot>
            Risk Decision Engine
          </Badge>
        }
      />

      <div className="p-4 sm:p-6 space-y-6">
        {/* INPUT CONTROLS SECTION */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80">
          {/* Base Demand Slider & Presets */}
          <div className="lg:col-span-7 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Sliders className="h-4 w-4 text-amber-400" />
                Consumer Base System Demand (MW)
              </label>
              <div className="flex items-baseline gap-1 font-mono">
                <span className="text-xl font-black text-amber-400">{demandMw.toLocaleString()}</span>
                <span className="text-xs text-slate-400">MW</span>
              </div>
            </div>

            <input
              type="range"
              min="15000"
              max="45000"
              step="500"
              value={demandMw}
              onChange={(e) => setDemandMw(Number(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />

            {/* Presets */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              {PRESET_DEMANDS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setDemandMw(preset.mw)}
                  className={`p-2 rounded-lg text-left border transition-all ${
                    demandMw === preset.mw
                      ? 'bg-amber-500/20 border-amber-500/60 text-white shadow-sm'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <span className="text-xs font-bold block">{preset.label}</span>
                  <span className="text-[11px] font-mono font-semibold text-amber-300">
                    {preset.mw.toLocaleString()} MW
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Confidence Buffer & Price Parameters */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-3 pl-0 lg:pl-3 lg:border-l lg:border-slate-800/80">
            {/* Safety Percentile */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />
                  Risk Confidence
                </span>
                <span className="font-mono text-purple-300 font-bold">P{safetyPercentile}</span>
              </label>
              <select
                value={safetyPercentile}
                onChange={(e) => setSafetyPercentile(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none"
              >
                <option value={75}>P75 Moderate Buffer ({Math.round(defaultP90Buffer * 0.6)} MW)</option>
                <option value={80}>P80 Standard Buffer ({Math.round(defaultP90Buffer * 0.75)} MW)</option>
                <option value={90}>P90 Conservative UK Desk ({defaultP90Buffer} MW)</option>
                <option value={95}>P95 High Resilience ({Math.round(defaultP90Buffer * 1.25)} MW)</option>
              </select>
              <span className="text-[10px] text-slate-500 block">Statistical downside coverage</span>
            </div>

            {/* Imbalance Cashout Price */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5 text-rose-400" />
                  Cashout Price
                </span>
                <span className="font-mono text-rose-300 font-bold">£{cashoutPriceGbp}/MWh</span>
              </label>
              <input
                type="number"
                min="50"
                max="500"
                step="5"
                value={cashoutPriceGbp}
                onChange={(e) => setCashoutPriceGbp(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none"
              />
              <span className="text-[10px] text-slate-500 block">Elexon System Buy Price penalty</span>
            </div>
          </div>
        </div>

        {/* 4 CORE EXECUTIVE VISUAL BREAKDOWN CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Predicted Wind Contribution */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-900/40 relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-cyan-500" />
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold text-slate-200">Predicted Wind Contribution</span>
              <Zap className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-2xl font-black text-cyan-300">
                {avgWindForecastMw.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400">MW</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Provides{' '}
              <strong className="text-cyan-400 font-mono">
                {Math.round((avgWindForecastMw / demandMw) * 100)}%
              </strong>{' '}
              of consumer load from zero-carbon wind
            </p>
          </div>

          {/* Card 2: Standard Expected Thermal Procure */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-slate-600" />
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold text-slate-200">Standard Expected Procure</span>
              <span className="font-mono text-[10px] text-slate-400">Demand - Wind</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-2xl font-black text-slate-100">
                {standardExpectedProcureMw.toLocaleString()}
              </span>
              <span className="text-xs text-slate-400">MW</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Unhedged baseline without forecast error safety margin
            </p>
          </div>

          {/* Card 3: Risk-Adjusted Recommended Procure (P90) */}
          <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/60 relative overflow-hidden shadow-lg shadow-amber-950/20">
            <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300" />
            <div className="flex items-center justify-between text-xs text-amber-300 mb-1">
              <span className="font-bold flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-amber-400" />
                Recommended Procure (P{safetyPercentile})
              </span>
              <span className="font-mono text-[10px] font-bold px-1 rounded bg-amber-950 text-amber-300 border border-amber-800/80">
                Risk-Adjusted
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5 font-mono">
              <span className="text-2xl font-black text-amber-300">
                {riskAdjustedProcureMw.toLocaleString()}
              </span>
              <span className="text-xs text-amber-400 font-bold">MW</span>
            </div>
            <p className="text-[11px] text-amber-200/90 font-medium mt-2 flex items-center gap-1">
              <span>Includes</span>
              <span className="font-mono font-bold text-purple-300">+{activeBufferMw.toLocaleString()} MW</span>
              <span>downside safety reserve</span>
            </p>
          </div>

          {/* Card 4: Financial Imbalance Exposure Avoided */}
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 left-0 h-1 bg-emerald-500" />
            <div className="flex items-center justify-between text-xs text-emerald-300 mb-1">
              <span className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                Imbalance Penalty Avoided
              </span>
              <span className="font-mono text-[10px] px-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                Hedging Value
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-1 font-mono">
              <span className="text-2xl font-black text-emerald-400">
                £{cashoutExposureAvoidedGbp.toLocaleString()}
              </span>
            </div>
            <p className="text-[11px] text-emerald-300/80 mt-2">
              Potential cashout penalty saved vs buying at £{cashoutPriceGbp}/MWh penalty price
            </p>
          </div>
        </div>

        {/* FINANCIAL IMBALANCE EXPOSURE WARNING BANNER */}
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-300 shrink-0 mt-0.5">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-bold text-rose-200 text-sm flex items-center gap-2">
                Financial Imbalance Exposure Warning
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-900/80 text-rose-300 border border-rose-700/60">
                  GB Market Rule: BSC Section T
                </span>
              </h4>
              <p className="text-slate-300 mt-1 leading-relaxed">
                If the utility procures only the unhedged standard amount ({standardExpectedProcureMw.toLocaleString()} MW),
                a typical 1-in-10 wind drop-off will force the desk into short imbalance settlement at the
                Elexon System Buy Price (currently £{cashoutPriceGbp.toFixed(2)}/MWh). Procuring the quantified{' '}
                <strong className="text-amber-300">P{safetyPercentile} buffer of {activeBufferMw.toLocaleString()} MW</strong> ahead
                of the 11:00 Day-Ahead auction insulates the utility from up to{' '}
                <strong className="text-emerald-300">£{cashoutExposureAvoidedGbp.toLocaleString()}</strong> in distressed balancing costs.
              </p>
            </div>
          </div>
        </div>

        {/* 48-PERIOD THERMAL GAP SCHEDULE CHART */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-amber-400" />
              Half-Hourly Thermal Procurement Profile Across Day {targetDate}
            </h4>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">Reserve Factor:</span>
              <span className="text-purple-300 font-bold">+{activeBufferMw.toLocaleString()} MW</span>
            </div>
          </div>

          <div className="h-[340px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={scheduleData} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

                <XAxis
                  dataKey="sp"
                  tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(val) => `SP${val}`}
                  stroke="#334155"
                />

                <YAxis
                  stroke="#334155"
                  tick={{ fill: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  tickFormatter={(val) => `${val.toLocaleString()} MW`}
                  domain={[0, 'auto']}
                />

                <Tooltip content={<CustomScheduleTooltip />} />
                <Legend
                  verticalAlign="top"
                  height={32}
                  wrapperStyle={{
                    paddingBottom: '10px',
                    fontSize: '12px',
                    fontFamily: 'Inter',
                  }}
                />

                {/* Base Customer Demand Reference Line */}
                <ReferenceLine
                  y={demandMw}
                  stroke="#fbbf24"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{
                    value: `Consumer Demand: ${demandMw.toLocaleString()} MW`,
                    fill: '#fbbf24',
                    fontSize: 11,
                    position: 'top',
                  }}
                />

                {/* Predicted Wind Area */}
                <Area
                  type="monotone"
                  dataKey="windForecast"
                  name="Predicted Wind Output (MW)"
                  fill="#06b6d4"
                  fillOpacity={0.25}
                  stroke="#06b6d4"
                  strokeWidth={2}
                />

                {/* Risk-Adjusted Thermal Procure Bar (Stacked with CCGT & Peaker) */}
                <Bar
                  dataKey="ccgtMw"
                  name="CCGT Baseload Procure (MW)"
                  fill="#f59e0b"
                  stackId="procure"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="peakerMw"
                  name="OCGT Peaker Reserve (MW)"
                  fill="#fb923c"
                  stackId="procure"
                  radius={[3, 3, 0, 0]}
                />

                {/* Risk Adjusted Curve Line */}
                <Line
                  type="monotone"
                  dataKey="riskAdjustedThermal"
                  name="Total P90 Procurement Curve (MW)"
                  stroke="#ec4899"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </Card>
  );
};
