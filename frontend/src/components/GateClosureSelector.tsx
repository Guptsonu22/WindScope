import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Gauge,
} from 'lucide-react';
import { Badge } from './ui/Badge';
import { Card, CardHeader } from './ui/Card';

export interface GateClosurePreset {
  id: string;
  name: string;
  shortCode: string;
  cutoffTime: string;
  leadTimeHours: number;
  maeMw: number;
  rmseMw: number;
  wmapePct: number;
  p90BufferMw: number;
  status: 'LIVE' | 'SCHEDULED' | 'HISTORICAL';
  description: string;
}

const PRESET_GATES: GateClosurePreset[] = [
  {
    id: 'd1-0700',
    name: 'Early Morning Advisory',
    shortCode: 'D-1 07:00',
    cutoffTime: '07:00 UTC',
    leadTimeHours: 29,
    maeMw: 928,
    rmseMw: 1215,
    wmapePct: 9.3,
    p90BufferMw: 1540,
    status: 'HISTORICAL',
    description: 'Initial breakfast desk run for preliminary fuel stocking and spark spread assessment.',
  },
  {
    id: '11:00',
    name: 'UK Day-Ahead Auction (EPEX / N2EX)',
    shortCode: 'D-1 11:00',
    cutoffTime: '11:00 UTC',
    leadTimeHours: 25,
    maeMw: 742,
    rmseMw: 985,
    wmapePct: 7.4,
    p90BufferMw: 1240,
    status: 'LIVE',
    description: 'Statutory UK Day-Ahead power auction gate closure. The benchmark procurement decision point.',
  },
  {
    id: 'd1-1600',
    name: 'Afternoon Re-balancing Gate',
    shortCode: 'D-1 16:00',
    cutoffTime: '16:00 UTC',
    leadTimeHours: 20,
    maeMw: 615,
    rmseMw: 820,
    wmapePct: 6.2,
    p90BufferMw: 980,
    status: 'SCHEDULED',
    description: 'Post-auction trade notification checkpoint to adjust within-day thermal hedges.',
  },
  {
    id: 'H-4',
    name: 'Intraday 4-Hour Rolling',
    shortCode: 'Intraday H-4',
    cutoffTime: 'Delivery -4h',
    leadTimeHours: 4,
    maeMw: 440,
    rmseMw: 595,
    wmapePct: 4.4,
    p90BufferMw: 710,
    status: 'LIVE',
    description: 'Rolling 4-hour intraday window for CCGT ramp and peaker dispatch optimization.',
  },
  {
    id: 'H-1',
    name: 'Balancing Mechanism Gate (H-1)',
    shortCode: 'Intraday H-1',
    cutoffTime: 'Delivery -1h',
    leadTimeHours: 1,
    maeMw: 295,
    rmseMw: 390,
    wmapePct: 2.9,
    p90BufferMw: 450,
    status: 'LIVE',
    description: 'Final gate closure before National Grid ESO takes control of imbalance settlement.',
  },
];

interface GateClosureSelectorProps {
  selectedGateTime: string;
  onSelectGateTime: (gateTime: string) => void;
}

