import React, { useEffect, useState, useCallback, useRef } from "react";
import { Droplets, RefreshCw, Clock, Download, FileText, Maximize2, X } from "lucide-react";
import { apiFetch } from "../lib/apiFetch";
import { ValueCard } from "../components/iot-widgets";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Brush,
} from "recharts";

// ── Sensor / tank config ──────────────────────────────────────────────────────
const TANKS = [
  {
    label: "מיכל 1",
    sensors: [
      { key: "Sensor11_O2_mgL",       name: "חמצן מומס", unit: "mg/L", color: "#fb923c", alertLow: 4,   alertHigh: 12  },
      { key: "Sensor21_pH",            name: "pH",         unit: "pH",   color: "#f472b6", alertLow: 6.5, alertHigh: 9.0 },
      { key: "Sensor21_temperature",   name: "טמפרטורה",  unit: "°C",   color: "#60a5fa", alertLow: 5,   alertHigh: 30  },
    ],
  },
  {
    label: "מיכל 2",
    sensors: [
      { key: "Sensor12_O2_mgL",        name: "חמצן מומס", unit: "mg/L", color: "#fb923c", alertLow: 4, alertHigh: 12 },
      { key: "Sensor12_temperature",   name: "טמפרטורה",  unit: "°C",   color: "#60a5fa", alertLow: 5, alertHigh: 30 },
    ],
  },
  {
    label: "מיכל 3",
    sensors: [
      { key: "Sensor23_pH",            name: "pH",        unit: "pH",  color: "#f472b6", alertLow: 6.5, alertHigh: 9.0 },
      { key: "Sensor23_temperature",   name: "טמפרטורה", unit: "°C",  color: "#60a5fa", alertLow: 5,   alertHigh: 30  },
    ],
  },
  {
    label: "מיכל 4",
    sensors: [
      { key: "Sensor24_pH",            name: "pH",        unit: "pH",  color: "#f472b6", alertLow: 6.5, alertHigh: 9.0 },
      { key: "Sensor24_temperature",   name: "טמפרטורה", unit: "°C",  color: "#60a5fa", alertLow: 5,   alertHigh: 30  },
    ],
  },
  {
    label: "מיכל 5",
    sensors: [
      { key: "Sensor25_pH",            name: "pH",        unit: "pH",  color: "#f472b6", alertLow: 6.5, alertHigh: 9.0 },
      { key: "Sensor25_temperature",   name: "טמפרטורה", unit: "°C",  color: "#60a5fa", alertLow: 5,   alertHigh: 30  },
    ],
  },
];

// Extra columns shown only in the data table — grouped under "לא בשימוש"
const TABLE_EXTRAS = [
  { key: "Sensor11_temperature", name: "טמפ' 11",   unit: "°C", color: "#93c5fd" },
  { key: "Sensor11_O2_percent",  name: "O2% (11)",   unit: "%",  color: "#fdba74" },
  { key: "Sensor21_ORP",         name: "ORP (21)",   unit: "mV", color: "#38bdf8" },
  { key: "Sensor12_O2_percent",  name: "O2% (12)",   unit: "%",  color: "#fdba74" },
  { key: "Sensor23_ORP",         name: "ORP (23)",   unit: "mV", color: "#38bdf8" },
  { key: "Sensor24_ORP",         name: "ORP (24)",   unit: "mV", color: "#38bdf8" },
  { key: "Sensor25_ORP",         name: "ORP (25)",   unit: "mV", color: "#38bdf8" },
];

interface HaifaData {
  timestamp: string;
  Sensor11_O2_mgL: number | null;
  Sensor11_temperature: number | null;
  Sensor11_O2_percent: number | null;
  Sensor21_pH: number | null;
  Sensor21_temperature: number | null;
  Sensor21_ORP: number | null;
  Sensor12_O2_mgL: number | null;
  Sensor12_temperature: number | null;
  Sensor12_O2_percent: number | null;
  Sensor23_pH: number | null;
  Sensor23_temperature: number | null;
  Sensor23_ORP: number | null;
  Sensor24_pH: number | null;
  Sensor24_temperature: number | null;
  Sensor24_ORP: number | null;
  Sensor25_pH: number | null;
  Sensor25_temperature: number | null;
  Sensor25_ORP: number | null;
  // Energy meter fields (nullable — null when meter is offline)
  VL1_N: number | null;
  VL2_N: number | null;
  VL3_N: number | null;
  AL1: number | null;
  AL2: number | null;
  AL3: number | null;
  KWL1: number | null;
  KWL2: number | null;
  KWL3: number | null;
  KWTOT: number | null;
  msgs_last_hour?: number;
}

interface HaifaPageProps {
  token: string | null;
  userProfile: any;
  isDarkMode: boolean;
}

