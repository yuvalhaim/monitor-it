import React, { useEffect, useState, useCallback } from "react";
import { Tank, Silo, Gauge } from "../components/iot-widgets";
import { LevelDevice } from "../types";
import { RefreshCw, Waves, Clock, TrendingUp, TrendingDown, Minus, Maximize2, X, Activity } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Brush
} from "recharts";
import { format, subDays } from "date-fns";
import { apiFetch } from "../lib/apiFetch";

interface LevelPageProps {
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
  vol: number;
  lv:  number;
}

const RANGES = [
  { id: "today",     label: "היום",        days: 1 },
  { id: "yesterday", label: "אתמול",       days: 2 },
  { id: "week",      label: "שבוע אחרון",  days: 7 },
  { id: "custom",    label: "טווח מותאם",  days: 0 },
];

const REFRESH_INTERVAL = 60_000;

export function LevelPage({ token, userProfile, isDarkMode = true }: LevelPageProps) {
  const [devices,      setDevices]     = useState<LevelDevice[]>([]);
  const [selectedId,   setSelectedId]  = useState<number | null>(null);
  const [readings,     setReadings]    = useState<Reading[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState<string | null>(null);
  const [refreshing,   setRefreshing]  = useState(false);
  const [activeRange,  setActiveRange] = useState("today");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [customDates,  setCustomDates] = useState({
    start: format(subDays(new Date(), 7), "yyyy-MM-dd"),
    end:   format(new Date(), "yyyy-MM-dd"),
  });
  const [summaryMode,    setSummaryMode]   = useState(false);
  const [summaryValues,  setSummaryValues] = useState<Record<number, { value: number | null; ts: string | null; msgs: number }>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiFetch("/api/level/devices", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((data: LevelDevice[]) => {
        setDevices(data);
        if (data.length > 0) setSelectedId(data[0].id_user);
        if (data.length > 1) setSummaryMode(true);
      })
      .catch(() => {});
  }, [token]);

  const selectedDevice = devices.find(d => d.id_user === selectedId) ?? null;

  const cfg = {
    unit:       selectedDevice?.unit        ?? userProfile?.unit        ?? "L",
    min:        selectedDevice?.min         ?? userProfile?.min         ?? 0,
    max:        selectedDevice?.max         ?? userProfile?.max         ?? 10000,
    alertLow:   selectedDevice?.alert_low   ?? userProfile?.alert_low   ?? 500,
    alertHigh:  selectedDevice?.alert_high  ?? userProfile?.alert_high  ?? 9000,
    widgetType: selectedDevice?.widget_type ?? userProfile?.widget_type ?? "tank",
    showGraph:  selectedDevice?.Display_Graph ?? userProfile?.Display_Graph ?? false,
  };

  const buildUrl = useCallback((range: string, dates: typeof customDates, deviceId: number | null) => {
    if (!deviceId) return null;
    const base = `/api/level/data?device_id=${deviceId}`;
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

  const fetchSummaryValues = useCallback(async (devs: LevelDevice[]) => {
    if (!token || devs.length === 0) return;
    setSummaryLoading(true);
    const toDate = (ts: string) => new Date(ts.endsWith('Z') ? ts : ts + 'Z');
    const results = await Promise.all(
      devs.map(async d => {
        try {
          const res = await apiFetch(`/api/level/data?device_id=${d.id_user}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) return [d.id_user, { value: null, ts: null, msgs: 0 }] as [number, { value: null; ts: null; msgs: number }];
          const rows: Reading[] = await res.json();
          const last = rows.length > 0 ? rows[rows.length - 1] : null;
          const lastMs = last ? toDate(last.timestamp).getTime() : 0;
          const msgs = last ? rows.filter(r => lastMs - toDate(r.timestamp).getTime() <= 60 * 60 * 1000).length : 0;
          return [d.id_user, { value: last?.vol ?? null, ts: last?.timestamp ?? null, msgs }] as [number, { value: number | null; ts: string | null; msgs: number }];
        } catch { return [d.id_user, { value: null, ts: null, msgs: 0 }] as [number, { value: null; ts: null; msgs: number }]; }
      })
    );
    setSummaryValues(Object.fromEntries(results));
    setSummaryLoading(false);
  }, [token]);

  useEffect(() => {
    if (selectedId) fetchData(false, activeRange, customDates, selectedId);
  }, [activeRange, customDates, selectedId]);

  useEffect(() => {
    const id = setInterval(() => fetchData(true, activeRange, customDates, selectedId), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchData, selectedId]);

  useEffect(() => {
    if (summaryMode && devices.length > 1) fetchSummaryValues(devices);
  }, [summaryMode, devices.length]);

  const latestVol = readings.length > 0 ? readings[readings.length - 1].vol : null;
  const latestLv  = readings.length > 0 ? readings[readings.length - 1].lv  : null;
  const minVol    = readings.length > 0 ? Math.min(...readings.map(r => r.vol)) : null;
  const maxVol    = readings.length > 0 ? Math.max(...readings.map(r => r.vol)) : null;
  const avgVol    = readings.length > 0
    ? Math.round(readings.reduce((s, r) => s + r.vol, 0) / readings.length)
    : null;

  const trendReading = readings.length > 10 ? readings[readings.length - 11].vol : null;
  const trend = latestVol !== null && trendReading !== null
    ? latestVol > trendReading + 5 ? "up" : latestVol < trendReading - 5 ? "down" : "flat"
    : "flat";

  const renderWidget = () => {
    if (latestVol === null) return null;
    const props = { value: latestVol, min: cfg.min, max: cfg.max, unit: cfg.unit, alertLow: cfg.alertLow, alertHigh: cfg.alertHigh, isDarkMode };
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
    ts: toDate(r.timestamp).getTime(),
    v:  r.vol,
  }));

  const isLongRange = activeRange !== "today" && activeRange !== "yesterday";
  const xFormatter  = (ts: number) => {
    const d = new Date(ts);
    return isLongRange
      ? d.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
      : d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  };

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

  return (
    <div dir="rtl" style={S.page}>

      {/* Header */}
      <div className="level-hdr" style={{ display: "flex", alignItems: "center", marginBottom: devices.length > 0 ? 12 : 28, gap: 12 }}>
        <div className="level-hdr-left" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Waves style={{ color: ACCENT, width: 22, height: 22 }} />
          <h1 style={{ fontFamily: "DM Sans, sans-serif", fontSize: 18, fontWeight: 700, margin: 0, color: C.text }}>
            {summaryMode ? "כל המכשירים" : (selectedDevice?.site_name ?? userProfile?.site_name ?? "מערכת מפלס")}
          </h1>
        </div>
        <div className="level-hdr-ts" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
          {!summaryMode && readings.length > 0 && (() => {
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
        <button className="level-hdr-refresh" onClick={() => fetchData(true)} disabled={refreshing}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "6px 12px", cursor: "pointer", color: ACCENT,
            display: "flex", alignItems: "center", gap: 6, fontFamily: "DM Sans, sans-serif" }}>
          <RefreshCw style={{ width: 14, height: 14, animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          <span style={{ fontSize: 14 }}>רענן</span>
        </button>
      </div>

      {/* ── Device selector ──────────────────────────────────────────────── */}
      {devices.length > 0 && (
        <div style={{ ...S.card, padding: "10px 14px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <p style={{ color: C.muted, fontSize: 14, fontFamily: "DM Sans, sans-serif",
              textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
              רשימת מכשירים
            </p>
            {devices.length > 1 && (
              <button onClick={() => setSummaryMode(m => !m)}
                style={{ background: summaryMode ? `${ACCENT}22` : "transparent",
                  border: `1px solid ${summaryMode ? ACCENT : C.border}`, borderRadius: 8,
                  padding: "4px 12px", cursor: "pointer", color: summaryMode ? ACCENT : C.muted,
                  fontFamily: "DM Sans, sans-serif", fontSize: 13, transition: "all 0.15s" }}>
                {summaryMode ? "הצג מכשיר בודד" : "סיכום כל המכשירים"}
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {devices.map(d => (
              <button key={d.id_user} onClick={() => { setSelectedId(d.id_user); setSummaryMode(false); }}
                style={{
                  padding: "6px 16px", borderRadius: 8, cursor: "pointer",
                  fontFamily: "DM Sans, sans-serif",
                  border: `1px solid ${selectedId === d.id_user && !summaryMode ? ACCENT : C.border}`,
                  background: selectedId === d.id_user && !summaryMode ? `${ACCENT}22` : "transparent",
                  color: selectedId === d.id_user && !summaryMode ? ACCENT : C.muted,
                  transition: "all 0.15s",
                  display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1,
                }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>{d.site_name || `מכשיר ${d.id_user}`}</span>
                {d.location && (
                  <span style={{ fontSize: 16, fontWeight: 400, opacity: 0.75 }}>{d.location}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Summary view ─────────────────────────────────────────────────── */}
      {summaryMode && devices.length > 1 ? (
        summaryLoading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
            <div style={{ textAlign: "center", ...S.muted }}>
              <div style={{ width: 36, height: 36, border: `3px solid ${C.border}`,
                borderTop: `3px solid ${ACCENT}`, borderRadius: "50%",
                animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13 }}>טוען נתונים...</p>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
            {devices.map(d => {
              const entry   = summaryValues[d.id_user];
              const val     = entry?.value ?? null;
              const tsStr   = entry?.ts ?? null;
              const msgs    = entry?.msgs ?? 0;
              const msgClr  = msgs >= 8 ? "#34d399" : msgs >= 3 ? "#fbbf24" : "#f87171";
              const wType   = d.widget_type ?? "tank";
              const dMin  = d.min  ?? 0;
              const dMax  = d.max  ?? 10000;
              const dLow  = d.alert_low  ?? 500;
              const dHigh = d.alert_high ?? 9000;
              const dUnit = d.unit ?? cfg.unit;
              const p = { value: val ?? 0, min: dMin, max: dMax, unit: dUnit, alertLow: dLow, alertHigh: dHigh, isDarkMode };
              return (
                <div key={d.id_user}
                  onClick={() => { setSelectedId(d.id_user); setSummaryMode(false); }}
                  style={{ ...S.card, padding: "20px 16px", cursor: "pointer", transition: "border-color 0.2s, transform 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = ACCENT; (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.transform = "translateY(0)"; }}>
                  <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 2px" }}>
                    {d.site_name || `מכשיר ${d.id_user}`}
                  </p>
                  {d.location && <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: C.muted, margin: "0 0 4px" }}>{d.location}</p>}
                  {tsStr && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 0 12px" }}>
                      <p style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: C.muted, margin: 0 }}>{new Date(tsStr).toLocaleString("he-IL")}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: msgClr, boxShadow: `0 0 4px ${msgClr}` }} />
                        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: msgClr, fontWeight: 600 }}>{msgs} msg/h</span>
                      </div>
                    </div>
                  )}
                  <div className="summary-widget-wrap">
                    <div className="summary-widget-inner">
                      {val !== null
                        ? (wType === "silo" ? <Silo {...p} /> : wType === "gauge" ? <Gauge {...p} /> : <Tank {...p} />)
                        : <p style={{ textAlign: "center", color: C.muted, fontFamily: "DM Sans", fontSize: 13, padding: "40px 0" }}>אין נתונים</p>
                      }
                    </div>
                  </div>
                  <p style={{ textAlign: "center", color: ACCENT, fontSize: 13, fontFamily: "DM Sans, sans-serif", margin: 0 }}>לחץ לצפייה בפרטים ←</p>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 20, opacity: loading ? 0.45 : 1, transition: "opacity 0.2s", position: "relative", pointerEvents: loading ? "none" : "auto" }}>
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

              {/* Row 1: Widget + Values */}
              <div className="level-widget-card" style={{ ...S.card, padding: "28px 32px", overflow: "hidden" }}>
                <div className="level-widget-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "center" }}>

                  <div className="level-gauge-outer">
                    <div className={cfg.widgetType === "tank" || cfg.widgetType === "silo" ? "level-vessel-box" : "level-gauge-box"}>
                      <div className={cfg.widgetType === "tank" || cfg.widgetType === "silo" ? "level-vessel-scale" : "level-gauge-scale"}>
                        {renderWidget()}
                      </div>
                    </div>
                  </div>

                  <div className="level-value-col" style={{ textAlign: "center", borderRight: `1px solid ${C.border}`, paddingRight: 32 }}>
                    <p style={{ color: C.muted, fontSize: 13, fontFamily: "DM Sans, sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>
                      נפח
                    </p>
                    {latestVol !== null ? (
                      <>
                        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 10 }}>
                          <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 96, lineHeight: 1, color: C.text }}>
                            {latestVol.toLocaleString()}
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

                        {latestLv !== null && (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16,
                            background: `${ACCENT}18`, border: `1px solid ${ACCENT}44`,
                            borderRadius: 10, padding: "6px 16px" }}>
                            <Waves style={{ width: 14, height: 14, color: ACCENT }} />
                            <span style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 26, color: ACCENT, lineHeight: 1 }}>
                              {latestLv}
                            </span>
                            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, color: ACCENT, fontWeight: 600 }}>
                              mm
                            </span>
                          </div>
                        )}

                        <div className="level-stats-row" style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
                          {[
                            { label: "מינימום", value: minVol?.toLocaleString(), icon: "↓", color: "#34d399" },
                            { label: "מקסימום", value: maxVol?.toLocaleString(), icon: "↑", color: "#f87171" },
                            { label: "ממוצע",   value: avgVol?.toLocaleString(), icon: "≈", color: ACCENT },
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

              {/* Row 2: Graph */}
              {cfg.showGraph && (
                <>
                  {isFullscreen && (
                    <div style={{
                      position: "fixed", inset: 0, zIndex: 9999,
                      background: "#050505",
                      display: "flex", flexDirection: "column",
                      padding: "16px 20px",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                        marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ padding: 8, background: `${ACCENT}18`, borderRadius: 8 }}>
                            <Activity style={{ width: 18, height: 18, color: ACCENT }} />
                          </div>
                          <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 20, fontWeight: 700,
                            color: C.text, letterSpacing: "0.06em" }}>גרף היסטורי</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          {activeRange === "custom" && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8,
                              background: "rgba(0,0,0,0.3)", padding: "4px 10px",
                              borderRadius: 10, border: `1px solid ${C.border}` }}>
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
                          )}
                          <div style={{ display: "flex", alignItems: "center", gap: 2,
                            background: "rgba(0,0,0,0.25)", padding: 4, borderRadius: 10,
                            border: `1px solid ${C.border}` }}>
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
                          <button onClick={() => setIsFullscreen(false)} style={{
                            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
                            padding: "6px 14px", cursor: "pointer", color: C.text,
                            display: "flex", alignItems: "center", gap: 6,
                            fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600, flexShrink: 0,
                          }}>
                            <X style={{ width: 15, height: 15 }} /> סגור
                          </button>
                        </div>
                      </div>
                      <div dir="ltr" style={{ flex: 1, minHeight: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="levelGradFs" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor={ACCENT} stopOpacity={0.2} />
                                <stop offset="95%" stopColor={ACCENT} stopOpacity={0}   />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                            <XAxis dataKey="ts" type="number" domain={["auto", "auto"]}
                              tickFormatter={xFormatter}
                              stroke={C.muted} fontSize={14} tickLine={false} axisLine={false} dy={10} />
                            <YAxis orientation="left"
                              stroke={C.muted} fontSize={12} tickLine={false} axisLine={false}
                              width={1} mirror={true} dx={6}
                              domain={[cfg.min, cfg.max]} tickFormatter={v => v.toLocaleString()} />
                            <Tooltip
                              labelFormatter={ts => new Date(ts as number).toLocaleString("he-IL", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
                              contentStyle={{ backgroundColor: C.card, border: `1px solid ${C.border}`,
                                borderRadius: 8, fontSize: 14, textAlign: "right", color: C.text, fontFamily: "DM Sans, sans-serif" }}
                              itemStyle={{ color: C.text }}
                              formatter={(v: any) => [`${Number(v).toLocaleString()} ${cfg.unit}`, "נפח"]}
                            />
                            <ReferenceLine y={cfg.alertHigh} stroke="#f8717166" strokeDasharray="4 4" />
                            <ReferenceLine y={cfg.alertLow}  stroke="#fbbf2466" strokeDasharray="4 4" />
                            <Area type="monotone" dataKey="v" stroke={ACCENT} strokeWidth={2}
                              fill="url(#levelGradFs)" fillOpacity={1}
                              dot={false} activeDot={{ r: 4, fill: ACCENT }} isAnimationActive={false} />
                            <Brush dataKey="ts" height={36}
                              stroke={C.border} fill={C.inner} travellerWidth={22}
                              tickFormatter={xFormatter} />
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
                          color: C.text, textTransform: "uppercase", letterSpacing: "0.05em" }}>גרף היסטורי</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        {activeRange === "custom" && (
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
                        )}
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
                        <button onClick={() => setIsFullscreen(true)} title="הגדל גרף"
                          style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
                            padding: "5px 9px", cursor: "pointer", color: C.muted,
                            display: "flex", alignItems: "center", flexShrink: 0,
                            transition: "border-color 0.15s, color 0.15s" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = ACCENT; (e.currentTarget as HTMLElement).style.color = ACCENT; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted; }}>
                          <Maximize2 style={{ width: 15, height: 15 }} />
                        </button>
                      </div>
                    </div>
                    <div style={{ padding: "8px 4px 4px", height: 520 }} dir="ltr">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="levelGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor={ACCENT} stopOpacity={0.2} />
                              <stop offset="95%" stopColor={ACCENT} stopOpacity={0}   />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3"
                            stroke={isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}
                            vertical={false} />
                          <XAxis dataKey="ts" type="number" domain={["auto", "auto"]}
                            tickFormatter={xFormatter}
                            stroke={C.muted} fontSize={14} tickLine={false} axisLine={false} dy={10} />
                          <YAxis orientation="left"
                            stroke={C.muted} fontSize={12} tickLine={false} axisLine={false}
                            width={1} mirror={true} dx={6}
                            domain={[cfg.min, cfg.max]} tickFormatter={v => v.toLocaleString()} />
                          <Tooltip
                            labelFormatter={ts => new Date(ts as number).toLocaleString("he-IL", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })}
                            contentStyle={{ backgroundColor: C.card, border: `1px solid ${C.border}`,
                              borderRadius: 8, fontSize: 14, textAlign: "right", color: C.text,
                              fontFamily: "DM Sans, sans-serif" }}
                            itemStyle={{ color: C.text }}
                            formatter={(v: any) => [`${Number(v).toLocaleString()} ${cfg.unit}`, "נפח"]}
                          />
                          <ReferenceLine y={cfg.alertHigh} stroke="#f8717166" strokeDasharray="4 4" />
                          <ReferenceLine y={cfg.alertLow}  stroke="#fbbf2466" strokeDasharray="4 4" />
                          <Area type="monotone" dataKey="v" stroke={ACCENT} strokeWidth={2}
                            fill="url(#levelGrad)" fillOpacity={1}
                            dot={false} activeDot={{ r: 4, fill: ACCENT }} isAnimationActive={false} />
                          <Brush dataKey="ts" height={36}
                            stroke={C.border} fill={C.inner} travellerWidth={22}
                            tickFormatter={xFormatter} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}

              {/* Row 3: History table */}
              <div style={S.card}>
                <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}` }}>
                  <p style={S.sectionHdr}>היסטוריה — {readings.length} קריאות</p>
                </div>
                <div style={{ overflowX: "auto", maxHeight: 340, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, fontFamily: "DM Sans, sans-serif" }}>
                    <thead style={{ position: "sticky", top: 0 }}>
                      <tr style={{ background: C.inner }}>
                        {["#", "זמן", `נפח (${cfg.unit})`, "מפלס (mm)"].map(h => (
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
                            {r.vol.toLocaleString()}
                          </td>
                          <td style={{ padding: "8px 20px", fontFamily: "Bebas Neue, sans-serif", fontSize: 20, color: ACCENT }}>
                            {r.lv}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin  { from { transform: rotate(0deg)   } to { transform: rotate(360deg) } }
        .summary-widget-wrap{width:100%;display:flex;justify-content:center;padding-bottom:175px;}
        .summary-widget-inner{transform:scale(1.85);transform-origin:top center;width:220px;flex-shrink:0;}
        @media(max-width:600px){
          .summary-widget-wrap{padding-bottom:210px;}
          .summary-widget-inner{transform:scale(2.0);}
        }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
        .level-mobile-only  { display:none; }
        .level-gauge-outer  { display:flex; justify-content:center; align-items:center; padding:8px 0; width:100%; }
        .level-gauge-box    { width:460px; height:420px; display:flex; justify-content:center; align-items:center; }
        .level-gauge-scale  { transform:scale(2.0); transform-origin:center center; }
        .level-vessel-box   { width:560px; height:560px; display:flex; justify-content:center; align-items:center; }
        .level-vessel-scale { transform:scale(2.6); transform-origin:center center; }
        @media(max-width:600px){
          .level-mobile-only  { display:block!important; }
          .level-hdr { flex-wrap:wrap!important; gap:8px!important; }
          .level-hdr-left { flex:1!important; order:1; min-width:0; }
          .level-hdr-refresh { order:2; flex-shrink:0; }
          .level-hdr-ts { order:3; width:100%!important; margin-left:0!important; background:${C.inner}; border:1px solid ${C.border}; border-radius:12px; padding:10px 14px!important; justify-content:flex-start!important; }
          .level-hdr-ts span { font-size:15px!important; color:${C.text}!important; }
          .level-widget-card  { padding:16px!important; }
          .level-widget-grid  { grid-template-columns:1fr!important; gap:20px!important; }
          .level-value-col    { border-right:none!important; padding-right:0!important; border-top:1px solid rgba(100,116,139,0.3); padding-top:20px!important; }
          .level-gauge-outer  { width:100%; overflow:hidden; }
          .level-gauge-box    { width:280px; height:280px; }
          .level-gauge-scale  { transform:scale(1.2); transform-origin:center center; }
          .level-vessel-box   { width:100%; height:370px; overflow:hidden; margin:0 auto; }
          .level-vessel-scale { transform:scale(1.7); transform-origin:center center; }
          .level-stats-row { margin-top:32px!important; }
        }
      `}</style>
    </div>
  );
}
