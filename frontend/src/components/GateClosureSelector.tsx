import React from 'react';
import { Clock, Lock, PlayCircle } from 'lucide-react';
import { GateClosureOption } from '../types';

interface GateClosureSelectorProps {
  gateClosures: GateClosureOption[];
  selectedGateId: string;
  onSelectGate: (id: string) => void;
}

export const GateClosureSelector: React.FC<GateClosureSelectorProps> = ({
  gateClosures,
  selectedGateId,
  onSelectGate,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {gateClosures.map((gate) => {
        const isSelected = gate.id === selectedGateId;

        const statusBadges = {
          TRADING: {
            text: 'Live Auction',
            bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
            icon: <PlayCircle className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />,
          },
          SCHEDULED: {
            text: 'Scheduled',
            bg: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
            icon: <Clock className="h-3.5 w-3.5 text-sky-400" />,
          },
          LOCKED: {
            text: 'Gate Closed',
            bg: 'bg-slate-800 text-slate-400 border-slate-700',
            icon: <Lock className="h-3.5 w-3.5 text-slate-400" />,
          },
        };

        const badgeInfo = statusBadges[gate.status] || statusBadges.SCHEDULED;

        return (
          <button
            key={gate.id}
            onClick={() => onSelectGate(gate.id)}
            className={`text-left p-3.5 rounded-xl border transition-all duration-200 relative overflow-hidden ${
              isSelected
                ? 'bg-slate-900 border-cyan-500/80 shadow-glow-cyan'
                : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900/90 hover:border-slate-700'
            }`}
          >
            {isSelected && (
              <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-cyan-500 via-sky-400 to-emerald-400" />
            )}

            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                {gate.short_code}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeInfo.bg}`}
              >
                {badgeInfo.icon}
                {badgeInfo.text}
              </span>
            </div>

            <h4 className="text-sm font-semibold text-slate-100 line-clamp-1 mb-1">
              {gate.name}
            </h4>

            <div className="flex items-center justify-between text-xs text-slate-400 font-mono mt-2 pt-2 border-t border-slate-800/60">
              <span className="text-slate-400">Target: {gate.target_date}</span>
              <span className="text-cyan-400 font-semibold">{gate.closure_time}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