const ACCENT = "hsl(198, 93%, 59%)";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function getRangeDates(range: string, customFrom: string, customTo: string) {
  const now = new Date();
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

// ── DataTable ─────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;

function DataTable({
  rows, total, page, onPageChange, onExportCSV, onExportPDF, tableLoading, C, ACCENT: accent,
}: {
  rows: any[]; total: number; page: number; onPageChange: (p: number) => void;
  onExportCSV: () => void; onExportPDF: () => void;
  tableLoading: boolean; C: any; ACCENT: string;
}) {
  const allSensors = TANKS.flatMap((t) =>
    t.sensors.map((s) => ({ ...s, tankLabel: t.label }))
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = rows; // server already returns the current page in DESC order

  const hasData = total > 0;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 20px" }}>
      {/* Table header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 15, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          טבלת נתונים
          {hasData && (
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 400, color: C.muted, marginRight: 10, textTransform: "none", letterSpacing: 0 }}>
              {total} שורות
            </span>
          )}
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onExportCSV} disabled={!hasData}
            style={{ padding: "6px 12px", borderRadius: 8, cursor: hasData ? "pointer" : "not-allowed", fontFamily: "DM Sans, sans-serif", fontSize: 13, border: `1px solid ${C.border}`, background: "transparent", color: hasData ? C.sub : C.muted, display: "flex", alignItems: "center", gap: 6, opacity: hasData ? 1 : 0.45, transition: "all 0.15s" }}>
            <Download style={{ width: 14, height: 14 }} />
            CSV
          </button>
          <button onClick={onExportPDF} disabled={!hasData}
            style={{ padding: "6px 12px", borderRadius: 8, cursor: hasData ? "pointer" : "not-allowed", fontFamily: "DM Sans, sans-serif", fontSize: 13, border: `1px solid ${C.border}`, background: "transparent", color: hasData ? C.sub : C.muted, display: "flex", alignItems: "center", gap: 6, opacity: hasData ? 1 : 0.45, transition: "all 0.15s" }}>
            <FileText style={{ width: 14, height: 14 }} />
            PDF
          </button>
        </div>
      </div>

      {tableLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
          <div style={{ width: 22, height: 22, border: `2px solid ${C.border}`, borderTop: `2px solid ${accent}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        </div>
      ) : !hasData ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>
          אין נתונים לתקופה זו
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Mono, monospace", fontSize: 14 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ padding: "8px 12px", background: C.inner, color: C.muted, fontWeight: 600, textAlign: "right", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap", position: "sticky", right: 0, zIndex: 2 }}>
                  זמן
                </th>
                {TANKS.map((t) => (
                  <th key={t.label} colSpan={t.sensors.length}
                    style={{ padding: "6px 12px", background: C.inner, color: accent, fontWeight: 700, textAlign: "center", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap", letterSpacing: "0.06em" }}>
                    {t.label}
                  </th>
                ))}
                <th colSpan={TABLE_EXTRAS.length}
                  style={{ padding: "6px 12px", background: C.inner, color: C.muted, fontWeight: 700, textAlign: "center", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap", letterSpacing: "0.06em", opacity: 0.7 }}>
                  לא בשימוש
                </th>
              </tr>
              <tr>
                {allSensors.map((s) => (
                  <th key={s.key}
                    style={{ padding: "6px 10px", background: C.inner, color: s.color, fontWeight: 600, textAlign: "center", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    {s.name}
                    <span style={{ display: "block", color: C.muted, fontWeight: 400, fontSize: 11 }}>{s.unit}</span>
                  </th>
                ))}
                {TABLE_EXTRAS.map((s, i) => (
                  <th key={s.key}
                    style={{ padding: "6px 10px", background: C.inner, color: s.color, fontWeight: 600, textAlign: "center", borderBottom: `1px solid ${C.border}`, borderRight: i < TABLE_EXTRAS.length - 1 ? `1px solid ${C.border}` : "none", whiteSpace: "nowrap", opacity: 0.7 }}>
                    {s.name}
                    <span style={{ display: "block", color: C.muted, fontWeight: 400, fontSize: 11 }}>{s.unit}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, idx) => {
                const ts = new Date(row.timestamp);
                const isEven = idx % 2 === 0;
                return (
                  <tr key={row.timestamp + idx} style={{ background: isEven ? "transparent" : `${C.inner}88` }}>
                    <td style={{ padding: "6px 12px", color: C.muted, borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap", position: "sticky", right: 0, background: isEven ? C.card : `${C.inner}cc`, zIndex: 1 }}>
                      {ts.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                      {" "}
                      {ts.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    {allSensors.map((s) => {
                      const v = row[s.key];
                      return (
                        <td key={s.key}
                          style={{ padding: "6px 10px", textAlign: "center", color: C.text, borderRight: `1px solid ${C.border}` }}>
                          {v != null ? Number(v).toFixed(2) : "—"}
                        </td>
                      );
                    })}
                    {TABLE_EXTRAS.map((s, i) => {
                      const v = row[s.key];
                      return (
                        <td key={s.key}
                          style={{ padding: "6px 10px", textAlign: "center", color: C.text, opacity: 0.7, borderRight: i < TABLE_EXTRAS.length - 1 ? `1px solid ${C.border}` : "none" }}>
                          {v != null ? Number(v).toFixed(2) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {hasData && !tableLoading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13, color: C.muted }}>
            שורות {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} מתוך {total}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => onPageChange(0)} disabled={page === 0}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: page === 0 ? C.muted : C.text, cursor: page === 0 ? "default" : "pointer", fontFamily: "DM Mono, monospace", fontSize: 13, opacity: page === 0 ? 0.4 : 1 }}>«</button>
            <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: page === 0 ? C.muted : C.text, cursor: page === 0 ? "default" : "pointer", fontFamily: "DM Mono, monospace", fontSize: 13, opacity: page === 0 ? 0.4 : 1 }}>‹</button>
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13, color: accent, padding: "4px 12px", border: `1px solid ${accent}`, borderRadius: 6, background: `${accent}18` }}>
              {page + 1} / {totalPages}
            </span>
            <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: page >= totalPages - 1 ? C.muted : C.text, cursor: page >= totalPages - 1 ? "default" : "pointer", fontFamily: "DM Mono, monospace", fontSize: 13, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>›</button>
            <button onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: page >= totalPages - 1 ? C.muted : C.text, cursor: page >= totalPages - 1 ? "default" : "pointer", fontFamily: "DM Mono, monospace", fontSize: 13, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── EnergyTable ───────────────────────────────────────────────────────────────
const ENERGY_GROUPS = [
  {
    label: "מתחים",
    color: "#facc15",
    cols: [
      { key: "VL1_N", name: "L1-N", unit: "V" },
      { key: "VL2_N", name: "L2-N", unit: "V" },
      { key: "VL3_N", name: "L3-N", unit: "V" },
    ],
  },
  {
    label: "זרמים",
    color: "#60a5fa",
    cols: [
      { key: "AL1", name: "L1", unit: "A" },
      { key: "AL2", name: "L2", unit: "A" },
      { key: "AL3", name: "L3", unit: "A" },
    ],
  },
  {
    label: "הספק",
    color: "#34d399",
    cols: [
      { key: "KWL1",  name: "L1",    unit: "kW" },
      { key: "KWL2",  name: "L2",    unit: "kW" },
      { key: "KWL3",  name: "L3",    unit: "kW" },
      { key: "KWTOT", name: "סה״כ",  unit: "kW", color: "#fb923c" },
    ],
  },
];
const ENERGY_COLS = ENERGY_GROUPS.flatMap((g) =>
  g.cols.map((c) => ({ ...c, groupColor: g.color }))
);

function EnergyTable({
  rows, total, page, onPageChange, tableLoading, onExportCSV, C, ACCENT: accent,
}: {
  rows: any[]; total: number; page: number; onPageChange: (p: number) => void;
  tableLoading: boolean; onExportCSV: () => void; C: any; ACCENT: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasData = total > 0;

  if (!hasData && !tableLoading) return null;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "16px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 15, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          טבלת אנרגיה
          {hasData && (
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 400, color: C.muted, marginRight: 10, textTransform: "none", letterSpacing: 0 }}>
              {total} שורות
            </span>
          )}
        </span>
        <button onClick={onExportCSV} disabled={!hasData}
          style={{ padding: "6px 12px", borderRadius: 8, cursor: hasData ? "pointer" : "not-allowed", fontFamily: "DM Sans, sans-serif", fontSize: 13, border: `1px solid ${C.border}`, background: "transparent", color: hasData ? C.sub : C.muted, display: "flex", alignItems: "center", gap: 6, opacity: hasData ? 1 : 0.45, transition: "all 0.15s" }}>
          <Download style={{ width: 14, height: 14 }} />
          CSV
        </button>
      </div>

      {tableLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
          <div style={{ width: 22, height: 22, border: `2px solid ${C.border}`, borderTop: `2px solid ${accent}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
        </div>
      ) : !hasData ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: C.muted, fontFamily: "DM Sans, sans-serif", fontSize: 13 }}>
          אין נתונים לתקופה זו
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Mono, monospace", fontSize: 14 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ padding: "8px 12px", background: C.inner, color: C.muted, fontWeight: 600, textAlign: "right", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap", position: "sticky", right: 0, zIndex: 2 }}>
                  זמן
                </th>
                {ENERGY_GROUPS.map((g) => (
                  <th key={g.label} colSpan={g.cols.length}
                    style={{ padding: "6px 12px", background: C.inner, color: g.color, fontWeight: 700, textAlign: "center", borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap", letterSpacing: "0.06em" }}>
                    {g.label}
                  </th>
                ))}
              </tr>
              <tr>
                {ENERGY_COLS.map((c, i) => (
                  <th key={c.key}
                    style={{ padding: "6px 10px", background: C.inner, color: (c as any).color ?? c.groupColor, fontWeight: 600, textAlign: "center", borderBottom: `1px solid ${C.border}`, borderRight: i < ENERGY_COLS.length - 1 ? `1px solid ${C.border}` : "none", whiteSpace: "nowrap" }}>
                    {c.name}
                    <span style={{ display: "block", color: C.muted, fontWeight: 400, fontSize: 11 }}>{c.unit}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const ts = new Date(row.timestamp);
                const isEven = idx % 2 === 0;
                return (
                  <tr key={row.timestamp + idx} style={{ background: isEven ? "transparent" : `${C.inner}88` }}>
                    <td style={{ padding: "6px 12px", color: C.muted, borderRight: `1px solid ${C.border}`, whiteSpace: "nowrap", position: "sticky", right: 0, background: isEven ? C.card : `${C.inner}cc`, zIndex: 1 }}>
                      {ts.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                      {" "}
                      {ts.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    {ENERGY_COLS.map((c, i) => {
                      const v = row[c.key];
                      return (
                        <td key={c.key}
                          style={{ padding: "6px 10px", textAlign: "center", color: v != null ? C.text : C.muted, borderRight: i < ENERGY_COLS.length - 1 ? `1px solid ${C.border}` : "none" }}>
                          {v != null ? Number(v).toFixed(2) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {hasData && !tableLoading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13, color: C.muted }}>
            שורות {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} מתוך {total}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => onPageChange(0)} disabled={page === 0}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: page === 0 ? C.muted : C.text, cursor: page === 0 ? "default" : "pointer", fontFamily: "DM Mono, monospace", fontSize: 13, opacity: page === 0 ? 0.4 : 1 }}>«</button>
            <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: page === 0 ? C.muted : C.text, cursor: page === 0 ? "default" : "pointer", fontFamily: "DM Mono, monospace", fontSize: 13, opacity: page === 0 ? 0.4 : 1 }}>‹</button>
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 13, color: accent, padding: "4px 12px", border: `1px solid ${accent}`, borderRadius: 6, background: `${accent}18` }}>
              {page + 1} / {totalPages}
            </span>
            <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: page >= totalPages - 1 ? C.muted : C.text, cursor: page >= totalPages - 1 ? "default" : "pointer", fontFamily: "DM Mono, monospace", fontSize: 13, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>›</button>
            <button onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1}
              style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: page >= totalPages - 1 ? C.muted : C.text, cursor: page >= totalPages - 1 ? "default" : "pointer", fontFamily: "DM Mono, monospace", fontSize: 13, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TankChart — one combined chart for all sensors in a tank ─────────────────
function TankChart({
  tank, readings, histLoading, C, ACCENT: accent,
}: {
  tank: typeof TANKS[number]; readings: any[];
  histLoading: boolean; C: any; ACCENT: string;
}) {
  const [visible, setVisible] = useState<Record<string, boolean>>(
    () => Object.fromEntries(tank.sensors.map((s) => [s.key, true]))
  );
  const [fullscreen, setFullscreen] = useState(false);
  const toggle = (key: string) => setVisible((p) => ({ ...p, [key]: !p[key] }));

  const dualAxis =
    tank.sensors.some((s) => s.unit === "°C") &&
    tank.sensors.some((s) => s.unit !== "°C");
  const getAxisId = (unit: string) => dualAxis && unit === "°C" ? "right" : "left";

  const stats = tank.sensors.map((s) => {
    const vals = readings
      .map((r) => r[s.key])
      .filter((v): v is number => v != null && !isNaN(Number(v)));
    const min  = vals.length ? Math.min(...vals) : null;
    const max  = vals.length ? Math.max(...vals) : null;
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    const fmt  = (v: number | null) => (v == null ? "—" : v.toFixed(2));
    return { ...s, minFmt: fmt(min), avgFmt: fmt(mean), maxFmt: fmt(max) };
  });

  const chartData = readings.map((r) => {
    const pt: Record<string, any> = { ts: r.timestamp };
    tank.sensors.forEach((s) => { pt[s.key] = r[s.key] != null ? Number(r[s.key]) : null; });
    return pt;
  });

  const ToggleButtons = () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {tank.sensors.map((s) => {
        const on = visible[s.key];
        return (
          <button key={s.key} onClick={() => toggle(s.key)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 20, cursor: "pointer",
            fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
            border: `1.5px solid ${on ? s.color : C.border}`,
            background: on ? `${s.color}22` : "transparent",
            color: on ? s.color : C.muted,
            transition: "all 0.15s",
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: on ? s.color : C.muted, transition: "background 0.15s" }} />
            {s.name}
          </button>
        );
      })}
    </div>
  );

  const ChartBody = ({ gradPrefix }: { gradPrefix: string }) => (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <defs>
          {tank.sensors.map((s) => (
            <linearGradient key={s.key} id={`${gradPrefix}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={s.color} stopOpacity={0.35} />
              <stop offset="95%" stopColor={s.color} stopOpacity={0.03} />
            </linearGradient>
          ))}
        </defs>
        <YAxis
          yAxisId="left" orientation="left"
          stroke={C.muted} fontSize={11} tickLine={false} axisLine={false}
          width={1} mirror={true} dx={6}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
        {dualAxis && (
          <YAxis
            yAxisId="right" orientation="right"
            stroke={C.muted} fontSize={11} tickLine={false} axisLine={false}
            width={1} mirror={true} dx={-6}
            tickFormatter={(v: number) => `${v.toFixed(0)}°`}
          />
        )}
        <XAxis
          dataKey="ts" stroke={C.muted}
          tick={{ fill: C.muted, fontSize: 11, fontFamily: "DM Mono, monospace" }}
          tickLine={false} axisLine={false} minTickGap={60}
          tickFormatter={(v: any) =>
            new Date(v).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
          }
        />
        <Tooltip
          contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: "DM Mono, monospace", fontSize: 12, color: C.text }}
          formatter={(v: any, name: any) => {
            const s = tank.sensors.find((x) => x.key === name);
            return s ? [`${Number(v).toFixed(2)} ${s.unit}`, s.name] : [v, name];
          }}
          labelFormatter={(l: any) => new Date(l).toLocaleString("he-IL")}
        />
        <Brush
          dataKey="ts" height={36}
          stroke={C.border} fill={C.inner} travellerWidth={22}
          tickFormatter={(v: any) =>
            new Date(v).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
          }
        />
        {tank.sensors.map((s) => (
          <Area
            key={s.key}
            yAxisId={getAxisId(s.unit)}
            type="monotone"
            dataKey={s.key}
            stroke={visible[s.key] ? s.color : "transparent"}
            strokeWidth={2}
            fill={visible[s.key] ? `url(#${gradPrefix}-${s.key})` : "transparent"}
            dot={false}
            isAnimationActive={false}
            connectNulls
            name={s.key}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );

  const StatsRow = ({ large = false }: { large?: boolean }) => (
    <div style={{
      display: "flex", flexWrap: "wrap", gap: large ? "16px 48px" : "10px 28px",
      paddingTop: large ? 16 : 10,
      borderTop: `1px solid ${large ? "rgba(255,255,255,0.1)" : C.border}`,
    }}>
      {stats.map((s) => (
        <div key={s.key} style={{ display: "flex", flexDirection: "column", gap: large ? 6 : 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: large ? 8 : 6, marginBottom: large ? 6 : 4 }}>
            <div style={{ width: large ? 24 : 18, height: large ? 4 : 3, borderRadius: 2, background: s.color }} />
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: large ? 20 : 16, fontWeight: 700, color: s.color }}>
              {s.name}
            </span>
          </div>
          {[
            { tag: "min", val: s.minFmt, c: "#34d399" },
            { tag: "avg", val: s.avgFmt, c: accent },
            { tag: "max", val: s.maxFmt, c: "#f87171" },
          ].map(({ tag, val, c }) => (
            <span key={tag} style={{ fontFamily: "DM Mono, monospace", fontSize: large ? 18 : 14, color: C.muted }}>
              <span style={{ color: c, fontWeight: 700 }}>{tag} </span>
              {val}{" "}
              <span style={{ opacity: 0.55, fontSize: large ? 15 : 13 }}>{s.unit}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* ── Fullscreen overlay ────────────────────────────────────────── */}
      {fullscreen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "#050505",
          display: "flex", flexDirection: "column",
          padding: "16px 20px",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            marginBottom: 14, gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: "0.06em" }}>
              {tank.label}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flex: 1, justifyContent: "flex-end" }}>
              <ToggleButtons />
              <button onClick={() => setFullscreen(false)} style={{
                background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
                padding: "6px 14px", cursor: "pointer", color: C.text,
                display: "flex", alignItems: "center", gap: 6,
                fontFamily: "DM Sans, sans-serif", fontSize: 14, fontWeight: 600,
                flexShrink: 0,
              }}>
                <X style={{ width: 15, height: 15 }} /> סגור
              </button>
            </div>
          </div>

          {/* Chart — fills remaining height */}
          <div dir="ltr" style={{ flex: 1, minHeight: 0 }}>
            {histLoading ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: 28, height: 28, border: `3px solid ${C.border}`, borderTop: `3px solid ${accent}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              </div>
            ) : readings.length === 0 ? (
              <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ color: C.muted, fontSize: 14, fontFamily: "DM Sans, sans-serif" }}>אין נתונים לתקופה זו</span>
              </div>
            ) : <ChartBody gradPrefix="grad-fs" />}
          </div>

          {/* Stats */}
          <div style={{ marginTop: 16 }}>
            <StatsRow large />
          </div>
        </div>
      )}

      {/* ── Inline card ───────────────────────────────────────────────── */}
      <div style={{ background: C.inner, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px" }}>

        {/* Toggle buttons + fullscreen expand button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
          <ToggleButtons />
          <button onClick={() => setFullscreen(true)} title="הגדל גרף" style={{
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 8,
            padding: "5px 9px", cursor: "pointer", color: C.muted,
            display: "flex", alignItems: "center",
            flexShrink: 0, transition: "border-color 0.15s, color 0.15s",
          }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = accent; (e.currentTarget as HTMLElement).style.color = accent; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted; }}
          >
            <Maximize2 style={{ width: 15, height: 15 }} />
          </button>
        </div>

        {/* Chart */}
        {histLoading ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 18, height: 18, border: `2px solid ${C.border}`, borderTop: `2px solid ${accent}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
          </div>
        ) : readings.length === 0 ? (
          <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: C.muted, fontSize: 12, fontFamily: "DM Sans, sans-serif" }}>אין נתונים לתקופה זו</span>
          </div>
        ) : (
          <div dir="ltr" className="haifa-tank-chart">
            <ChartBody gradPrefix="grad-inline" />
          </div>
        )}

        {/* Stats */}
        <div style={{ marginTop: 10 }}>
          <StatsRow />
        </div>
      </div>
    </>
  );
}

