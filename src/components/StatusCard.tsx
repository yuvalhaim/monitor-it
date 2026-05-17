import React from 'react';
import { Activity, Signal, Clock, ShieldCheck } from 'lucide-react';
import { EnergyData } from '../types';
import { cn } from '../lib/utils';

interface StatusCardProps {
  data: EnergyData | null;
  getStatusColor: (rssi: number) => string;
}

export const StatusCard: React.FC<StatusCardProps> = ({ data, getStatusColor }) => {
  if (!data) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-[var(--card)] p-4 rounded-2xl relative overflow-hidden group shadow-lg border border-[var(--border)]">
        <div className="absolute top-0 left-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
          <Activity className="w-12 h-12 text-[var(--foreground)]" />
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-[var(--primary)]/10 rounded-lg">
            <Activity className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <span className="text-base md:text-sm font-bold text-[var(--muted)] uppercase tracking-wider">סטטוס מערכת</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl md:text-3xl font-bold text-[var(--foreground)] uppercase tracking-tight">מחובר</span>
          <span className="text-sm md:text-xs font-bold text-[var(--status-online)] uppercase tracking-widest">פעיל</span>
        </div>
      </div>

      <div className="bg-[var(--card)] p-4 rounded-2xl relative overflow-hidden group shadow-lg border border-[var(--border)]">
        <div className="absolute top-0 left-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
          <Signal className="w-12 h-12 text-[var(--foreground)]" />
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className={cn("p-2 rounded-lg", getStatusColor(data.rssi).replace('text-', 'bg-').replace('500', '500/10'))}>
            <Signal className={cn("w-5 h-5", getStatusColor(data.rssi))} />
          </div>
          <span className="text-base md:text-sm font-bold text-[var(--muted)] uppercase tracking-wider">עוצמת אות</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl md:text-3xl font-bold text-[var(--foreground)] font-mono">{data.rssi}</span>
          <span className="text-sm md:text-xs font-bold text-[var(--muted)] uppercase tracking-widest">dBm</span>
        </div>
      </div>

      <div className="bg-[var(--card)] p-4 rounded-2xl relative overflow-hidden group shadow-lg border border-[var(--border)]">
        <div className="absolute top-0 left-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
          <Clock className="w-12 h-12 text-[var(--foreground)]" />
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-[var(--primary)]/10 rounded-lg">
            <Clock className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <span className="text-base md:text-sm font-bold text-[var(--muted)] uppercase tracking-wider">עדכון אחרון</span>
        </div>
        <div className="flex flex-col">
          <span className="text-lg md:text-xl font-bold text-[var(--foreground)] font-mono">{new Date(data.ts_getway).toLocaleTimeString('he-IL')}</span>
          <span className="text-sm md:text-xs font-bold text-[var(--muted)] uppercase tracking-widest">{new Date(data.ts_getway).toLocaleDateString('he-IL')}</span>
        </div>
      </div>

      <div className="bg-[var(--card)] p-4 rounded-2xl relative overflow-hidden group shadow-lg border border-[var(--border)]">
        <div className="absolute top-0 left-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
          <ShieldCheck className="w-12 h-12 text-[var(--foreground)]" />
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-orange-500/10 rounded-lg">
            <ShieldCheck className="w-5 h-5 text-orange-500" />
          </div>
          <span className="text-base md:text-sm font-bold text-[var(--muted)] uppercase tracking-wider">גרסת קושחה</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl md:text-3xl font-bold text-[var(--foreground)] font-mono">v{data.fv}</span>
          <span className="text-sm md:text-xs font-bold text-[var(--muted)] uppercase tracking-widest">סוג {data.type}</span>
        </div>
      </div>
    </div>
  );
};
