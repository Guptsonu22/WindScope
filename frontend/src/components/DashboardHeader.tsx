import React, { useEffect, useState } from 'react';
import {
  Activity,
  Calendar,
  Clock,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { HealthResponse } from '../types';

interface DashboardHeaderProps {
  health: HealthResponse | null;
  targetDate: string;
  onDateChange: (newDate: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  activeGateName: string;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  health,
  targetDate,
  onDateChange,
  onRefresh,
  isLoading,
  activeGateName,
}) => {
  const [currentUtcTime, setCurrentUtcTime] = useState<string>('');
  const [currentSp, setCurrentSp] = useState<number>(1);
  const [countdownMinutes, setCountdownMinutes] = useState<number>(45);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hours = now.getUTCHours();
      const minutes = now.getUTCMinutes();
      const seconds = now.getUTCSeconds();

      // Current UK Settlement Period (48 half-hours)
      const sp = Math.min(48, Math.floor((hours * 60 + minutes) / 30) + 1);
      setCurrentSp(sp);

      const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')} UTC`;
      setCurrentUtcTime(timeString);

      // Countdown to next half-hour boundary
      const minutesRemaining = 30 - (minutes % 30);
      setCountdownMinutes(minutesRemaining);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isConnected = health?.status === 'ok';

  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-50 px-4 lg:px-6 py-3.5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Brand & Market Identity */}
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-cyan-500 via-sky-600 to-emerald-500 p-0.5 flex items-center justify-center shadow-glow-cyan">
            <div className="h-full w-full bg-slate-950 rounded-[10px] flex items-center justify-center">
              <Zap className="h-5 w-5 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                WindScope
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60 uppercase">
                  GB Power Desk
                </span>
              </h1>
              <span className="hidden sm:inline-block text-xs font-mono text-slate-500">
                v1.0.0
              </span>
            </div>
            <p className="text-xs text-slate-400">
              UK Day-Ahead Wind Forecast Accuracy & Thermal Procurement Hedging
            </p>
          </div>
        </div>

        {/* Live Market Indicators & Control Ribbon */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Elexon BMRS Connection Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
            <div className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isConnected ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isConnected ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
            </div>
            <span className="text-slate-400">Elexon BMRS:</span>
            <span className="font-medium text-slate-200 uppercase">
              {health ? health.elexon_api_status : 'Connecting...'}
            </span>
          </div>

          {/* Current Settlement Period */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
            <Activity className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-slate-400 font-sans">Active SP:</span>
            <span className="text-cyan-300 font-bold">SP {currentSp}/48</span>
          </div>

          {/* Gate Closure Countdown */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-slate-400 font-sans">Gate In:</span>
            <span className="text-amber-300 font-bold">{countdownMinutes}m</span>
          </div>

          {/* Live UTC Clock */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span>{currentUtcTime || '--:--:-- UTC'}</span>
          </div>

          {/* Target Delivery Date Selector */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-400">Delivery:</span>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => onDateChange(e.target.value)}
              className="bg-transparent border-0 text-slate-200 text-xs focus:outline-none focus:ring-0 cursor-pointer font-mono"
            />
          </div>

          {/* Refresh Action */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-semibold shadow-glow-cyan transition-all disabled:opacity-50"
            title="Refresh Elexon Feed"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Sync Desk</span>
          </button>
        </div>
      </div>
    </header>
  );
};