// ── TankCard ──────────────────────────────────────────────────────────────────
function TankCard({
  tank, data, readings, histLoading, C, S, ACCENT: accent,
}: {
  tank: typeof TANKS[number]; data: any; readings: any[];
  histLoading: boolean; C: any; S: any; ACCENT: string;
}) {
  return (
    <div style={S.card}>
      <p style={{ color: C.text, fontSize: 15, fontFamily: "DM Sans, sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px", fontWeight: 700 }}>
        {tank.label}
      </p>

      {/* Live values */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
        {tank.sensors.map((s) => (
          <ValueCard
            key={s.key}
            name={s.name}
            value={data?.[s.key] ?? 0}
            unit={s.unit}
            color={s.color}
            alertLow={s.alertLow}
            alertHigh={s.alertHigh}
          />
        ))}
      </div>

      {/* Combined history chart */}
      <TankChart
        tank={tank}
        readings={readings}
        histLoading={histLoading}
        C={C}
        ACCENT={accent}
      />
    </div>
  );
}

// ── HaifaPage ─────────────────────────────────────────────────────────────────
export function HaifaPage({ token, userProfile, isDarkMode }: HaifaPageProps) {
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
    card: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: "16px 20px",
    } as React.CSSProperties,
  };

  // ── Live data ──────────────────────────────────────────────────────────────
  const [data, setData] = useState<HaifaData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLatest = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await apiFetch("/api/haifa/latest", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Failed to fetch Haifa data", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const startAutoRefresh = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => fetchLatest(true), 180_000);
  }, [fetchLatest]);

  useEffect(() => {
    fetchLatest();
    startAutoRefresh();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchLatest, startAutoRefresh]);

  const handleManualRefresh = useCallback(() => {
    fetchLatest(true);
    startAutoRefresh();
  }, [fetchLatest, startAutoRefresh]);

  // ── History data (split: chart vs table) ──────────────────────────────────
  const [range, setRange]           = useState<"today" | "yesterday" | "week" | "custom">("today");
  const [customFrom, setCustomFrom] = useState(toISODate(new Date()));
  const [customTo, setCustomTo]     = useState(toISODate(new Date()));

  // Chart data — hourly aggregated, small payload
  const [chartReadings, setChartReadings] = useState<any[]>([]);
  const [chartLoading,  setChartLoading]  = useState(false);

  // Table data — server-paginated; both sensor + energy tables share same page cursor
  const [tableRows,    setTableRows]    = useState<any[]>([]);
  const [tableTotal,   setTableTotal]   = useState(0);
  const [tablePage,    setTablePage]    = useState(0);
  const [tableLoading, setTableLoading] = useState(false);

  const buildUrl = useCallback((mode: string, extra = "") => {
    const { from, to } = getRangeDates(range, customFrom, customTo);
    return `/api/haifa/history?mode=${mode}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${extra}`;
  }, [range, customFrom, customTo]);

  const fetchChartData = useCallback(async () => {
    setChartLoading(true);
    try {
      const res = await apiFetch(buildUrl("chart"), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setChartReadings(await res.json());
    } catch (err) {
      console.error("Failed to fetch Haifa chart data", err);
    } finally {
      setChartLoading(false);
    }
  }, [token, buildUrl]);

  const fetchTablePage = useCallback(async (page: number) => {
    setTableLoading(true);
    try {
      const res = await apiFetch(
        buildUrl("table", `&page=${page}&size=${PAGE_SIZE}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const json = await res.json();
        setTableRows(json.data ?? []);
        setTableTotal(json.total ?? 0);
        setTablePage(page);
      }
    } catch (err) {
      console.error("Failed to fetch Haifa table page", err);
    } finally {
      setTableLoading(false);
    }
  }, [token, buildUrl]);

  const fetchAll = useCallback(async () => {
    fetchChartData();
    fetchTablePage(0);
  }, [fetchChartData, fetchTablePage]);

  useEffect(() => {
    if (range !== "custom") fetchAll();
  }, [range, fetchAll]);

  // ── Export — fetch all raw rows on demand ─────────────────────────────────
  const [exporting, setExporting] = useState(false);

  async function fetchExportRows(): Promise<any[]> {
    const res = await apiFetch(buildUrl("export"), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("export fetch failed");
    return res.json();
  }

  async function exportCSV() {
    if (exporting || tableTotal === 0) return;
    setExporting(true);
    try {
      const allRows = await fetchExportRows();
      const allKeys = TANKS.flatMap((t) => t.sensors.map((s) => s.key));
      const headers = ["timestamp", ...allKeys];
      const csvRows = allRows.map((r: any) =>
        headers.map((h) => { const v = r[h]; return v == null ? "" : String(v); }).join(",")
      );
      const csv = [headers.join(","), ...csvRows].join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `haifa-${customFrom}-${customTo}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("CSV export failed", err);
    } finally {
      setExporting(false);
    }
  }

  async function exportEnergyCsv() {
    if (exporting || tableTotal === 0) return;
    setExporting(true);
    try {
      const allRows = await fetchExportRows();
      const headers = ["timestamp", ...ENERGY_COLS.map((c) => `${c.key} (${c.unit})`)];
      const csvRows = allRows.map((r: any) =>
        [r.timestamp, ...ENERGY_COLS.map((c) => (r[c.key] != null ? Number(r[c.key]).toFixed(2) : ""))].join(",")
      );
      const csv = [headers.join(","), ...csvRows].join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "haifa-energy.csv"; a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Energy CSV export failed", err);
    } finally {
      setExporting(false);
    }
  }

  async function exportPDF() {
    if (exporting || tableTotal === 0) return;
    setExporting(true);
    try {
      const allRows = await fetchExportRows();
      const siteName = userProfile?.site_name ?? "ניטור איכות מים";
      const { from, to } = getRangeDates(range, customFrom, customTo);

      const statsHtml = TANKS.map((tank) => {
        const rows = tank.sensors.map((sensor) => {
          const vals = allRows
            .map((r: any) => r[sensor.key])
            .filter((v: any): v is number => v != null && !isNaN(v));
          const min  = vals.length ? Math.min(...vals).toFixed(3) : "—";
          const max  = vals.length ? Math.max(...vals).toFixed(3) : "—";
          const mean = vals.length ? (vals.reduce((a: number, b: number) => a + b, 0) / vals.length).toFixed(3) : "—";
          return `<tr><td>${sensor.name}</td><td>${sensor.unit}</td><td>${min}</td><td>${max}</td><td>${mean}</td></tr>`;
        }).join("");
        return `
          <h3>${tank.label}</h3>
          <table>
            <thead><tr><th>חיישן</th><th>יחידה</th><th>מינימום</th><th>מקסימום</th><th>ממוצע</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
      }).join("");

      const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8"/>
<title>דוח ${siteName}</title>
<style>
  body { font-family: Arial, sans-serif; direction: rtl; padding: 24px; color: #111; }
  h1   { font-size: 20px; margin-bottom: 4px; }
  p    { color: #555; font-size: 13px; margin: 0 0 20px; }
  h3   { font-size: 14px; margin: 20px 0 6px; color: #1e3a5f; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; font-size: 13px; }
  th  { background: #1e3a5f; color: #fff; padding: 6px 10px; text-align: right; }
  td  { padding: 5px 10px; border-bottom: 1px solid #ddd; text-align: right; }
  tr:nth-child(even) td { background: #f5f7fa; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>${siteName} — סיכום נתונים</h1>
  <p>תקופה: ${new Date(from).toLocaleDateString("he-IL")} – ${new Date(to).toLocaleDateString("he-IL")} | ${allRows.length} מדידות</p>
  ${statsHtml}
  <script>window.addEventListener('load', () => window.print());<\/script>
</body>
</html>`;
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (err) {
      console.error("PDF export failed", err);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div dir="rtl" style={{ minHeight: "100vh", background: C.page, padding: "20px 16px", fontFamily: "DM Sans, sans-serif" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .haifa-hdr { flex-wrap:wrap!important; gap:8px!important; }
        .haifa-tank-chart { height: 240px; }
        @media(max-width:600px){
          .haifa-hdr { flex-wrap:wrap!important; gap:8px!important; }
          .haifa-hdr-left { flex:1!important; order:1; min-width:0; }
          .haifa-hdr-refresh { order:2; flex-shrink:0; }
          .haifa-hdr-ts { order:3; width:100%!important; margin-left:0!important; background:${C.inner}; border:1px solid ${C.border}; border-radius:12px; padding:10px 14px!important; justify-content:flex-start!important; }
          .haifa-hdr-ts span { font-size:15px!important; color:${C.text}!important; }
          .haifa-tank-chart { height: 320px; }
        }
      `}</style>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="haifa-hdr" style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 10 }}>
        <div className="haifa-hdr-left" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Droplets style={{ color: ACCENT, width: 22, height: 22 }} />
          <h1 style={{ fontFamily: "DM Sans, sans-serif", fontSize: 18, fontWeight: 700, margin: 0, color: C.text }}>
            {userProfile?.site_name ?? "ניטור איכות מים"}
          </h1>
        </div>
        <div className="haifa-hdr-ts" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
          {data && (() => {
            const latestTs = new Date(data.timestamp);
            const msgsLastHour = data.msgs_last_hour ?? 0;
            const msgColor = msgsLastHour >= 10 ? "#34d399" : msgsLastHour >= 3 ? "#fbbf24" : "#f87171";
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
        <button
          className="haifa-hdr-refresh"
          onClick={handleManualRefresh}
          disabled={refreshing}
          style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: ACCENT, display: "flex", alignItems: "center", gap: 6, fontFamily: "DM Sans, sans-serif" }}
        >
          <RefreshCw style={{ width: 14, height: 14, animation: refreshing ? "spin 1s linear infinite" : "none" }} />
          <span style={{ fontSize: 14 }}>רענן</span>
        </button>
      </div>

      {/* ── Range selector + Export ───────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: range === "custom" ? 8 : 20 }}>
        {(["today", "yesterday", "week", "custom"] as const).map((r) => (
          <button key={r} onClick={() => { setRange(r); startAutoRefresh(); }}
            style={{
              padding: "6px 14px", borderRadius: 8, cursor: "pointer",
              fontFamily: "DM Sans, sans-serif", fontSize: 13,
              border: `1px solid ${range === r ? ACCENT : C.border}`,
              background: range === r ? `${ACCENT}22` : "transparent",
              color: range === r ? ACCENT : C.muted,
              transition: "all 0.15s",
            }}>
            {r === "today" ? "היום" : r === "yesterday" ? "אתמול" : r === "week" ? "שבוע" : "טווח מותאם"}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={exportCSV} disabled={tableTotal === 0 || exporting}
            style={{ padding: "6px 12px", borderRadius: 8, cursor: tableTotal > 0 ? "pointer" : "not-allowed", fontFamily: "DM Sans, sans-serif", fontSize: 13, border: `1px solid ${C.border}`, background: "transparent", color: tableTotal > 0 ? C.sub : C.muted, display: "flex", alignItems: "center", gap: 6, opacity: tableTotal > 0 ? 1 : 0.45 }}>
            <Download style={{ width: 14, height: 14 }} />
            {exporting ? "..." : "CSV"}
          </button>
          <button onClick={exportPDF} disabled={tableTotal === 0 || exporting}
            style={{ padding: "6px 12px", borderRadius: 8, cursor: tableTotal > 0 ? "pointer" : "not-allowed", fontFamily: "DM Sans, sans-serif", fontSize: 13, border: `1px solid ${C.border}`, background: "transparent", color: tableTotal > 0 ? C.sub : C.muted, display: "flex", alignItems: "center", gap: 6, opacity: tableTotal > 0 ? 1 : 0.45 }}>
            <FileText style={{ width: 14, height: 14 }} />
            PDF
          </button>
        </div>
      </div>

      {/* ── Custom date pickers ───────────────────────────────────────────── */}
      {range === "custom" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", color: C.text, fontFamily: "DM Mono, monospace", fontSize: 13, colorScheme: isDarkMode ? "dark" : "light" }} />
          <span style={{ color: C.muted, fontSize: 13 }}>עד</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", color: C.text, fontFamily: "DM Mono, monospace", fontSize: 13, colorScheme: isDarkMode ? "dark" : "light" }} />
          <button onClick={fetchAll}
            style={{ padding: "6px 16px", borderRadius: 8, cursor: "pointer", fontFamily: "DM Sans, sans-serif", fontSize: 13, border: `1px solid ${ACCENT}`, background: `${ACCENT}22`, color: ACCENT }}>
            הצג
          </button>
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────────── */}
      {loading && !data ? (
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
          <div style={{ textAlign: "center", color: C.muted }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${C.border}`, borderTop: `3px solid ${ACCENT}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
            <p style={{ fontSize: 13, fontFamily: "DM Sans, sans-serif" }}>טוען נתונים...</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, opacity: refreshing ? 0.45 : 1, transition: "opacity 0.2s", position: "relative", pointerEvents: refreshing ? "none" : "auto" }}>
          {refreshing && (
            <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 20, padding: "6px 16px", display: "flex", alignItems: "center", gap: 8, fontFamily: "DM Sans, sans-serif", fontSize: 13, color: C.muted, boxShadow: "0 4px 16px rgba(0,0,0,0.3)" }}>
              <div style={{ width: 14, height: 14, border: `2px solid ${C.border}`, borderTop: `2px solid ${ACCENT}`, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
              טוען...
            </div>
          )}

          <div id="haifa-tank1">
            {TANKS.map((tank) => (
              <TankCard
                key={tank.label}
                tank={tank}
                data={data}
                readings={chartReadings}
                histLoading={chartLoading}
                C={C}
                S={S}
                ACCENT={ACCENT}
              />
            ))}
          </div>

          {/* ── Energy meter section ─────────────────────────────────── */}
          {data && (data.VL1_N != null || data.AL1 != null || data.KWTOT != null) && (
            <div id="haifa-energy" style={S.card}>
              <p style={{ color: C.text, fontSize: 15, fontFamily: "DM Sans, sans-serif", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 14px", fontWeight: 700 }}>
                מד אנרגיה
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <p style={{ color: C.muted, fontSize: 12, fontFamily: "DM Sans, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>מתחים</p>
                  <div dir="ltr" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <ValueCard name="L1-N" value={data.VL1_N ?? 0} unit="V" color="#facc15" alertLow={0} alertHigh={999999} />
                    <ValueCard name="L2-N" value={data.VL2_N ?? 0} unit="V" color="#facc15" alertLow={0} alertHigh={999999} />
                    <ValueCard name="L3-N" value={data.VL3_N ?? 0} unit="V" color="#facc15" alertLow={0} alertHigh={999999} />
                  </div>
                </div>
                <div>
                  <p style={{ color: C.muted, fontSize: 12, fontFamily: "DM Sans, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>זרמים</p>
                  <div dir="ltr" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <ValueCard name="L1" value={data.AL1 ?? 0} unit="A" color="#60a5fa" alertLow={0} alertHigh={999999} />
                    <ValueCard name="L2" value={data.AL2 ?? 0} unit="A" color="#60a5fa" alertLow={0} alertHigh={999999} />
                    <ValueCard name="L3" value={data.AL3 ?? 0} unit="A" color="#60a5fa" alertLow={0} alertHigh={999999} />
                  </div>
                </div>
                <div>
                  <p style={{ color: C.muted, fontSize: 12, fontFamily: "DM Sans, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px" }}>הספק</p>
                  <div dir="ltr" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <ValueCard name="L1" value={data.KWL1 ?? 0} unit="kW" color="#34d399" alertLow={0} alertHigh={999999} />
                    <ValueCard name="L2" value={data.KWL2 ?? 0} unit="kW" color="#34d399" alertLow={0} alertHigh={999999} />
                    <ValueCard name="L3" value={data.KWL3 ?? 0} unit="kW" color="#34d399" alertLow={0} alertHigh={999999} />
                    <ValueCard name="סה״כ" value={data.KWTOT ?? 0} unit="kW" color="#fb923c" alertLow={0} alertHigh={999999} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div id="haifa-table">
            <DataTable
              rows={tableRows}
              total={tableTotal}
              page={tablePage}
              onPageChange={(p) => fetchTablePage(p)}
              onExportCSV={exportCSV}
              onExportPDF={exportPDF}
              tableLoading={tableLoading}
              C={C}
              ACCENT={ACCENT}
            />
          </div>

          <div id="haifa-energy-table">
            <EnergyTable
              rows={tableRows}
              total={tableTotal}
              page={tablePage}
              onPageChange={(p) => fetchTablePage(p)}
              tableLoading={tableLoading}
              onExportCSV={exportEnergyCsv}
              C={C}
              ACCENT={ACCENT}
            />
          </div>
        </div>
      )}
    </div>
  );
}