export const GateClosureSelector: React.FC<GateClosureSelectorProps> = ({
  selectedGateTime,
  onSelectGateTime,
}) => {
  const [showEvolutionInspector, setShowEvolutionInspector] = useState<boolean>(true);

  // Normalize selected id
  const currentGate =
    PRESET_GATES.find(
      (g) =>
        g.id.toLowerCase() === selectedGateTime.toLowerCase() ||
        g.cutoffTime.includes(selectedGateTime) ||
        (selectedGateTime === '11:00' && g.id === '11:00')
    ) || PRESET_GATES[1];

  const baselineMae = PRESET_GATES[0].maeMw;

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader
        title="Auction Gate Closure & Forecast Evolution Inspector"
        subtitle="Simulate forecast accuracy tightening across UK Day-Ahead and Intraday statutory market deadlines"
        badge={
          <Badge variant="cyan" size="sm" dot>
            Elexon Gate Sensitivity
          </Badge>
        }
        action={
          <button
            onClick={() => setShowEvolutionInspector(!showEvolutionInspector)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <span>{showEvolutionInspector ? 'Hide Evolution Analysis' : 'Show Evolution Analysis'}</span>
            {showEvolutionInspector ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        }
      />

      <div className="p-4 space-y-4">
        {/* Gate Closure Toggle Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {PRESET_GATES.map((gate) => {
            const isSelected =
              gate.id.toLowerCase() === selectedGateTime.toLowerCase() ||
              (selectedGateTime === '11:00' && gate.id === '11:00') ||
              (selectedGateTime === '09:00' && gate.id === 'd1-0700') ||
              ((selectedGateTime === 'H-1' || selectedGateTime === 'intraday') && gate.id === 'H-1');

            const accuracyGainPct = Math.round(
              ((baselineMae - gate.maeMw) / baselineMae) * 100
            );

            return (
              <button
                key={gate.id}
                onClick={() => onSelectGateTime(gate.id)}
                className={`text-left p-3.5 rounded-xl border transition-all duration-200 relative overflow-hidden flex flex-col justify-between ${
                  isSelected
                    ? 'bg-slate-900 border-cyan-500 shadow-glow-cyan'
                    : 'bg-slate-900/60 border-slate-800 hover:bg-slate-900/90 hover:border-slate-700'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400" />
                )}

                <div>
                  <div className="flex items-center justify-between gap-1 mb-2">
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                      {gate.shortCode}
                    </span>
                    {gate.id === '11:00' ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/80">
                        Primary DA
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {gate.leadTimeHours}h lead
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-semibold text-slate-100 line-clamp-1 mb-1">
                    {gate.name}
                  </h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                    {gate.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Expected MAE</span>
                    <span className="font-mono font-bold text-cyan-300">{gate.maeMw} MW</span>
                  </div>
                  {accuracyGainPct > 0 && (
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                      +{accuracyGainPct}% tighter
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Dynamic Forecast Evolution Inspector Ribbon */}
        {showEvolutionInspector && (
          <div className="rounded-xl bg-slate-950/80 border border-slate-800/90 p-4 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-cyan-400" />
                <span className="text-xs font-bold text-slate-200">
                  Forecast Evolution Trajectory (Lead-Time Uncertainty Decay)
                </span>
              </div>
              <span className="text-[11px] text-slate-400">
                Active Selection:{' '}
                <span className="text-cyan-300 font-bold font-mono">{currentGate.shortCode}</span>{' '}
                ({currentGate.leadTimeHours} hours before delivery)
              </span>
            </div>

            {/* Stepper Progression Bar */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2 pt-1">
              {PRESET_GATES.map((g) => {
                const isCurrent = g.id === currentGate.id;
                const isPastCurrent = g.leadTimeHours <= currentGate.leadTimeHours;

                return (
                  <div
                    key={g.id}
                    className={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                      isCurrent
                        ? 'bg-cyan-950/40 border-cyan-500/80 text-white'
                        : isPastCurrent
                        ? 'bg-slate-900/40 border-slate-800 text-slate-300'
                        : 'bg-slate-900/20 border-slate-900 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold text-[11px]">{g.shortCode}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {g.leadTimeHours}h
                      </span>
                    </div>

                    <div className="my-2 space-y-1">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">MAE:</span>
                        <span className="font-mono font-bold text-cyan-300">{g.maeMw} MW</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">wMAPE:</span>
                        <span className="font-mono text-amber-300">{g.wmapePct}%</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-slate-400">P90 Buffer:</span>
                        <span className="font-mono text-purple-300">{g.p90BufferMw} MW</span>
                      </div>
                    </div>

                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.round(((baselineMae - g.maeMw) / baselineMae) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
              <strong className="text-slate-300">Trader Insight:</strong> As the auction gate approaches
              from D-1 07:00 to 11:00 GMT, numerical weather prediction error drops by{' '}
              <span className="text-emerald-400 font-bold font-mono">
                {Math.round(((PRESET_GATES[0].maeMw - PRESET_GATES[1].maeMw) / PRESET_GATES[0].maeMw) * 100)}%
              </span>
              , reducing the mandatory P90 reserve buffer from {PRESET_GATES[0].p90BufferMw} MW to{' '}
              {PRESET_GATES[1].p90BufferMw} MW and saving unnecessary thermal spark spread premiums.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
