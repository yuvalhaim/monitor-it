import React, { useEffect, useState, useCallback } from "react";
import { RefreshCw, Hash, Clock, Maximize2, X, Download } from "lucide-react";
import { OffJerDevice } from "../types";
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, Brush,
} from "recharts";
import { apiFetch } from "../lib/apiFetch";

interface OffJerPageProps {
  token: string | null;
  isDarkMode?: boolean;
  userProfile: {
    user_name?: string;
    site_name?: string;
    application?: string;
  } | null;
}

interface OffJerReading {
  timestamp: string;
  counter1: number;
  counter2: number;
  counter3: number;
  counter4: number;
  counter5: number;
  counter6: number;
  counter7: number;
  counter8: number;
}

const COUNTER_COLORS = [
  "hsl(198, 93%, 59%)",  // sky blue
  "#34d399",             // green
  "#fbbf24",             // yellow
  "#f87171",             // red
  "#a78bfa",             // purple
  "#fb923c",             // orange
  "#e879f9",             // fuchsia
  "#60a5fa",             // blue
];

const REFRESH_INTERVAL = 60_000;

function toISODate(d: Date) { return d.toISOString().slice(0, 10); }

function getRangeDates(range: string, customFrom: string, customTo: string) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "today")     return { from: today.toISOString(), to: now.toISOString() };
  if (range === "yesterday") {
    const y = new Date(today); y.setDate(y.getDate() - 1);
    return { from: y.toISOString(), to: today.toISOString() };
  }
  if (range === "week") {
    const w = new Date(today); w.setDate(w.getDate() - 7);
    return { from: w.toISOString(), to: now.toISOString() };
  }
  return {
    from: new Date(customFrom).toISOString(),
    to:   new Date(customTo + "T23:59:59").toISOString(),
  };
}

