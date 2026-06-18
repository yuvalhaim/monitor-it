import React from 'react';
import { Zap } from 'lucide-react';
import { EnergyData } from '../types';

interface VoltageCardProps {
  data: EnergyData | null;
}

export const VoltageCard: React.FC<VoltageCardProps> = ({ data }) => {
  if (!data) return null;

  const isSinglePhase = data.meter_type === 'EM511';

  return (
    <div className="bg-[var(--card)] rounded-2xl p-4 md:p-6 h-full shadow-lg border border-[var(--border)]">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-500/10 rounded-lg">
            <Zap className="w-5 h-5 text-orange-500" />
          </div>
          <h3 className="text-base md:text-xl font-bold text-[var(--foreground)] tracking-tight uppercase">
            {isSinglePhase ? 'מתח וזרם חד-פאזי' : 'מתח וזרם תלת-פאזי'}
          </h3>
        </div>
        <div className="hidden sm:flex gap-2">
          <span className="px-2 py-1 bg-white/5 rounded text-xs text-[var(--muted)] font-bold uppercase tracking-widest">RMS SENSING</span>
          <span className="px-2 py-1 bg-white/5 rounded text-xs text-[var(--muted)] font-bold uppercase tracking-widest">50HZ</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-right">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="pb-3 text-sm md:text-xs uppercase tracking-[0.2em] text-[var(--muted)] font-bold">פאזה</th>
              <th className="pb-3 text-sm md:text-xs uppercase tracking-[0.2em] text-[var(--muted)] font-bold text-left">מתח (V)</th>
              <th className="pb-3 text-sm md:text-xs uppercase tracking-[0.2em] text-[var(--muted)] font-bold text-left">זרם (A)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            <tr>
              <td className="py-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                <span className="text-base font-bold text-[var(--foreground)]">פאזה L1</span>
              </td>
              <td className="py-4 text-left font-bold text-base md:text-xl text-[var(--foreground)] font-mono">{data.vl1n.toFixed(1)}</td>
              <td className="py-4 text-left font-bold text-base md:text-xl text-orange-500 font-mono">{data.AL1.toFixed(1)}</td>
            </tr>
            {!isSinglePhase && (
              <tr>
                <td className="py-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                  <span className="text-base font-bold text-[var(--foreground)]">פאזה L2</span>
                </td>
                <td className="py-4 text-left font-bold text-base md:text-xl text-[var(--foreground)] font-mono">{data.vl2n.toFixed(1)}</td>
                <td className="py-4 text-left font-bold text-base md:text-xl text-orange-500 font-mono">{data.AL2.toFixed(1)}</td>
              </tr>
            )}
            {!isSinglePhase && (
              <tr>
                <td className="py-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[var(--primary)] shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  <span className="text-base font-bold text-[var(--foreground)]">פאזה L3</span>
                </td>
                <td className="py-4 text-left font-bold text-base md:text-xl text-[var(--foreground)] font-mono">{data.vl3n.toFixed(1)}</td>
                <td className="py-4 text-left font-bold text-base md:text-xl text-orange-500 font-mono">{data.AL3.toFixed(1)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
