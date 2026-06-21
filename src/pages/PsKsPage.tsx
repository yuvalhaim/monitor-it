import React, { useEffect, useState, useCallback } from "react";
import { Tank, Silo, Gauge } from "../components/iot-widgets";
import { PsKsDevice } from "../types";
import { RefreshCw, Waves, Clock, TrendingUp, TrendingDown, Minus, Maximize2, X, Activity, Battery, Signal } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Brush,
  BarChart, Bar
} from "recharts";
import { format, subDays } from "date-fns";
import { apiFetch } from "../lib/apiFetch";

interface PsKsPageProps {
  token: string | null;
  isDarkMode?: boolean;
  userProfile: {
    user_name?: string;
    site_name?: string;
    application?: string;
    cast_num?: number | null;
    unit?: string | null;
    min?: number | null;
    max?: number | null;
    alert_low?: number | null;
    alert_high?: number | null;
    widget_type?: string | null;
    Display_Graph?: boolean;
  } | null;
}

interface Reading {
  timestamp: string;
  level:     number;
  battery:   number;
  signal:    number;
  interrupt: number;
}

const RANGES = [
  { id: "today",     label: "היום",        days: 1 },
  { id: "yesterday", label: "אתמול",       days: 2 },
  { id: "week",      label: "שבוע אחרון",  days: 7 },
  { id: "month",     label: "חודש",        days: 30 },
  { id: "custom",    label: "טווח מותאם",  days: 0 },
];

const REFRESH_INTERVAL = 60_000;
const BATTERY_COLOR = "#34d399";
const SIGNAL_COLOR  = "#60a5fa";