// ── CounterChart ─────────────────────────────────────────────────────────────
function CounterChart({
  counters, readings, loading, C, ACCENT: accent,
}: {
  counters: { key: keyof OffJerReading; label: string; subtitle?: string }[];
  readings: OffJerReading[];
  loading: boolean;
  C: any; ACCENT: string;
}) {
  const [visible,    setVisible]    = useState<Record<string, boolean>>(
    () => Object.fromEntries(counters.map(c => [c.key, true]))
  );
  const [fullscreen, setFullscreen] = useState(false);
  const toggle = (key: string) => setVisible(p => ({ ...p, [key]: !p[key] }));

  const chartData = readings.map(r => {
    const pt: Record<string, any> = { ts: r.timestamp };
    counters.forEach(c => { pt[c.key as string] = r[c.key] != null ? Number(r[c.key]) : null; });
    return pt;
  });

  const stats = counters.map((c, i) => {
    const vals = readings.map(r => r[c.key]).filter(v => v != null).map(v => Number(v)).filter(v => !Number.isNaN(v));
    const min  = vals.length ? Math.min(...vals) : null;
    const max  = vals.length ? Math.max(...vals) : null;
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const fmt  = (v: number | null) => v == null ? "—" : v.toLocaleString();
    return { ...c, color: COUNTER_COLORS[i], subtitle: c.subtitle, minFmt: fmt(min), avgFmt: fmt(mean), maxFmt: fmt(max) };
  });

  const ToggleButtons = () => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {counters.map((c, i) => {
        const on = visible[c.key as string];
        const color = COUNTER_COLORS[i];
        return (
          <button key={c.key as string} onClick={() => toggle(c.key as string)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 20, cursor: "pointer",
            fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 600,
            border: `1.5px solid ${on ? color : C.border}`,
            background: on ? `${color}22` : "transparent",
            color: on ? color : C.muted,
            transition: "all 0.15s",
          }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: on ? color : C.muted, flexShrink: 0 }} />
            <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
              {c.subtitle
                ? <span style={{ fontSize: 12, fontWeight: 700 }}>{c.subtitle}</span>
                : <span style={{ fontSize: 12, fontWeight: 700 }}>{c.label}</span>}
              {c.subtitle && <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.7 }}>{c.label}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );

  const ChartBody = ({ gradPrefix }: { gradPrefix: string }) => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <defs>
          {counters.map((c, i) => (
            <linearGradient key={c.key as string} id={`${gradPrefix}-${c.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={COUNTER_COLORS[i]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={COUNTER_COLORS[i]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <YAxis
          orientation="left"
          stroke={C.muted} fontSize={11} tickLine={false} axisLine={false}
          width={1} mirror={true} dx={6}
          tickFormatter={(v: number) => v.toLocaleString()}
        />
        <XAxis
          dataKey="ts" stroke={C.muted}
          tick={{ fill: C.muted, fontSize: 11, fontFamily: "DM Mono, monospace" }}
          tickLine={false} axisLine={false} minTickGap={60}
          tickFormatter={(v: any) =>
            new Date(v.endsWith?.('Z') ? v : v + 'Z').toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
          }
        />
        <Tooltip
          contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "DM Mono, monospace", fontSize: 12, color: C.muted }}
          labelFormatter={(l: any) => new Date(l.endsWith?.('Z') ? l : l + 'Z').toLocaleString("he-IL")}
          formatter={(v: any, name: any) => {
            const c = counters.find(x => x.key === name);
            return [Number(v).toLocaleString(), c?.label ?? name];
          }}
        />
        <Brush
          dataKey="ts" height={36}
          stroke={C.border} fill={C.inner} travellerWidth={22}
          tickFormatter={(v: any) =>
            new Date(v.endsWith?.('Z') ? v : v + 'Z').toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
          }
        />
        {counters.map((c, i) => (
          <Area
            key={c.key as string}
            type="monotone"
            dataKey={c.key as string}
            name={c.key as string}
            stroke={visible[c.key as string] ? COUNTER_COLORS[i] : "transparent"}
            strokeWidth={2}
            fill={visible[c.key as string] ? `url(#${gradPrefix}-${c.key})` : "transparent"}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );

  const StatsRow = ({ large = false }: { large?: boolean }) => (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: large ? "16px 32px" : "10px 20px",
      paddingTop: large ? 16 : 10,
      borderTop: `1px solid ${large ? "rgba(255,255,255,0.1)" : C.border}`,
    }}>
      {stats.map(s => (
        <div key={s.key as string} style={{ display: "flex", flexDirection: "column", gap: large ? 4 : 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: large ? 4 : 2 }}>
            <div style={{ width: large ? 20 : 14, height: large ? 4 : 3, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {s.subtitle
                ? <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: large ? 18 : 13, fontWeight: 700, color: s.color }}>{s.subtitle}</span>
                : <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: large ? 18 : 13, fontWeight: 700, color: s.color }}>{s.label}</span>}
              {s.subtitle && <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: large ? 12 : 10, fontWeight: 400, color: s.color, opacity: 0.6 }}>{s.label}</span>}
            </span>
          </div>
          {[
            { tag: "min", val: s.minFmt, c: "#34d399" },
            { tag: "avg", val: s.avgFmt, c: accent },
            { tag: "max", val: s.maxFmt, c: "#f87171" },
          ].map(({ tag, val, c }) => (
            <span key={tag} style={{ fontFamily: "DM Mono, monospace", fontSize: large ? 16 : 12, color: C.muted }}>
              <span style={{ color: c, fontWeight: 700 }}>{tag} </span>{val}
            </span>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* ── Fullscreen overlay ── */}
      {fullscreen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#050505",
          display: "flex", flexDirection: "column", padding: "16px 20px" }}>
          {/* header row — capped height on mobile so chart always gets space */}
          <div className="ofjer-fs-hdr" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10, gap: 10, flexShrink: 0 }}>
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: "0.06em", flexShrink: 0, paddingTop: 4 }}>
              גרף ספירות
            </span>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, justifyContent: "flex-end", minWidth: 0 }}>
              {/* scrollable toggle area — never grows past 120px on mobile */}
              <div style={{ overflowY: "auto", maxHeight: 120, display: "flex", flexWrap: "wrap", gap: 6, flex: 1, justifyContent: "flex-end" }}>
                <ToggleButtons />
              </div>
              <button onClick={() => setFullscreen(false)} style={{
                background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "6px 14px", cursor: "pointer", color: C.text,
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600, flexShrink: 0,
              }}>
                <X style={{ width: 15, height: 15 }} /> סגור
              </button>
            </div>
          </div>
          {/* chart — flex:1 + minHeight guarantees it always gets space */}
          <div dir="ltr" style={{ flex: 1, minHeight: 180 }}>
            {loading ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTop: `3px solid ${accent}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              </div>
            ) : readings.length === 0 ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: C.muted, fontSize: 14, fontFamily: "DM Sans, sans-serif" }}>אין נתונים לתקופה זו</span>
              </div>
            ) : <ChartBody gradPrefix="grad-fs" />}
          </div>
          {/* stats — scrollable on mobile if stats overflow */}
          <div style={{ marginTop: 10, overflowX: "auto", flexShrink: 0 }}><StatsRow large /></div>
        </div>
      )}

      {/* ── Inline card ── */}
      <div style={{ background: C.inner, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
          <ToggleButtons />
          <button onClick={() => setFullscreen(true)} title="הגדל גרף" style={{
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "5px 9px", cursor: "pointer", color: C.muted,
            display: "flex", alignItems: "center", flexShrink: 0, transition: "border-color 0.15s, color 0.15s",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accent; (e.currentTarget as HTMLElement).style.color = accent; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted; }}
          >
            <Maximize2 style={{ width: 15, height: 15 }} />
          </button>
        </div>
        {loading ? (
          <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 18, height: 18, border: `2px solid ${C.border}`, borderTop: `2px solid ${accent}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          </div>
        ) : readings.length === 0 ? (
          <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: C.muted, fontSize: 13, fontFamily: "DM Sans, sans-serif" }}>אין נתונים לתקופה זו</span>
          </div>
        ) : (
          <div dir="ltr" style={{ height: 260 }}>
            <ChartBody gradPrefix="grad-inline" />
          </div>
        )}
        <div style={{ marginTop: 10 }}><StatsRow /></div>
      </div>
    </>
  );
}

