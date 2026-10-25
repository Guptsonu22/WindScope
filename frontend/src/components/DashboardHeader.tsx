import React, { useEffect, useState } from 'react';
import {
  Activity,
  Calendar,
  Clock,
  Moon,
  RefreshCw,
  Sun,
  Zap,
} from 'lucide-react';
import { HealthResponse } from '../types';

interface DashboardHeaderProps {
  health: HealthResponse | null;
  targetDate: string;
  onDateChange: (newDate: string) => void;
  gateClosureTime: string;
  onGateClosureChange: (gate: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  health,
  targetDate,
  onDateChange,
  gateClosureTime,
  onGateClosureChange,
  onRefresh,
  isLoading,
  theme,
  onToggleTheme,
}) => {
  const [currentUtcTime, setCurrentUtcTime] = useState<string>('');
  const [currentSp, setCurrentSp] = useState<number>(1);
  const [minutesToNextSp, setMinutesToNextSp] = useState<number>(30);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hours = now.getUTCHours();
      const minutes = now.getUTCMinutes();
      const seconds = now.getUTCSeconds();

      // Current UK Settlement Period (1-48)
      const sp = Math.min(48, Math.floor((hours * 60 + minutes) / 30) + 1);
      setCurrentSp(sp);

      const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} UTC`;
      setCurrentUtcTime(timeStr);

      const rem = 30 - (minutes % 30);
      setMinutesToNextSp(rem);
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  const isElexonConnected = health?.status === 'ok';

  return (
    <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur-xl sticky top-0 z-50 px-4 lg:px-6 py-3 transition-colors duration-200">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left: Branding & Market Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 via-sky-600 to-emerald-400 p-0.5 flex items-center justify-center shadow-glow-cyan shrink-0">
            <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Zap className="h-5 w-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-1.5 font-sans">
                AeroVolt UK
                <span className="text-slate-400 font-normal">|</span>
                <span className="text-cyan-400 text-sm sm:text-base font-semibold">
                  Day-Ahead Renewable Procurement Portal
                </span>
              </h1>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-cyan-950/80 text-cyan-300 border border-cyan-800/60">
                Market: UK EPEX Day-Ahead
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-900 text-slate-300 border border-slate-800">
                Data Source: Elexon BMRS FUELHH & WINDFOR
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                Coverage: January 2026
              </span>
            </div>
          </div>
        </div>

        {/* Right: Quick Controls, Live Feed Indicator, Clock & Theme */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs shadow-sm">
            <div className="relative flex h-2.5 w-2.5">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isElexonConnected ? 'bg-emerald-400' : 'bg-cyan-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  isElexonConnected ? 'bg-emerald-500' : 'bg-cyan-500'
                }`}
              />
            </div>
            <div className="flex items-center gap-1 text-[11px] font-mono">
              <span className="text-slate-400">Feed:</span>
              <span className="font-semibold text-emerald-400">
                {isElexonConnected ? 'Live API / Cached Jan 2026 Data Active' : 'Cached Jan 2026 Active'}
              </span>
            </div>
          </div>

          {/* Quick Gate Closure Selector Toggle */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-lg p-0.5 text-xs font-mono">
            <span className="text-[11px] text-slate-400 px-2 py-1 font-sans hidden sm:inline">
              Cut-off:
            </span>
            <button
              onClick={() => onGateClosureChange('09:00')}
              className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                gateClosureTime === '09:00'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="D-1 09:00 Early Gate Closure"
            >
              09:00
            </button>
            <button
              onClick={() => onGateClosureChange('11:00')}
              className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                gateClosureTime === '11:00'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="D-1 11:00 Standard UK Day-Ahead Auction Gate Closure (EPEX / N2EX)"
            >
              11:00 D-1
            </button>
            <button
              onClick={() => onGateClosureChange('H-1')}
              className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
                gateClosureTime === 'H-1' || gateClosureTime === 'intraday'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Intraday Rolling 1-Hour Pre-Delivery Cut-off"
            >
              Intraday (H-1)
            </button>
          </div>

          {/* Quick Date Picker */}
          <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
            <Calendar className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
            <input
              type="date"
              value={targetDate}
              min="2026-01-01"
              max="2026-01-31"
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent border-0 text-slate-200 text-xs focus:outline-none focus:ring-0 cursor-pointer font-mono"
              title="Select Day-Ahead Delivery Day (Jan 2026)"
            />
          </div>

          {/* Active Settlement Period Indicator */}
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono">
            <Activity className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-slate-400">SP:</span>
            <span className="text-cyan-300 font-bold">{currentSp}/48</span>
            <span className="text-[10px] text-slate-500">({minutesToNextSp}m)</span>
          </div>

          {/* UTC Clock */}
          <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-xs font-mono text-slate-300">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>{currentUtcTime || '--:--:-- UTC'}</span>
          </div>

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} theme`}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-cyan-400" />}
          </button>

          {/* Refresh Action */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-semibold shadow-glow-cyan transition-all disabled:opacity-50"
            title="Force refresh Elexon feeds"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>
    </header>
  );
};
