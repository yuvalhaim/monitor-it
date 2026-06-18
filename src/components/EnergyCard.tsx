import React, { useState, useEffect } from 'react';
import { Clock, Zap, Activity } from 'lucide-react';
import { Device, EnergyData } from '../types';
import { cn } from '../lib/utils';

interface EnergyCardProps {
  device: Device;
  data: EnergyData | null;
  onClick?: () => void;
}

export const EnergyCard: React.FC<EnergyCardProps> = ({ device, data, onClick }) => {
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (data) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 600);
      return () => clearTimeout(timer);
    }
  }, [data?.ts]);

  const getStatusColor = () => {
    if (!data) return 'var(--status-offline)';
    const diffMinutes = (Date.now() - new Date(data.ts).getTime()) / (1000 * 60);
    if (diffMinutes < 5)  return 'var(--status-online)';
    if (diffMinutes < 30) return 'var(--status-warning)';
    return 'var(--status-offline)';
  };

  const formatTimeAgo = (dateStr: string) => {
    const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diffMin < 1)  return 'עכשיו';
    if (diffMin < 60) return `לפני ${diffMin} דקות`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `לפני ${diffHours} שעות`;
    return new Date(dateStr).toLocaleDateString('he-IL');
  };

  const isSinglePhase = data?.meter_type === 'EM511';

  const voltageRange = { min: 200, max: 260 };
  const getVoltagePercent = (v: number) => {
    const p = ((v - voltageRange.min) / (voltageRange.max - voltageRange.min)) * 100;
    return Math.min(Math.max(p, 0), 100);
  };

  const maxCurrent = device.max || 100;
  const getCurrentPercent = (a: number) => {
    const p = (a / maxCurrent) * 100;
    return Math.min(Math.max(p, 0), 100);
  };

  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-[var(--card)] rounded-2xl overflow-hidden shadow-lg transition-all duration-300 cursor-pointer group hover:scale-[1.02] border border-[var(--border)]",
        isPulsing && "card-data-pulse"
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div 
              className="w-2.5 h-2.5 rounded-full animate-pulse" 
              style={{ backgroundColor: getStatusColor(), boxShadow: `0 0 8px ${getStatusColor()}` }} 
            />
            <h3 className="text-lg md:text-base font-bold text-[var(--foreground)]">{device.site_name}</h3>
          </div>
          <span className="text-base md:text-sm text-[var(--foreground)] font-medium">
            {data ? formatTimeAgo(data.ts) : 'לא זמין'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-base md:text-sm text-[var(--foreground)]">{device.location}</span>
          {data?.meter_type && (
            <span className="text-xs font-mono text-[var(--foreground)] opacity-50">{data.meter_type}</span>
          )}
        </div>
      </div>

      {/* Last update timestamp */}
      <div className="px-3 py-2 bg-black/5 flex items-center gap-2 text-sm text-[var(--foreground)] border-b border-white/5">
        <Clock className="w-3.5 h-3.5" />
        <span className="font-mono">{data ? new Date(data.ts).toLocaleString('he-IL') : '---'}</span>
      </div>

      {/* Voltage Section */}
      <div className="p-4 space-y-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-base md:text-sm font-bold text-[var(--foreground)] uppercase tracking-wider">מתח (VOLTAGE)</span>
          <Zap className="w-3.5 h-3.5 text-[var(--primary)]" />
        </div>
        {[
          { label: 'L1-N', val: data?.vl1n || 0 },
          ...(!isSinglePhase ? [
            { label: 'L2-N', val: data?.vl2n || 0 },
            { label: 'L3-N', val: data?.vl3n || 0 },
          ] : [])
        ].map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-base md:text-sm font-mono">
              <span className="text-[var(--foreground)]">{item.label}</span>
              <span className="text-[var(--foreground)] font-bold">{item.val.toFixed(1)}V</span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[var(--primary)] rounded-full transition-all duration-1000" 
                style={{ width: `${getVoltagePercent(item.val)}%` }} 
              />
            </div>
          </div>
        ))}
      </div>

      {/* Current Section */}
      <div className="p-4 space-y-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-base md:text-sm font-bold text-[var(--foreground)] uppercase tracking-wider">זרם (CURRENT)</span>
          <Activity className="w-3.5 h-3.5 text-[var(--primary)]" />
        </div>
        {[
          { label: 'L1', val: data?.AL1 || 0 },
          ...(!isSinglePhase ? [
            { label: 'L2', val: data?.AL2 || 0 },
            { label: 'L3', val: data?.AL3 || 0 },
          ] : [])
        ].map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-base md:text-sm font-mono">
              <span className="text-[var(--foreground)]">{item.label}</span>
              <span className="text-[var(--foreground)] font-bold">{item.val.toFixed(1)}A</span>
            </div>
            <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[var(--primary)] rounded-full transition-all duration-1000" 
                style={{ width: `${getCurrentPercent(item.val)}%` }} 
              />
            </div>
          </div>
        ))}
      </div>

      {/* Total Consumption */}
      <div className="p-6 text-center">
        <span className="text-base md:text-sm font-bold text-[var(--foreground)] uppercase tracking-widest block mb-2">סה"כ צריכה</span>
        <div className="text-4xl md:text-4xl font-bold font-mono text-[var(--foreground)] tracking-tighter">
          {data?.kwtot.toLocaleString('he-IL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) || '0.0'} <span className="text-base font-normal text-[var(--foreground)]">kWh</span>
        </div>
      </div>

      {/* T1/T3 Footer — 3-phase only */}
      {!isSinglePhase && (
        <div className="grid grid-cols-2 border-t border-white/5">
          <div className="p-4 text-center border-l border-white/5 bg-black/10">
            <span className="text-base md:text-sm font-bold text-[var(--foreground)] uppercase block mb-1">שפל (T1)</span>
            <div className="text-2xl md:text-xl font-bold font-mono text-[var(--foreground)]">
              {data?.t1?.toLocaleString('he-IL', { maximumFractionDigits: 1 }) || '0'} <span className="text-xs font-normal text-[var(--foreground)]">kWh</span>
            </div>
          </div>
          <div className="p-4 text-center bg-black/10">
            <span className="text-base md:text-sm font-bold text-[var(--foreground)] uppercase block mb-1">פסגה (T3)</span>
            <div className="text-2xl md:text-xl font-bold font-mono text-[var(--foreground)]">
              {data?.t3?.toLocaleString('he-IL', { maximumFractionDigits: 1 }) || '0'} <span className="text-xs font-normal text-[var(--foreground)]">kWh</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
