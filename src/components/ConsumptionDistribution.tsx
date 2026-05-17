import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { EnergyData } from '../types';
import { Zap, Activity, Clock } from 'lucide-react';
import { cn } from '../lib/utils';
import { format, eachDayOfInterval, subDays, isSameDay, startOfWeek, endOfWeek, eachWeekOfInterval, isSameWeek } from 'date-fns';

interface ConsumptionDistributionProps {
  data: {
    time: string;
    total: number;
    t1: number;
    t2: number;
    t3: number;
  }[];
}

export const ConsumptionDistribution: React.FC<ConsumptionDistributionProps> = ({ data }) => {
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly'>('weekly');
  const [displayMode, setDisplayMode] = useState<'cumulative' | 'tariff'>('cumulative');
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const chartData = useMemo(() => {
    if (data.length === 0) return [];

    // The data is now pre-calculated from the server as daily totals
    // We just need to filter for the last 7 or 30 days
    const daysToFetch = viewMode === 'weekly' ? 7 : 30;
    
    // Sort by time ascending
    const sortedData = [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    // Take the last N days
    const slicedData = sortedData.slice(-daysToFetch);

    return slicedData.map(d => ({
      name: format(new Date(d.time), 'dd/MM'),
      total: d.total,
      t1: d.t1,
      t2: d.t2,
      t3: d.t3
    }));
  }, [data, viewMode]);

  const stats = useMemo(() => {
    const totals = chartData.map(d => d.total);
    const total = totals.reduce((a, b) => a + b, 0);
    const peak = Math.max(...totals, 0);
    const average = totals.length > 0 ? total / totals.length : 0;

    return { total, peak, average };
  }, [chartData]);

  return (
    <div className="space-y-6">
      <div className="bg-[var(--card)] rounded-2xl p-4 md:p-6 shadow-lg border border-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 mb-4 md:mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--primary)]/10 rounded-lg">
              <Zap className="w-5 h-5 text-[var(--primary)]" />
            </div>
            <div>
              <h3 className="text-xl md:text-lg font-bold text-[var(--foreground)]">התפלגות צריכה</h3>
              <p className="text-sm md:text-xs text-[var(--muted)]">ניתוח צריכה לפי טווחי זמן ותעריפים</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setViewMode('weekly')}
                className={cn(
                  "px-4 py-2 md:py-1.5 rounded-lg text-base md:text-sm font-bold transition-all",
                  viewMode === 'weekly' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                שבועי
              </button>
              <button 
                onClick={() => setViewMode('monthly')}
                className={cn(
                  "px-4 py-2 md:py-1.5 rounded-lg text-base md:text-sm font-bold transition-all",
                  viewMode === 'monthly' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                חודשי
              </button>
            </div>

            <div className="flex items-center gap-1 bg-black/20 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setDisplayMode('cumulative')}
                className={cn(
                  "px-4 py-2 md:py-1.5 rounded-lg text-base md:text-sm font-bold transition-all",
                  displayMode === 'cumulative' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                צריכה מצטברת
              </button>
              <button 
                onClick={() => setDisplayMode('tariff')}
                className={cn(
                  "px-4 py-2 md:py-1.5 rounded-lg text-base md:text-sm font-bold transition-all",
                  displayMode === 'tariff' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                )}
              >
                לפי תעריף
              </button>
            </div>
          </div>
        </div>

        <div className="h-[280px] md:h-[585px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{
                top: 10,
                right: isMobile ? 4 : 10,
                left: isMobile ? 4 : 0,
                bottom: isMobile ? 8 : 0
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.15)" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="var(--muted)"
                fontSize={isMobile ? 10 : 14}
                tickLine={false}
                axisLine={false}
                dy={isMobile ? 6 : 10}
                interval={isMobile && viewMode === 'monthly' ? 4 : 0}
                tick={{ fill: 'var(--muted)' }}
              />
              <YAxis
                stroke="var(--muted)"
                fontSize={isMobile ? 10 : 14}
                tickLine={false}
                axisLine={false}
                dx={isMobile ? -4 : -10}
                width={isMobile ? 44 : 70}
                orientation="right"
                tick={{ fill: 'var(--muted)' }}
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  fontSize: isMobile ? '12px' : '14px',
                  color: 'var(--foreground)',
                  textAlign: 'right'
                }}
                itemStyle={{ color: 'var(--foreground)' }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              {!isMobile && (
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: '20px', fontSize: '14px', color: 'var(--muted)' }}
                />
              )}
              {displayMode === 'cumulative' ? (
                <Bar dataKey="total" name="סה&quot;כ צריכה" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 20 : 40} />
              ) : (
                <>
                  <Bar dataKey="t1" name="T1 פסגה" stackId="a" fill="#ef476f" radius={[0, 0, 0, 0]} maxBarSize={isMobile ? 20 : 40} />
                  <Bar dataKey="t2" name="T2 גבע" stackId="a" fill="#ffd166" radius={[0, 0, 0, 0]} maxBarSize={isMobile ? 20 : 40} />
                  <Bar dataKey="t3" name="T3 שפל" stackId="a" fill="#06d6a0" radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 20 : 40} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary — stacked on mobile, 3 columns on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">

        <div className="bg-white/5 p-4 rounded-xl border border-[var(--border)] hover:bg-white/10 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3 h-3 text-[var(--primary)]" />
            <span className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">סה"כ</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-[var(--foreground)] font-mono">{stats.total.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
            <span className="text-xs text-[var(--muted)] font-bold uppercase">קוט"ש</span>
          </div>
        </div>

        <div className="bg-white/5 p-4 rounded-xl border border-[var(--border)] hover:bg-white/10 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-3 h-3 text-[var(--status-online)]" />
            <span className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">יום שיא</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-[var(--foreground)] font-mono">{stats.peak.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
            <span className="text-xs text-[var(--muted)] font-bold uppercase">קוט"ש</span>
          </div>
        </div>

        <div className="bg-white/5 p-4 rounded-xl border border-[var(--border)] hover:bg-white/10 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3 h-3 text-purple-400" />
            <span className="text-sm font-bold text-[var(--muted)] uppercase tracking-widest">ממוצע יומי</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-[var(--foreground)] font-mono">{stats.average.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
            <span className="text-xs text-[var(--muted)] font-bold uppercase">קוט"ש</span>
          </div>
        </div>

      </div>
    </div>
  );
};
