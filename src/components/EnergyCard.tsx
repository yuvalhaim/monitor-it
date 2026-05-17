import React, { useState, useEffect } from 'react';
import { Monitor, Clock, Zap, Activity } from 'lucide-react';
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
  }, [data?.ts_getway]);

  const getStatusColor = () => {
    if (!data) return 'var(--status-offline)';
    const lastUpdate = new Date(data.ts_getway);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
    
    if (diffMinutes < 5) return 'var(--status-online)';
    if (diffMinutes < 30) return 'var(--status-warning)';
    return 'var(--status-offline)';
  };

  const getMsgColor = () => {
    if (!data) return 'bg-red-500';
    if (data.rssi > -60) return 'bg-[var(--status-online)]';
    if (data.rssi > -80) return 'bg-[var(--status-warning)]';
    return 'bg-red-500';
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    
    if (diffMin < 1) return 'עכשיו';
    if (diffMin < 60) return `לפני ${diffMin} דקות`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `לפני ${diffHours} שעות`;
    return date.toLocaleDateString('he-IL');
  };

  const voltageRange = { min: 200, max: 260 };
  const getVoltagePercent = (v: number) => {
    const p = ((v - voltageRange.min) / (voltageRange.max - voltageRange.min)) * 100;
    return Math.min(Math.max(p, 0), 100);
  };

  const maxCurrent = 100; // Scaled to 100A for progress bar
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
            {data ? formatTimeAgo(data.ts_getway) : 'לא זמין'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-base md:text-sm text-[var(--foreground)]">{device.location}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-base md:text-sm text-[var(--foreground)] font-mono">10/10 msg/h</span>
            <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div className={cn("h-full rounded-full", getMsgColor())} style={{ width: '100%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Device Info */}
      <div className="p-3 bg-black/5 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <Monitor className="w-3.5 h-3.5" />
          <span className="font-mono">192.168.1.{device.id_user % 255}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <span className="font-mono">FW: {data?.fv || '---'}</span>
        </div>
      </div>
      <div className="px-3 py-2 bg-black/5 flex items-center gap-2 text-sm text-[var(--foreground)] border-b border-white/5">
        <Clock className="w-3.5 h-3.5" />
        <span className="font-mono">{data ? new Date(data.ts_getway).toLocaleString('he-IL') : '---'}</span>
      </div>

      {/* Voltage Section */}
      <div className="p-4 space-y-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-base md:text-sm font-bold text-[var(--foreground)] uppercase tracking-wider">מתח (VOLTAGE)</span>
          <Zap className="w-3.5 h-3.5 text-[var(--primary)]" />
        </div>
        {[
          { label: 'L1-N', val: data?.vl1n || 0 },
          { label: 'L2-N', val: data?.vl2n || 0 },
          { label: 'L3-N', val: data?.vl3n || 0 }
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
          { label: 'L2', val: data?.AL2 || 0 },
          { label: 'L3', val: data?.AL3 || 0 }
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

      {/* T1/T3 Footer */}
      <div className="grid grid-cols-2 border-t border-white/5">
        <div className="p-4 text-center border-l border-white/5 bg-black/10">
          <span className="text-base md:text-sm font-bold text-[var(--foreground)] uppercase block mb-1">פיסגה (T1)</span>
          <div className="text-2xl md:text-xl font-bold font-mono text-[var(--foreground)]">
            {data?.kw_t1.toLocaleString('he-IL', { maximumFractionDigits: 1 }) || '0'} <span className="text-xs font-normal text-[var(--foreground)]">kWh</span>
          </div>
        </div>
        <div className="p-4 text-center bg-black/10">
          <span className="text-base md:text-sm font-bold text-[var(--foreground)] uppercase block mb-1">שפל (T3)</span>
          <div className="text-2xl md:text-xl font-bold font-mono text-[var(--foreground)]">
            {data?.kw_t3.toLocaleString('he-IL', { maximumFractionDigits: 1 }) || '0'} <span className="text-xs font-normal text-[var(--foreground)]">kWh</span>
          </div>
        </div>
      </div>
    </div>
  );
};