export function PsKsPage({ token, userProfile, isDarkMode = true }: PsKsPageProps) {
  const [devices,      setDevices]     = useState<PsKsDevice[]>([]);
  const [selectedId,   setSelectedId]  = useState<number | null>(null);
  const [readings,     setReadings]    = useState<Reading[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState<string | null>(null);
  const [refreshing,   setRefreshing]  = useState(false);
  const [activeRange,  setActiveRange] = useState("today");
  const [isFullscreen,       setIsFullscreen]     = useState(false);
  const [dailyConsumption,   setDailyConsumption] = useState<{ day: string; consumption: number }[]>([]);
  const [consumptionView,    setConsumptionView]  = useState<'weekly' | 'monthly'>('weekly');
  const [fillings,           setFillings]         = useState<{ timestamp: string; Device_ID: number; fill_start: number; fill_stop: number; fill_total: number }[]>([]);
  const [customDates,  setCustomDates] = useState({
    start: format(subDays(new Date(), 7), "yyyy-MM-dd"),
    end:   format(new Date(), "yyyy-MM-dd"),
  });

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/psks/devices", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data: PsKsDevice[]) => {
        setDevices(data);
        if (data.length > 0) setSelectedId(data[0].id_user);
      })
      .catch(() => {});
  }, [token]);

  const selectedDevice = devices.find(d => d.id_user === selectedId) ?? null;

  const cfg = {
    unit:       selectedDevice?.unit        ?? userProfile?.unit        ?? "mm",
    min:        selectedDevice?.min         ?? userProfile?.min         ?? 0,
    max:        selectedDevice?.max         ?? userProfile?.max         ?? 10000,
    alertLow:   selectedDevice?.alert_low   ?? userProfile?.alert_low   ?? 500,
    alertHigh:  selectedDevice?.alert_high  ?? userProfile?.alert_high  ?? 9000,
    widgetType: selectedDevice?.widget_type ?? userProfile?.widget_type ?? "tank",
    showGraph:  selectedDevice?.Display_Graph ?? userProfile?.Display_Graph ?? false,
  };

  const buildUrl = useCallback((range: string, dates: typeof customDates, deviceId: number | null) => {
    if (!deviceId) return null;
    const base = `/api/psks/data?device_id=${deviceId}`;
    if (!cfg.showGraph) return base;
    if (range === "custom") return `${base}&start=${dates.start}&end=${dates.end}`;
    const r = RANGES.find(x => x.id === range);
    return `${base}&days=${r?.days ?? 1}`;
  }, [cfg.showGraph]);

  const fetchData = useCallback(async (silent = false, range = activeRange, dates = customDates, deviceId = selectedId) => {
    if (!token || !deviceId) return;
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const url = buildUrl(range, dates, deviceId);
      if (!url) return;
      const res = await apiFetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      setReadings(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, activeRange, customDates, selectedId, buildUrl]);

  const fetchDailyConsumption = useCallback(async (deviceId: number | null) => {
    if (!token || !deviceId) return;
    try {
      const res = await apiFetch(`/api/psks/daily-consumption?device_id=${deviceId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDailyConsumption(await res.json());
    } catch {}
  }, [token]);

  const fetchFillings = useCallback(async (deviceId: number | null) => {
    if (!token || !deviceId) return;
    try {
      const res = await apiFetch(`/api/psks/fillings?device_id=${deviceId}&days=30`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setFillings(await res.json());
    } catch {}
  }, [token]);

  useEffect(() => {
    if (selectedId) fetchData(false, activeRange, customDates, selectedId);
  }, [activeRange, customDates, selectedId]);

  useEffect(() => {
    const id = setInterval(() => fetchData(true, activeRange, customDates, selectedId), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData, selectedId]);

  useEffect(() => {
    fetchDailyConsumption(selectedId);
    fetchFillings(selectedId);
  }, [selectedId]);

  const latestLevel   = readings.length > 0 ? readings[readings.length - 1].level   : null;
  const latestBattery = readings.length > 0 ? readings[readings.length - 1].battery : null;
  const latestSignal  = readings.length > 0 ? readings[readings.length - 1].signal  : null;
  const latestInterrupt = readings.length > 0 ? readings[readings.length - 1].interrupt : null;

  const minLevel = readings.length > 0 ? Math.min(...readings.map(r => r.level)) : null;
  const maxLevel = readings.length > 0 ? Math.max(...readings.map(r => r.level)) : null;
  const avgLevel = readings.length > 0
    ? Math.round(readings.reduce((s, r) => s + r.level, 0) / readings.length)
    : null;

  const trendReading = readings.length > 10 ? readings[readings.length - 11].level : null;
  const trend = latestLevel !== null && trendReading !== null
    ? latestLevel > trendReading + 5 ? "up" : latestLevel < trendReading - 5 ? "down" : "flat"
    : "flat";

  const renderWidget = () => {
    if (latestLevel === null) return null;
    const props = { value: latestLevel, min: cfg.min, max: cfg.max, unit: cfg.unit, alertLow: cfg.alertLow, alertHigh: cfg.alertHigh, isDarkMode };
    if (cfg.widgetType === "silo")  return <Silo  {...props} />;
    if (cfg.widgetType === "gauge") return <Gauge {...props} />;
    return <Tank {...props} />;
  };

  const toDate = (ts: string) => new Date(ts.endsWith('Z') ? ts : ts + 'Z');

  const msgsLastHour = (() => {
    if (readings.length === 0) return 0;
    const lastTs = toDate(readings[readings.length - 1].timestamp).getTime();
    return readings.filter(r => lastTs - toDate(r.timestamp).getTime() <= 60 * 60 * 1000).length;
  })();
  const msgColor = msgsLastHour >= 8 ? "#34d399" : msgsLastHour >= 3 ? "#fbbf24" : "#f87171";

  const chartData = readings.map(r => ({
    ts:      toDate(r.timestamp).getTime(),
    v:       r.level,
    battery: r.battery,
  }));

  const isLongRange = activeRange !== "today" && activeRange !== "yesterday";
  const xFormatter  = (ts: number) => {
    const d = new Date(ts);
    return isLongRange
      ? d.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  };

  const signalBars = latestSignal !== null ? Math.round((latestSignal / 31) * 5) : 0;
  const signalPct  = latestSignal !== null ? Math.round((latestSignal / 31) * 100) : 0;
  const batteryColor = latestBattery === null ? "#64748b"
    : latestBattery >= 3.6 ? "#34d399"
    : latestBattery >= 3.2 ? "#fbbf24"
    : "#f87171";

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

  const ACCENT = "hsl(198, 93%, 59%)";

  const S = {
    page:       { background: C.page, minHeight: "100vh", padding: "28px 24px", fontFamily: "DM Sans, sans-serif", color: C.text } as React.CSSProperties,
    card:       { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16 } as React.CSSProperties,
    muted:      { color: C.muted } as React.CSSProperties,
    sectionHdr: { color: C.text, fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.1em", margin: 0 },
  };

  const RangeButtons = () => (
    <div style={{ display: "flex", alignItems: "center", gap: 2,
      background: isDarkMode ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.06)",
      padding: 4, borderRadius: 10, border: `1px solid ${C.border}` }}>
      {RANGES.map(r => (
        <button key={r.id} onClick={() => setActiveRange(r.id)}
          style={{
            padding: "6px 14px", borderRadius: 7, fontSize: 14, cursor: "pointer",
            fontFamily: "DM Sans, sans-serif", fontWeight: 700,
            background: activeRange === r.id ? ACCENT : "transparent",
            border: "none",
            color: activeRange === r.id ? "#fff" : C.muted,
            transition: "all 0.15s",
          }}>
          {r.label}
        </button>
      ))}
    </div>
  );

  const CustomDatePicker = () => activeRange === "custom" ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8,
      background: isDarkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.06)",
      padding: "4px 10px", borderRadius: 10, border: `1px solid ${C.border}` }}>
      <input type="date" value={customDates.start}
        onChange={e => setCustomDates(d => ({ ...d, start: e.target.value }))}
        style={{ background: "transparent", border: "none", outline: "none",
          color: C.text, fontFamily: "DM Sans, sans-serif", fontSize: 13, cursor: "pointer" }} />
      <span style={{ color: C.muted, fontSize: 12 }}>עד</span>
      <input type="date" value={customDates.end}
        onChange={e => setCustomDates(d => ({ ...d, end: e.target.value }))}
        style={{ background: "transparent", border: "none", outline: "none",
          color: C.text, fontFamily: "DM Sans, sans-serif", fontSize: 13, cursor: "pointer" }} />
    </div>
  ) : null;

  return (
    <div dir="rtl" style={S.page}>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <div className="psks-hdr" style={{ display: "flex", alignItems: "center", marginBottom: devices.length > 0 ? 12 : 28, gap: 12 }}>
        <div className="psks-hdr-left" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Waves style={{ color: ACCENT, width: 22, height: 22 }} />
          <h1 style={{ fontFamily: "DM Sans, sans-serif", fontSize: 18, fontWeight: 700, margin: 0, color: C.text }}>
            {selectedDevice?.site_name ?? userProfile?.site_name ?? "מערכת מפלס PS-KS"}
          </h1>
        </div>
        <div className="psks-hdr-ts" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
          {readings.length > 0 && (() => {
            const latestTs = toDate(readings[readings.length - 1].timestamp);
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
        <button className="psks-hdr-refresh" onClick={() => fetchData(true)} disabled={refreshing}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "6px 12px", cursor: "pointer", color: ACCENT,
            display: "flex", alignItems: "center", gap: 6, fontFamily: "DM Sans, sans-serif" }}>
          <RefreshCw style={{ width: 14, height: 14, animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          <span style={{ fontSize: 14 }}>רענן</span>
        </button>
      </div>

      {/* ── Device selector ───────────────────────────────────────────────────── */}
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
                {d.location && <span style={{ fontSize: 16, fontWeight: 400, opacity: 0.75 }}>{d.location}</span>}
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
          <div style={{ textAlign: "center", ...S.muted }}>
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
              fontFamily: "DM Sans, sans-serif", fontSize: 13, color: C.muted, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
              <div style={{ width: 14, height: 14, border: `2px solid ${C.border}`, borderTop: `2px solid ${ACCENT}`,
                borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              טוען...
            </div>
          )}

          {/* ── Row 1: Widget + Values + Status badges ──────────────────────── */}
          <div className="psks-widget-card" style={{ ...S.card, padding: "28px 32px", overflow: "hidden" }}>
            <div className="psks-widget-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "center" }}>

              <div className="psks-gauge-outer">
                <div className={cfg.widgetType === "tank" || cfg.widgetType === "silo" ? "psks-vessel-box" : "psks-gauge-box"}>
                  <div className={cfg.widgetType === "tank" || cfg.widgetType === "silo" ? "psks-vessel-scale" : "psks-gauge-scale"}>
                    {renderWidget()}
                  </div>
                </div>
              </div>

              <div className="psks-value-col" style={{ textAlign: "center", borderRight: `1px solid ${C.border}`, paddingRight: 32 }}>

                <p style={{ color: C.muted, fontSize: 13, fontFamily: "DM Sans, sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                  מפלס
                </p>

                {latestLevel !== null ? (
                  <>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10 }}>
                      <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 96, lineHeight: 1, color: C.text }}>
                        {latestLevel.toLocaleString()}
                      </span>
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 22, fontWeight: 600, color: C.text, marginBottom: 10 }}>
                        {cfg.unit}
                      </span>
                      <span style={{ marginBottom: 14, display: "flex", alignItems: "center" }}>
                        {trend === "up"   && <TrendingUp   style={{ color: "#34d399", width: 28, height: 28 }} />}
                        {trend === "down" && <TrendingDown style={{ color: "#f87171", width: 28, height: 28 }} />}
                        {trend === "flat" && <Minus        style={{ color: C.muted,   width: 28, height: 28 }} />}
                      </span>
                    </div>

                    {/* Battery + Signal + Interrupt badges */}
                    <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                      {latestBattery !== null && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
                          background: `${batteryColor}18`, border: `1px solid ${batteryColor}44`,
                          borderRadius: 10, padding: "6px 14px" }}>
                          <Battery style={{ width: 14, height: 14, color: batteryColor }} />
                          <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 22, color: batteryColor, lineHeight: 1 }}>
                            {latestBattery.toFixed(2)}
                          </span>
                          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: batteryColor, fontWeight: 600 }}>V</span>
                        </div>
                      )}
                      {latestSignal !== null && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
                          background: `${SIGNAL_COLOR}18`, border: `1px solid ${SIGNAL_COLOR}44`,
                          borderRadius: 10, padding: "6px 14px" }}>
                          <Signal style={{ width: 14, height: 14, color: SIGNAL_COLOR }} />
                          <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 22, color: SIGNAL_COLOR, lineHeight: 1 }}>
                            {signalPct}%
                          </span>
                          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: SIGNAL_COLOR, fontWeight: 600 }}>
                            ({latestSignal}/31)
                          </span>
                        </div>
                      )}
                      {latestInterrupt !== null && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6,
                          background: latestInterrupt ? "#f8717118" : "#34d39918",
                          border: `1px solid ${latestInterrupt ? "#f87171" : "#34d399"}44`,
                          borderRadius: 10, padding: "6px 14px" }}>
                          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 700,
                            color: latestInterrupt ? "#f87171" : "#34d399" }}>
                            {latestInterrupt ? "⚡ interrupt" : "✓ רגיל"}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="psks-stats-row" style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
                      {[
                        { label: "מינימום", value: minLevel?.toLocaleString(), icon: "↓", color: "#34d399" },
                        { label: "מקסימום", value: maxLevel?.toLocaleString(), icon: "↑", color: "#f87171" },
                        { label: "ממוצע",   value: avgLevel?.toLocaleString(), icon: "≈", color: ACCENT },
                      ].map(({ label, value, icon, color }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 8px" }}>
                          <p style={{ color: C.text, fontSize: 14, fontFamily: "DM Sans, sans-serif", fontWeight: 500, margin: 0 }}>{label}</p>
                          <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 36, color }}>
                            {icon} {value} <span style={{ fontSize: 18, color: C.text, fontFamily: "DM Sans, sans-serif", fontWeight: 600 }}>{cfg.unit}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p style={{ color: C.muted, fontFamily: "DM Sans, sans-serif", marginTop: 8 }}>אין נתונים</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Row 2: Level graph (when Display_Graph enabled) ──────────────── */}
          {cfg.showGraph && (
            <>
              {isFullscreen && (
                <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#050505",
                  display: "flex", flexDirection: "column", padding: "16px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ padding: 8, background: `${ACCENT}18`, borderRadius: 8 }}>
                        <Activity style={{ width: 18, height: 18, color: ACCENT }} />
                      </div>
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: "0.06em" }}>גרף מפלס</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <CustomDatePicker />
                      <RangeButtons />
                      <button onClick={() => setIsFullscreen(false)} style={{ background: "transparent", border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: "6px 14px", cursor: "pointer", color: C.text,
                        display: "flex", alignItems: "center", gap: 6, fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600 }}>
                        <X style={{ width: 15, height: 15 }} /> סגור
                      </button>
                    </div>
                  </div>
                  <div dir="ltr" style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="psksGradFs" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor={ACCENT} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={ACCENT} stopOpacity={0}   />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="ts" type="number" domain={["auto","auto"]} tickFormatter={xFormatter}
                          stroke={C.muted} fontSize={14} tickLine={false} axisLine={false} dy={10} />
                        <YAxis orientation="left" stroke={C.muted} fontSize={12} tickLine={false} axisLine={false}
                          width={1} mirror={true} dx={6} domain={[cfg.min, cfg.max]} tickFormatter={v => v.toLocaleString()} />
                        <Tooltip labelFormatter={ts => new Date(ts as number).toLocaleString("he-IL")}
                          contentStyle={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, textAlign: "right", color: C.text, fontFamily: "DM Sans, sans-serif" }}
                          itemStyle={{ color: C.text }}
                          formatter={(v: any) => [`${Number(v).toLocaleString()} ${cfg.unit}`, "מפלס"]} />
                        <ReferenceLine y={cfg.alertHigh} stroke="#f8717166" strokeDasharray="4 4" />
                        <ReferenceLine y={cfg.alertLow}  stroke="#fbbf2466" strokeDasharray="4 4" />
                        <Area type="monotone" dataKey="v" stroke={ACCENT} strokeWidth={2}
                          fill="url(#psksGradFs)" dot={false} activeDot={{ r: 4, fill: ACCENT }} isAnimationActive={false} />
                        <Brush dataKey="ts" height={36} stroke={C.border} fill={C.inner} travellerWidth={22} tickFormatter={xFormatter} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              <div style={S.card}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 16px", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ padding: 8, background: `${ACCENT}18`, borderRadius: 8 }}>
                      <Activity style={{ width: 18, height: 18, color: ACCENT }} />
                    </div>
                    <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 15, fontWeight: 700,
                      color: C.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>גרף מפלס</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <CustomDatePicker />
                    <RangeButtons />
                    <button onClick={() => setIsFullscreen(true)} title="הגדל גרף"
                      style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
                        padding: "5px 9px", cursor: "pointer", color: C.muted, display: "flex", alignItems: "center" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = ACCENT; (e.currentTarget as HTMLElement).style.color = ACCENT; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted; }}>
                      <Maximize2 style={{ width: 15, height: 15 }} />
                    </button>
                  </div>
                </div>
                <div style={{ padding: "8px 4px 4px", height: 420 }} dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="psksGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={ACCENT} stopOpacity={0.2} />
                          <stop offset="95%" stopColor={ACCENT} stopOpacity={0}   />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"} vertical={false} />
                      <XAxis dataKey="ts" type="number" domain={["auto","auto"]} tickFormatter={xFormatter}
                        stroke={C.muted} fontSize={14} tickLine={false} axisLine={false} dy={10} />
                      <YAxis orientation="left" stroke={C.muted} fontSize={12} tickLine={false} axisLine={false}
                        width={1} mirror={true} dx={6} domain={[cfg.min, cfg.max]} tickFormatter={v => v.toLocaleString()} />
                      <Tooltip labelFormatter={ts => new Date(ts as number).toLocaleString("he-IL")}
                        contentStyle={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, textAlign: "right", color: C.text, fontFamily: "DM Sans, sans-serif" }}
                        itemStyle={{ color: C.text }}
                        formatter={(v: any) => [`${Number(v).toLocaleString()} ${cfg.unit}`, "מפלס"]} />
                      <ReferenceLine y={cfg.alertHigh} stroke="#f8717166" strokeDasharray="4 4" />
                      <ReferenceLine y={cfg.alertLow}  stroke="#fbbf2466" strokeDasharray="4 4" />
                      <Area type="monotone" dataKey="v" stroke={ACCENT} strokeWidth={2}
                        fill="url(#psksGrad)" dot={false} activeDot={{ r: 4, fill: ACCENT }} isAnimationActive={false} />
                      <Brush dataKey="ts" height={36} stroke={C.border} fill={C.inner} travellerWidth={22} tickFormatter={xFormatter} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}

          {/* ── Row 3: Battery graph — always visible (solar panel health) ───── */}
          <div style={S.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 16px", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ padding: 8, background: `${BATTERY_COLOR}18`, borderRadius: 8 }}>
                  <Battery style={{ width: 18, height: 18, color: BATTERY_COLOR }} />
                </div>
                <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 15, fontWeight: 700,
                  color: C.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>מתח סוללה — פאנל סולארי</span>
              </div>
              {latestBattery !== null && (
                <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 28, color: batteryColor }}>
                  {latestBattery.toFixed(2)} V
                </span>
              )}
            </div>
            <div style={{ padding: "8px 4px 4px", height: 260 }} dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="psksGradBat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={BATTERY_COLOR} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={BATTERY_COLOR} stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"} vertical={false} />
                  <XAxis dataKey="ts" type="number" domain={["auto","auto"]} tickFormatter={xFormatter}
                    stroke={C.muted} fontSize={12} tickLine={false} axisLine={false} dy={8} />
                  <YAxis orientation="left" stroke={C.muted} fontSize={11} tickLine={false} axisLine={false}
                    width={1} mirror={true} dx={6}
                    domain={([dataMin, dataMax]: [number, number]) => [
                      Math.max(0, parseFloat((dataMin - 0.2).toFixed(1))),
                      parseFloat((dataMax + 0.2).toFixed(1))
                    ]}
                    tickFormatter={(v: number) => v.toFixed(1)} />
                  <Tooltip labelFormatter={ts => new Date(ts as number).toLocaleString("he-IL")}
                    contentStyle={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, textAlign: "right", color: C.text, fontFamily: "DM Sans, sans-serif" }}
                    itemStyle={{ color: BATTERY_COLOR }}
                    formatter={(v: any) => [`${Number(v).toFixed(2)} V`, "סוללה"]} />
                  <ReferenceLine y={3.2} stroke="#fbbf2466" strokeDasharray="4 4" label={{ value: "3.2V", fill: "#fbbf24", fontSize: 11, position: "insideTopRight" }} />
                  <ReferenceLine y={3.0} stroke="#f8717166" strokeDasharray="4 4" label={{ value: "3.0V", fill: "#f87171", fontSize: 11, position: "insideTopRight" }} />
                  <Area type="monotone" dataKey="battery" stroke={BATTERY_COLOR} strokeWidth={2}
                    fill="url(#psksGradBat)" dot={false} activeDot={{ r: 4, fill: BATTERY_COLOR }} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Row 4: Daily Consumption Bar Chart ───────────────────────────── */}
          {(() => {
            const days = consumptionView === 'weekly' ? 7 : 30;
            const sorted = [...dailyConsumption].sort((a, b) => a.day.localeCompare(b.day));
            const sliced = sorted.slice(-days);
            const barData = sliced.map(d => ({
              name: new Date(d.day).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }),
              consumption: d.consumption,
            }));
            const total   = barData.reduce((s, d) => s + d.consumption, 0);
            const peak    = Math.max(...barData.map(d => d.consumption), 0);
            const average = barData.length > 0 ? Math.round(total / barData.length) : 0;
            return (
              <div style={S.card}>
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <p style={S.sectionHdr}>צריכה יומית</p>
                  <div style={{ display: "flex", gap: 4, background: isDarkMode ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0.06)", padding: 4, borderRadius: 10, border: `1px solid ${C.border}` }}>
                    {(["weekly", "monthly"] as const).map(v => (
                      <button key={v} onClick={() => setConsumptionView(v)}
                        style={{ padding: "5px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer",
                          fontFamily: "DM Sans, sans-serif", fontWeight: 700, border: "none",
                          background: consumptionView === v ? ACCENT : "transparent",
                          color: consumptionView === v ? "#fff" : C.muted,
                          transition: "all 0.15s" }}>
                        {v === "weekly" ? "שבועי" : "חודשי"}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ padding: "12px 8px 4px", height: 260 }} dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"} vertical={false} />
                      <XAxis dataKey="name" stroke={C.muted} fontSize={12} tickLine={false} axisLine={false} dy={6} tick={{ fill: C.muted }} />
                      <YAxis orientation="left" stroke={C.muted} fontSize={12} tickLine={false} axisLine={false}
                        width={1} mirror={true} dx={6} tickFormatter={v => v.toLocaleString()} tick={{ fill: C.muted }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, textAlign: "right", color: C.text, fontFamily: "DM Sans, sans-serif" }}
                        itemStyle={{ color: C.text }}
                        formatter={(v: any) => [`${Number(v).toLocaleString()} ${cfg.unit}`, "צריכה"]}
                        cursor={{ fill: isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }}
                      />
                      <Bar dataKey="consumption" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={36} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 1, borderTop: `1px solid ${C.border}` }}>
                  {[
                    { label: 'סה"כ',       value: total,   color: ACCENT },
                    { label: 'יום שיא',    value: peak,    color: "#f87171" },
                    { label: 'ממוצע יומי', value: average, color: "#34d399" },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: "14px 20px", textAlign: "center", borderLeft: `1px solid ${C.border}` }}>
                      <p style={{ color: C.muted, fontSize: 11, fontFamily: "DM Sans, sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px" }}>{label}</p>
                      <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 32, color }}>{value.toLocaleString()}</span>
                      <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: C.muted, marginRight: 4 }}> {cfg.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ── Row 5: Fill events (from DB, injected by Node-RED) ────────────── */}
          {fillings.length > 0 && (
            <div style={S.card}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
                <p style={S.sectionHdr}>אירועי מילוי — {fillings.length}</p>
              </div>
              <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, fontFamily: "DM Sans, sans-serif" }}>
                  <thead style={{ position: "sticky", top: 0 }}>
                    <tr style={{ background: C.inner }}>
                      {["#", "זמן", `לפני (${cfg.unit})`, `אחרי (${cfg.unit})`, `סה״כ מולא (${cfg.unit})`].map(h => (
                        <th key={h} style={{ padding: "10px 20px", textAlign: "right", color: C.text, fontWeight: 600, whiteSpace: "nowrap", fontSize: 13 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {fillings.map((f, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={{ padding: "8px 20px", color: C.muted }}>{i + 1}</td>
                        <td style={{ padding: "8px 20px", color: C.text, whiteSpace: "nowrap" }}>{toDate(f.timestamp).toLocaleString("he-IL")}</td>
                        <td style={{ padding: "8px 20px", fontFamily: "Bebas Neue, sans-serif", fontSize: 20, color: C.muted }}>{f.fill_start.toLocaleString()}</td>
                        <td style={{ padding: "8px 20px", fontFamily: "Bebas Neue, sans-serif", fontSize: 20, color: C.muted }}>{f.fill_stop.toLocaleString()}</td>
                        <td style={{ padding: "8px 20px", fontFamily: "Bebas Neue, sans-serif", fontSize: 22, color: "#34d399" }}>+{f.fill_total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Row 6: History table ─────────────────────────────────────────── */}
          <div style={S.card}>
            <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
              <p style={S.sectionHdr}>היסטוריה — {readings.length} קריאות</p>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, fontFamily: "DM Sans, sans-serif" }}>
                <thead style={{ position: "sticky", top: 0 }}>
                  <tr style={{ background: C.inner }}>
                    {["#", "זמן", `מפלס (${cfg.unit})`, "סוללה (V)", "אות (%)", "מצב"].map(h => (
                      <th key={h} style={{ padding: "10px 20px", textAlign: "right",
                        color: C.text, fontWeight: 600, whiteSpace: "nowrap", fontSize: 13 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...readings].reverse().map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: "8px 20px", color: C.muted }}>{i + 1}</td>
                      <td style={{ padding: "8px 20px", color: C.text, whiteSpace: "nowrap" }}>
                        {toDate(r.timestamp).toLocaleString("he-IL")}
                      </td>
                      <td style={{ padding: "8px 20px", fontFamily: "Bebas Neue, sans-serif", fontSize: 22, color: C.text }}>
                        {r.level.toLocaleString()}
                      </td>
                      <td style={{ padding: "8px 20px", fontFamily: "Bebas Neue, sans-serif", fontSize: 20,
                        color: r.battery >= 3.6 ? "#34d399" : r.battery >= 3.2 ? "#fbbf24" : "#f87171" }}>
                        {r.battery.toFixed(2)}
                      </td>
                      <td style={{ padding: "8px 20px", fontFamily: "Bebas Neue, sans-serif", fontSize: 20, color: SIGNAL_COLOR }}>
                        {Math.round((r.signal / 31) * 100)}
                      </td>
                      <td style={{ padding: "8px 20px" }}>
                        <span style={{ fontSize: 12, fontFamily: "DM Sans, sans-serif", fontWeight: 600,
                          color: r.interrupt ? "#f87171" : "#34d399" }}>
                          {r.interrupt ? "⚡" : "✓"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      <style>{`
        @keyframes spin  { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        .psks-gauge-outer  { display:flex; justify-content:center; align-items:center; padding:8px 0; width:100%; }
        .psks-gauge-box    { width:460px; height:420px; display:flex; justify-content:center; align-items:center; }
        .psks-gauge-scale  { transform:scale(2.0); transform-origin:center center; }
        .psks-vessel-box   { width:560px; height:560px; display:flex; justify-content:center; align-items:center; }
        .psks-vessel-scale { transform:scale(2.6); transform-origin:center center; }
        @media(max-width:600px){
          .psks-hdr { flex-wrap:wrap!important; gap:8px!important; }
          .psks-hdr-left { flex:1!important; order:1; min-width:0; }
          .psks-hdr-refresh { order:2; flex-shrink:0; }
          .psks-hdr-ts { order:3; width:100%!important; margin-left:0!important; background:${C.inner}; border:1px solid ${C.border}; border-radius:12px; padding:10px 14px!important; justify-content:flex-start!important; }
          .psks-hdr-ts span { font-size:15px!important; color:${C.text}!important; }
          .psks-widget-card  { padding:16px!important; }
          .psks-widget-grid  { grid-template-columns:1fr!important; gap:20px!important; }
          .psks-value-col    { border-right:none!important; padding-right:0!important; border-top:1px solid rgba(100,116,139,0.3); padding-top:20px!important; }
          .psks-gauge-outer  { width:100%; overflow:hidden; }
          .psks-gauge-box    { width:280px; height:280px; }
          .psks-gauge-scale  { transform:scale(1.2); transform-origin:center center; }
          .psks-vessel-box   { width:100%; height:370px; overflow:hidden; margin:0 auto; }
          .psks-vessel-scale { transform:scale(1.7); transform-origin:center center; }
          .psks-stats-row { margin-top:32px!important; }
        }
      `}</style>
    </div>
  );
}