// ── OffJerPage ────────────────────────────────────────────────────────────────
export function OffJerPage({ token, userProfile, isDarkMode = true }: OffJerPageProps) {
  const [devices,    setDevices]   = useState<OffJerDevice[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [readings,   setReadings]  = useState<OffJerReading[]>([]);
  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Chart / history state
  const [range,       setRange]       = useState<"today" | "yesterday" | "week" | "custom">("today");
  const [customFrom,  setCustomFrom]  = useState(toISODate(new Date()));
  const [customTo,    setCustomTo]    = useState(toISODate(new Date()));
  const [chartData,   setChartData]   = useState<OffJerReading[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [exporting,   setExporting]   = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/ofjer/devices", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data: OffJerDevice[]) => {
        setDevices(data);
        if (data.length > 0) setSelectedId(data[0].id_user);
      })
      .catch(() => {});
  }, [token]);

  const selectedDevice = devices.find(d => d.id_user === selectedId) ?? null;

  // Fetch latest 50 readings (for counter cards + history table)
  const fetchData = useCallback(async (silent = false, deviceId = selectedId) => {
    if (!token || !deviceId) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/ofjer/data?device_id=${deviceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setReadings(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, selectedId]);

  // Fetch chart history for selected range
  const fetchChartData = useCallback(async (deviceId = selectedId) => {
    if (!token || !deviceId) return;
    setChartLoading(true);
    const { from, to } = getRangeDates(range, customFrom, customTo);
    try {
      const res = await apiFetch(
        `/api/ofjer/history?device_id=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setChartData(await res.json());
    } catch { } finally {
      setChartLoading(false);
    }
  }, [token, selectedId, range, customFrom, customTo]);

  useEffect(() => {
    if (selectedId) { fetchData(false, selectedId); fetchChartData(selectedId); }
  }, [selectedId]);

  useEffect(() => {
    if (range !== "custom" && selectedId) fetchChartData(selectedId);
  }, [range, selectedId]);

  useEffect(() => {
    const id = setInterval(() => fetchData(true, selectedId), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData, selectedId]);

  const toDate = (ts: string) => new Date(ts.endsWith('Z') ? ts : ts + 'Z');

  const latest = readings.length > 0 ? readings[readings.length - 1] : null;

  const msgsLastHour = (() => {
    if (readings.length === 0) return 0;
    const lastTs = toDate(readings[readings.length - 1].timestamp).getTime();
    return readings.filter(r => lastTs - toDate(r.timestamp).getTime() <= 60 * 60 * 1000).length;
  })();
  const msgColor = msgsLastHour >= 8 ? "#34d399" : msgsLastHour >= 3 ? "#fbbf24" : "#f87171";

  const ACCENT = "hsl(198, 93%, 59%)";

  const C = isDarkMode ? {
    page:   "hsl(222, 47%, 11%)",
    card:   "hsl(217, 32%, 17%)",
    inner:  "hsl(222, 47%, 9%)",
    border: "hsl(215, 19%, 34%)",
    text:   "hsl(210, 40%, 98%)",
    muted:  "hsl(215, 20%, 60%)",
    sub:    "hsl(215, 20%, 75%)",
  } : {
    page:   "#b8d4e8",
    card:   "#d4e8f6",
    inner:  "#c2daea",
    border: "rgba(0,120,180,0.26)",
    text:   "hsl(222, 47%, 11%)",
    muted:  "hsl(213, 28%, 38%)",
    sub:    "hsl(222, 47%, 20%)",
  };

  const S = {
    page: { background: C.page, minHeight: "100vh", padding: "28px 24px", fontFamily: "DM Sans, sans-serif", color: C.text } as React.CSSProperties,
    card: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 } as React.CSSProperties,
  };

  const counters: { key: keyof OffJerReading; label: string; subtitle?: string }[] = [
    { key: "counter1", label: "ספירה 1", subtitle: "שחיטה 1" },
    { key: "counter2", label: "ספירה 2", subtitle: "חלק 1" },
    { key: "counter3", label: "ספירה 3", subtitle: "שחיטה 2" },
    { key: "counter4", label: "ספירה 4", subtitle: "חלק 2" },
    { key: "counter5", label: "ספירה 5", subtitle: "כשר" },
    { key: "counter6", label: "ספירה 6", subtitle: "מונה בדיקה חלק 1" },
    { key: "counter7", label: "ספירה 7", subtitle: "מונה בדיקה חלק 2" },
    { key: "counter8", label: "ספירה 8" },
  ];

  async function exportCSV() {
    if (exporting || chartData.length === 0) return;
    setExporting(true);
    try {
      const headers = ["timestamp", ...counters.map(c => c.label)];
      const rows = chartData.map(r =>
        [r.timestamp, ...counters.map(c => r[c.key])].join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `ofjer-${customFrom}-${customTo}.csv`; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div dir="rtl" style={S.page}>

      {/* ── Header ── */}
      <div className="ofjer-hdr" style={{ display: "flex", alignItems: "center", marginBottom: devices.length > 0 ? 12 : 28, gap: 12 }}>
        <div className="ofjer-hdr-left" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Hash style={{ color: ACCENT, width: 22, height: 22 }} />
          <h1 style={{ fontFamily: "DM Sans, sans-serif", fontSize: 18, fontWeight: 700, margin: 0, color: C.text }}>
            {selectedDevice?.site_name ?? userProfile?.site_name ?? "מוני ספירה"}
          </h1>
        </div>
        <div className="ofjer-hdr-ts" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
          {latest && (() => {
            const latestTs = toDate(latest.timestamp);
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: msgColor, boxShadow: `0 0 5px ${msgColor}` }} />
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13, color: msgColor, fontWeight: 600 }}>
                    {msgsLastHour} msg/h
                  </span>
                </div>
                <span style={{ color: C.muted, fontSize: 13, fontFamily: "DM Mono, monospace", display: "flex", alignItems: "center", gap: 5 }}>
                  <Clock style={{ width: 13, height: 13 }} />
                  {latestTs.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  {" · "}
                  {latestTs.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" })}
                </span>
              </>
            );
          })()}
        </div>
        <button className="ofjer-hdr-refresh" onClick={() => fetchData(true)} disabled={refreshing}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "6px 12px", cursor: "pointer", color: ACCENT,
            display: "flex", alignItems: "center", gap: 6, fontFamily: "DM Sans, sans-serif" }}>
          <RefreshCw style={{ width: 14, height: 14, animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          <span style={{ fontSize: 14 }}>רענן</span>
        </button>
      </div>

      {/* ── Device selector ── */}
      {devices.length > 0 && (
        <div style={{ ...S.card, padding: "10px 14px", marginBottom: 20 }}>
          <p style={{ color: C.muted, fontSize: 14, fontFamily: "DM Sans, sans-serif",
            textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 8px" }}>
            רשימת מכשירים
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {devices.map(d => (
              <button key={d.id_user} onClick={() => setSelectedId(d.id_user)}
                style={{
                  padding: "6px 16px", borderRadius: 8, cursor: "pointer",
                  fontFamily: "DM Sans, sans-serif",
                  border: `1px solid ${selectedId === d.id_user ? ACCENT : C.border}`,
                  background: selectedId === d.id_user ? `${ACCENT}22` : "transparent",
                  color: selectedId === d.id_user ? ACCENT : C.muted,
                  transition: "all 0.15s",
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
                }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{d.site_name || `מכשיר ${d.id_user}`}</span>
                {d.location && <span style={{ fontSize: 14, fontWeight: 400, opacity: 0.75 }}>{d.location}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: "#f871711a", border: "1px solid #f87171", borderRadius: 12,
          padding: "12px 16px", color: "#f87171", marginBottom: 20, fontSize: 13 }}>{error}</div>
      )}

      {loading && readings.length === 0 ? (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
          <div style={{ textAlign: "center", color: C.muted }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${C.border}`,
              borderTop: `3px solid ${ACCENT}`, borderRadius: "50%",
              animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13 }}>טוען נתונים...</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20,
          opacity: loading ? 0.45 : 1, transition: "opacity 0.2s",
          position: "relative", pointerEvents: loading ? "none" : "auto" }}>
          {loading && (
            <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 20,
              padding: "6px 16px", display: "flex", alignItems: "center", gap: 8,
              fontFamily: "DM Sans, sans-serif", fontSize: 13, color: C.muted,
              boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
              <div style={{ width: 14, height: 14, border: `2px solid ${C.border}`,
                borderTop: `2px solid ${ACCENT}`, borderRadius: "50%",
                animation: "spin 0.7s linear infinite" }} />
              טוען...
            </div>
          )}

          {/* ── 8 counter cards ── */}
          <div className="ofjer-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {counters.map(({ key, label, subtitle }, i) => {
              const val = latest ? (latest[key] as number) : null;
              const color = COUNTER_COLORS[i];
              return (
                <div key={key as string} style={{ ...S.card, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      {subtitle
                        ? <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 15, fontWeight: 700, color: C.text }}>{subtitle}</span>
                        : null}
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: C.muted,
                        textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
                    </span>
                  </div>
                  {val !== null ? (
                    <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 52, lineHeight: 1, color }}>
                      {val.toLocaleString()}
                    </span>
                  ) : (
                    <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 18, color: C.muted }}>—</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Chart card ── */}
          <div style={S.card}>
            {/* Range selector + CSV */}
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`,
              display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {(["today", "yesterday", "week", "custom"] as const).map(r => (
                <button key={r} onClick={() => setRange(r)}
                  style={{
                    padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                    fontFamily: "DM Sans, sans-serif", fontSize: 13,
                    border: `1px solid ${range === r ? ACCENT : C.border}`,
                    background: range === r ? `${ACCENT}22` : "transparent",
                    color: range === r ? ACCENT : C.muted,
                    transition: "all 0.15s",
                  }}>
                  {r === "today" ? "היום" : r === "yesterday" ? "אתמול" : r === "week" ? "שבוע" : "טווח מותאם"}
                </button>
              ))}
              {range === "custom" && (
                <>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    style={{ background: C.inner, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", color: C.text, fontFamily: "DM Mono, monospace", fontSize: 13, colorScheme: isDarkMode ? "dark" : "light" }} />
                  <span style={{ color: C.muted, fontSize: 13 }}>עד</span>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    style={{ background: C.inner, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", color: C.text, fontFamily: "DM Mono, monospace", fontSize: 13, colorScheme: isDarkMode ? "dark" : "light" }} />
                  <button onClick={() => fetchChartData()}
                    style={{ padding: "5px 14px", borderRadius: 8, cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontSize: 13, border: `1px solid ${ACCENT}`, background: `${ACCENT}22`, color: ACCENT }}>
                    הצג
                  </button>
                </>
              )}
              <button onClick={exportCSV} disabled={chartData.length === 0 || exporting}
                style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 8, cursor: chartData.length > 0 ? "pointer" : "not-allowed", fontFamily: "DM Sans, sans-serif", fontSize: 13, border: `1px solid ${C.border}`, background: "transparent", color: chartData.length > 0 ? C.sub : C.muted, display: "flex", alignItems: "center", gap: 6, opacity: chartData.length > 0 ? 1 : 0.45 }}>
                <Download style={{ width: 14, height: 14 }} />
                {exporting ? "..." : "CSV"}
              </button>
            </div>

            <div style={{ padding: "12px 16px" }}>
              <CounterChart
                counters={counters}
                readings={chartData}
                loading={chartLoading}
                C={C}
                ACCENT={ACCENT}
              />
            </div>
          </div>

          {/* ── History table ── */}
          <div style={S.card}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
              <p style={{ color: C.text, fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
                היסטוריה — {readings.length} קריאות
              </p>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 380, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "DM Sans, sans-serif" }}>
                <thead style={{ position: "sticky", top: 0 }}>
                  <tr style={{ background: C.inner }}>
                    {["#", "זמן"].map(h => (
                      <th key={h} style={{ padding: "10px 16px", textAlign: "right",
                        color: C.text, fontWeight: 600, whiteSpace: "nowrap", fontSize: 12 }}>{h}</th>
                    ))}
                    {counters.map((c, i) => (
                      <th key={c.key as string} style={{ padding: "10px 16px", textAlign: "right",
                        color: COUNTER_COLORS[i], fontWeight: 600, whiteSpace: "nowrap", fontSize: 12 }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {c.subtitle
                            ? <span style={{ fontSize: 13 }}>{c.subtitle}</span>
                            : <span style={{ fontSize: 13 }}>{c.label}</span>}
                          {c.subtitle && <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.65 }}>{c.label}</span>}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...readings].reverse().map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 16px", color: C.muted }}>{i + 1}</td>
                      <td style={{ padding: "8px 16px", color: C.text, whiteSpace: "nowrap" }}>
                        {toDate(r.timestamp).toLocaleString("he-IL")}
                      </td>
                      {counters.map(({ key }, ci) => (
                        <td key={key as string} style={{ padding: "8px 16px",
                          fontFamily: "Bebas Neue, sans-serif", fontSize: 20,
                          color: COUNTER_COLORS[ci] }}>
                          {Number(r[key]).toLocaleString()}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        .ofjer-grid { grid-template-columns: repeat(4, 1fr); }
        @media(max-width:900px) { .ofjer-grid { grid-template-columns: repeat(2, 1fr)!important; } }
        @media(max-width:600px) {
          .ofjer-grid { grid-template-columns: 1fr 1fr!important; }
          .ofjer-hdr { flex-wrap:wrap!important; gap:8px!important; }
          .ofjer-hdr-left { flex:1!important; order:1; min-width:0; }
          .ofjer-hdr-refresh { order:2; flex-shrink:0; }
          .ofjer-hdr-ts { order:3; width:100%!important; margin-left:0!important; background:${C.inner}; border:1px solid ${C.border}; border-radius:12px; padding:10px 14px!important; justify-content:flex-start!important; }
          .ofjer-hdr-ts span { font-size:15px!important; color:${C.text}!important; }
        }
      `}</style>
    </div>
  );
}
