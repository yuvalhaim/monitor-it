import React from 'react';
import { Activity, Cpu, Clock, Zap } from 'lucide-react';
import { EnergyData } from '../types';

interface StatusCardProps {
  data: EnergyData | null;
  getStatusColor?: (rssi: number) => string;
}

export const StatusCard: React.FC<StatusCardProps> = ({ data }) => {
  if (!data) return null;

  const diffMin = Math.floor((Date.now() - new Date(data.ts).getTime()) / 60000);
  const statusColor = diffMin < 5 ? 'var(--status-online)' : diffMin < 30 ? 'var(--status-warning)' : 'var(--status-offline)';
  const statusLabel = diffMin < 5 ? 'פעיל' : diffMin < 30 ? 'מאחר' : 'לא מחובר';

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
          <span className="text-sm md:text-xs font-bold uppercase tracking-widest" style={{ color: statusColor }}>{statusLabel}</span>
        </div>
      </div>

      <div className="bg-[var(--card)] p-4 rounded-2xl relative overflow-hidden group shadow-lg border border-[var(--border)]">
        <div className="absolute top-0 left-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
          <Cpu className="w-12 h-12 text-[var(--foreground)]" />
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-[var(--primary)]/10 rounded-lg">
            <Cpu className="w-5 h-5 text-[var(--primary)]" />
          </div>
          <span className="text-base md:text-sm font-bold text-[var(--muted)] uppercase tracking-wider">סוג מונה</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl md:text-3xl font-bold text-[var(--foreground)] font-mono">{data.meter_type || '---'}</span>
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
          <span className="text-lg md:text-xl font-bold text-[var(--foreground)] font-mono">{new Date(data.ts).toLocaleTimeString('he-IL')}</span>
          <span className="text-sm md:text-xs font-bold text-[var(--muted)] uppercase tracking-widest">{new Date(data.ts).toLocaleDateString('he-IL')}</span>
        </div>
      </div>

      <div className="bg-[var(--card)] p-4 rounded-2xl relative overflow-hidden group shadow-lg border border-[var(--border)]">
        <div className="absolute top-0 left-0 p-3 opacity-5 group-hover:opacity-10 transition-opacity">
          <Zap className="w-12 h-12 text-[var(--foreground)]" />
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-yellow-500/10 rounded-lg">
            <Zap className="w-5 h-5 text-yellow-500" />
          </div>
          <span className="text-base md:text-sm font-bold text-[var(--muted)] uppercase tracking-wider">סה"כ צריכה</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl md:text-3xl font-bold text-[var(--foreground)] font-mono">{data.kwtot?.toLocaleString('he-IL', { maximumFractionDigits: 1 })}</span>
          <span className="text-sm md:text-xs font-bold text-[var(--muted)] uppercase tracking-widest">kWh</span>
        </div>
      </div>
    </div>
  );
};
