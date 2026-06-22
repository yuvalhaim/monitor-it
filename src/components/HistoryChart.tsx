import React, { useState, useMemo } from 'react';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, Brush,
} from 'recharts';
import { EnergyData } from '../types';
import { Zap, Activity, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { format, subDays } from 'date-fns';

interface HistoryChartProps {
  data: EnergyData[];
  onRangeChange: (range: string) => void;
}

const ACCENT = 'hsl(198, 93%, 59%)';

const AMPERE_LINES = [
  { key: 'al1', name: 'L1', color: '#ef476f' },
  { key: 'al2', name: 'L2', color: '#ffd166' },
  { key: 'al3', name: 'L3', color: '#06d6a0' },
];

const VOLTAGE_LINES = [
  { key: 'vl1', name: 'L1', color: '#ef476f' },
  { key: 'vl2', name: 'L2', color: '#ffd166' },
  { key: 'vl3', name: 'L3', color: '#06d6a0' },
];

const CHART_BG = '#050505';
const BORDER = 'rgba(255,255,255,0.07)';
const MUTED = '#64748b';
const TEXT = '#f1f5f9';

export const HistoryChart: React.FC<HistoryChartProps> = ({ data, onRangeChange }) => {
  const [activeRange, setActiveRange] = useState('today');
  const [hiddenA, setHiddenA] = useState<Record<string, boolean>>({});
  const [hiddenV, setHiddenV] = useState<Record<string, boolean>>({});
  const [customDates, setCustomDates] = useState({
    start: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd'),
  });
  const [fullScreenChart, setFullScreenChart] = useState<'ampere' | 'voltage' | null>(null);

  const isSinglePhase = data.length > 0 && data[0].meter_type === 'EM511';
  const ampLines = isSinglePhase ? AMPERE_LINES.slice(0, 1) : AMPERE_LINES;
  const voltLines = isSinglePhase ? VOLTAGE_LINES.slice(0, 1) : VOLTAGE_LINES;

  const chartData = useMemo(() => {
    return data.map(record => {
      const date = new Date(record.ts);
      return {
        ts: date.getTime(),
        vl1: record.vl1n,
        vl2: record.vl2n,
        vl3: record.vl3n,
        al1: record.AL1 ?? 0,
        al2: record.AL2 ?? 0,
        al3: record.AL3 ?? 0,
      };
    }).sort((a, b) => a.ts - b.ts);
  }, [data]);

  const ampStats = useMemo(() => ampLines.map(l => {
    const vals = chartData.map(d => (d as any)[l.key] as number).filter(v => v != null && !isNaN(v));
    const min = vals.length ? Math.min(...vals) : null;
    const max = vals.length ? Math.max(...vals) : null;
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const fmt = (v: number | null) => v == null ? '—' : v.toFixed(2);
    return { ...l, minFmt: fmt(min), avgFmt: fmt(avg), maxFmt: fmt(max), unit: 'A' };
  }), [chartData]);

  const voltStats = useMemo(() => voltLines.map(l => {
    const vals = chartData.map(d => (d as any)[l.key] as number).filter(v => v != null && !isNaN(v));
    const min = vals.length ? Math.min(...vals) : null;
    const max = vals.length ? Math.max(...vals) : null;
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const fmt = (v: number | null) => v == null ? '—' : v.toFixed(2);
    return { ...l, minFmt: fmt(min), avgFmt: fmt(avg), maxFmt: fmt(max), unit: 'V' };
  }), [chartData]);

  const handleRangeChange = (rangeId: string) => {
    setActiveRange(rangeId);
    if (rangeId === 'custom') {
      onRangeChange(`custom:${customDates.start}:${customDates.end}`);
    } else {
      onRangeChange(rangeId);
    }
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    const newDates = { ...customDates, [type]: value };
    setCustomDates(newDates);
    onRangeChange(`custom:${newDates.start}:${newDates.end}`);
  };

  const tickFmt = (ts: number) => {
    const date = new Date(ts);
    const long = activeRange !== 'today' && activeRange !== 'yesterday';
    return long
      ? date.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      : date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  };

  const ranges = [
    { id: 'today', label: 'היום' },
    { id: 'yesterday', label: 'אתמול' },
    { id: 'week', label: 'שבוע אחרון' },
    { id: 'month', label: 'חודש' },
    { id: 'custom', label: 'טווח מותאם' },
  ];

  // ── Pill toggle buttons ───────────────────────────────────────────────────────
  const PillRow = ({
    lines, hidden, setHidden,
  }: {
    lines: typeof AMPERE_LINES;
    hidden: Record<string, boolean>;
    setHidden: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  }) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {lines.map((l) => {
        const on = !hidden[l.key];
        return (
          <button key={l.key} onClick={() => setHidden(p => ({ ...p, [l.key]: !p[l.key] }))} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 20, cursor: 'pointer',
            fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${on ? l.color : BORDER}`,
            background: on ? `${l.color}22` : 'transparent',
            color: on ? l.color : MUTED,
            transition: 'all 0.15s',
          }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: on ? l.color : MUTED, transition: 'background 0.15s' }} />
            {l.name}
          </button>
        );
      })}
    </div>
  );

  // ── Min / Avg / Max stats row ─────────────────────────────────────────────────
  type StatEntry = { key: string; name: string; color: string; unit: string; minFmt: string; avgFmt: string; maxFmt: string };
  const StatsRow = ({ stats }: { stats: StatEntry[] }) => (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: '12px 40px',
      paddingTop: 14, marginTop: 4,
      borderTop: `1px solid ${BORDER}`,
    }}>
      {(stats as typeof ampStats).map((s) => (
        <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 20, height: 3, borderRadius: 2, background: s.color }} />
            <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 15, fontWeight: 700, color: s.color }}>{s.name}</span>
          </div>
          {[
            { tag: 'min', val: s.minFmt, c: '#34d399' },
            { tag: 'avg', val: s.avgFmt, c: ACCENT },
            { tag: 'max', val: s.maxFmt, c: '#f87171' },
          ].map(({ tag, val, c }) => (
            <span key={tag} style={{ fontFamily: 'DM Mono, monospace', fontSize: 13, color: MUTED }}>
              <span style={{ color: c, fontWeight: 700 }}>{tag} </span>
              {val} <span style={{ opacity: 0.55, fontSize: 12 }}>{s.unit}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );

  // ── Shared chart renderer ─────────────────────────────────────────────────────
  const PhaseChart = ({
    lines, hidden, gradPrefix, unit, tickSuffix,
  }: {
    lines: typeof AMPERE_LINES; hidden: Record<string, boolean>;
    gradPrefix: string; unit: string; tickSuffix: string;
  }) => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <defs>
          {lines.map(l => (
            <linearGradient key={l.key} id={`${gradPrefix}-${l.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={l.color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={l.color} stopOpacity={0.03} />
            </linearGradient>
          ))}
        </defs>
        <XAxis
          dataKey="ts" type="number" domain={['dataMin', 'dataMax']}
          stroke={MUTED} fontSize={11} tickLine={false} axisLine={false}
          tick={{ fill: MUTED, fontFamily: 'DM Mono, monospace' }}
          tickFormatter={tickFmt} minTickGap={60}
        />
        <YAxis
          stroke={MUTED} fontSize={11} tickLine={false} axisLine={false}
          width={1} mirror={true} dx={6} orientation="left"
          tickFormatter={(v: number) => `${v.toFixed(0)}${tickSuffix}`}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--card)', border: `1px solid ${BORDER}`,
            borderRadius: 8, fontFamily: 'DM Mono, monospace', fontSize: 12, color: TEXT,
          }}
          formatter={(v: any, key: any) => {
            const l = lines.find(x => x.key === key);
            return [`${Number(v).toFixed(2)} ${unit}`, l?.name ?? key];
          }}
          labelFormatter={(ts: any) => new Date(ts).toLocaleString('he-IL')}
        />
        <Brush
          dataKey="ts" height={36}
          stroke={BORDER} fill={'var(--card)'} travellerWidth={22}
          tickFormatter={tickFmt}
        />
        {lines.map(l => (
          <Area
            key={l.key} type="monotone" dataKey={l.key}
            stroke={hidden[l.key] ? 'transparent' : l.color}
            strokeWidth={2}
            fill={hidden[l.key] ? 'transparent' : `url(#${gradPrefix}-${l.key})`}
            dot={false} isAnimationActive={false} name={l.key}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-6">

      {/* ── Ampere Chart ──────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'rounded-2xl p-3 md:p-4 shadow-lg transition-all duration-300',
          fullScreenChart === 'ampere' && 'fixed inset-0 md:inset-4 z-[100] flex flex-col'
        )}
        style={{ background: 'var(--card)', border: `1px solid ${BORDER}` }}
      >
        {/* Header */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div style={{ padding: 8, background: 'rgba(239,71,111,0.12)', borderRadius: 8 }}>
              <Activity style={{ width: 20, height: 20, color: '#ef476f' }} />
            </div>
            <h3 style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 17, fontWeight: 700, color: TEXT, letterSpacing: '0.04em', margin: 0 }}>
              מגמות זרם (AMPERE)
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {activeRange === 'custom' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: 12, border: `1px solid ${BORDER}` }}>
                <input type="date" value={customDates.start}
                  onChange={e => handleCustomDateChange('start', e.target.value)}
                  style={{ background: 'transparent', color: TEXT, fontSize: 12, fontWeight: 700, border: 'none', outline: 'none', cursor: 'pointer', fontFamily: 'DM Mono, monospace' }}
                />
                <span style={{ color: MUTED, fontSize: 12 }}>עד</span>
                <input type="date" value={customDates.end}
                  onChange={e => handleCustomDateChange('end', e.target.value)}
                  style={{ background: 'transparent', color: TEXT, fontSize: 12, fontWeight: 700, border: 'none', outline: 'none', cursor: 'pointer', fontFamily: 'DM Mono, monospace' }}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 12, border: `1px solid ${BORDER}` }}>
              {ranges.map(r => (
                <button key={r.id} type="button" onClick={() => handleRangeChange(r.id)} style={{
                  padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700,
                  background: activeRange === r.id ? ACCENT : 'transparent',
                  color: activeRange === r.id ? '#000' : MUTED,
                  border: 'none', transition: 'all 0.15s',
                }}>
                  {r.label}
                </button>
              ))}
            </div>
            <button type="button"
              onClick={() => setFullScreenChart(fullScreenChart === 'ampere' ? null : 'ampere')}
              style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center' }}
              title={fullScreenChart === 'ampere' ? 'מזער' : 'מסך מלא'}>
              {fullScreenChart === 'ampere' ? <Minimize2 style={{ width: 16, height: 16 }} /> : <Maximize2 style={{ width: 16, height: 16 }} />}
            </button>
          </div>
        </div>

        {/* Toggle pills */}
        <div style={{ marginBottom: 12 }}>
          <PillRow lines={ampLines} hidden={hiddenA} setHidden={setHiddenA} />
        </div>

        {/* Chart */}
        <div className={cn('w-full', fullScreenChart === 'ampere' ? 'flex-1' : 'h-[260px] md:h-[440px]')} dir="ltr"
          style={{ background: CHART_BG, borderRadius: 10, overflow: 'hidden' }}>
          <PhaseChart lines={ampLines} hidden={hiddenA} gradPrefix="hc-amp" unit="A" tickSuffix="A" />
        </div>

        {/* Stats */}
        <StatsRow stats={ampStats} />
      </div>

      {/* ── Voltage Chart ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'rounded-2xl p-3 md:p-4 shadow-lg transition-all duration-300',
          fullScreenChart === 'voltage' && 'fixed inset-0 md:inset-4 z-[100] flex flex-col'
        )}
        style={{ background: 'var(--card)', border: `1px solid ${BORDER}` }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ padding: 8, background: `${ACCENT}18`, borderRadius: 8 }}>
              <Zap style={{ width: 20, height: 20, color: ACCENT }} />
            </div>
            <h3 style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 17, fontWeight: 700, color: TEXT, letterSpacing: '0.04em', margin: 0 }}>
              מגמות מתח (VOLTAGE)
            </h3>
          </div>
          <button type="button"
            onClick={() => setFullScreenChart(fullScreenChart === 'voltage' ? null : 'voltage')}
            style={{ background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: MUTED, display: 'flex', alignItems: 'center' }}
            title={fullScreenChart === 'voltage' ? 'מזער' : 'מסך מלא'}>
            {fullScreenChart === 'voltage' ? <Minimize2 style={{ width: 16, height: 16 }} /> : <Maximize2 style={{ width: 16, height: 16 }} />}
          </button>
        </div>

        {/* Toggle pills */}
        <div style={{ marginBottom: 12 }}>
          <PillRow lines={voltLines} hidden={hiddenV} setHidden={setHiddenV} />
        </div>

        {/* Chart */}
        <div className={cn('w-full', fullScreenChart === 'voltage' ? 'flex-1' : 'h-[260px] md:h-[440px]')} dir="ltr"
          style={{ background: CHART_BG, borderRadius: 10, overflow: 'hidden' }}>
          <PhaseChart lines={voltLines} hidden={hiddenV} gradPrefix="hc-volt" unit="V" tickSuffix="V" />
        </div>

        {/* Stats */}
        <StatsRow stats={voltStats} />
      </div>

    </div>
  );
};
