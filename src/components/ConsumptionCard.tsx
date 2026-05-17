import React from 'react';
import { Activity, TrendingUp, Calendar } from 'lucide-react';
import { EnergyData } from '../types';

interface ConsumptionCardProps {
  data: EnergyData | null;
}

export const ConsumptionCard: React.FC<ConsumptionCardProps> = ({ data }) => {
  if (!data) return null;

  return (
    <div className="bg-[var(--card)] rounded-2xl p-4 md:p-6 h-full shadow-lg border border-[var(--border)]">
      <div className="flex items-center justify-between mb-4 md:mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--primary)]/10 rounded-lg">
            <Activity className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <h3 className="text-base md:text-xl font-bold text-[var(--foreground)] tracking-tight uppercase">צריכת חשמל</h3>
        </div>
        <div className="flex items-center gap-2 px-3 py-1 bg-[var(--primary)]/10 rounded-full">
          <TrendingUp className="w-3 h-3 text-[var(--primary)]" />
          <span className="text-xs font-bold text-[var(--primary)] uppercase tracking-widest">זמן אמת</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center py-2 md:py-4 mb-4 md:mb-8 relative">
        <div className="absolute inset-0 flex items-center justify-center opacity-5">
          <Activity className="w-48 h-48 text-[var(--foreground)]" />
        </div>
        <span className="text-6xl md:text-7xl font-bold text-[var(--foreground)] font-mono tracking-tighter mb-2 z-10">{data.kwtot.toLocaleString()}</span>
        <span className="text-base md:text-sm font-bold text-[var(--muted)] uppercase tracking-[0.3em] z-10">סה"כ קוט"ש</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white/5 p-4 rounded-xl border border-[var(--border)] group hover:bg-white/10 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-3 h-3 text-[var(--muted)]" />
            <span className="text-sm md:text-xs font-bold text-[var(--muted)] uppercase tracking-widest">צריכה 30 יום</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl md:text-2xl font-bold text-[var(--foreground)] font-mono">{data.kt30d.toLocaleString()}</span>
            <span className="text-xs text-[var(--muted)] font-bold uppercase">קוט"ש</span>
          </div>
        </div>
        <div className="bg-white/5 p-4 rounded-xl border border-[var(--border)] group hover:bg-white/10 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Calendar className="w-3 h-3 text-[var(--muted)]" />
            <span className="text-sm md:text-xs font-bold text-[var(--muted)] uppercase tracking-widest">צריכה 60 יום</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl md:text-2xl font-bold text-[var(--foreground)] font-mono">{data.kt60d.toLocaleString()}</span>
            <span className="text-xs text-[var(--muted)] font-bold uppercase">קוט"ש</span>
          </div>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-[var(--border)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            <span className="text-base md:text-sm text-[var(--muted)] font-bold">תעו"ז T1 (פסגה)</span>
          </div>
          <span className="text-sm font-bold text-[var(--foreground)] font-mono">{data.kw_t1.toLocaleString()} קוט"ש</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            <span className="text-base md:text-sm text-[var(--muted)] font-bold">תעו"ז T2 (גבע)</span>
          </div>
          <span className="text-sm font-bold text-[var(--foreground)] font-mono">{data.kw_t2.toLocaleString()} קוט"ש</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--status-online)]" />
            <span className="text-base md:text-sm text-[var(--muted)] font-bold">תעו"ז T3 (שפל)</span>
          </div>
          <span className="text-sm font-bold text-[var(--foreground)] font-mono">{data.kw_t3.toLocaleString()} קוט"ש</span>
        </div>
      </div>
    </div>
  );
};
