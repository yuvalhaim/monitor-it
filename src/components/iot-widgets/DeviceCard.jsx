import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import Gauge from "./Gauge";
import Tank  from "./Tank";
import Silo  from "./Silo";
import { alertColor, groupByDay, fmtTime } from "./helpers";

const VIZ  = { gauge: Gauge, tank: Tank, silo: Silo };
const ICON = { gauge: "⚖", tank: "🛢", silo: "🌾" };

function BTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#08111a", border: "1px solid #1e3a5f", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontFamily: "'DM Mono',monospace", color: "#e2e8f0" }}>
      <div style={{ color: "#64748b", marginBottom: 3 }}>{label}</div>
      <div>ממוצע: <b style={{ color: "#38bdf8" }}>{payload[0]?.value} {unit}</b></div>
    </div>
  );
}

/**
 * DeviceCard – full card: visualization + daily bar chart + 50-row samples table.
 *
 * Props:
 *   device {object}:
 *     id, type ("gauge"|"tank"|"silo"), name, description,
 *     unit, min, max, alertLow, alertHigh,
 *     fetchData: async (id) => [{ timestamp, value }]
 */
export default function DeviceCard({ device }) {
  const { name, description, unit, min, max, alertLow, alertHigh, type, fetchData } = device;

  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [tableOpen, setTableOpen] = useState(false);

  useEffect(() => {
    fetchData(device.id).then((d) => { setRows(d); setLoading(false); });
  }, [device.id]);

  const latest      = rows.length ? rows[rows.length - 1].value : min;
  const daily       = groupByDay(rows);
  const last50      = [...rows].reverse().slice(0, 50);
  const color       = alertColor(latest, alertLow, alertHigh);
  const statusLabel = latest >= alertHigh ? "חריגה" : latest <= alertLow ? "אזהרה" : "תקין";
  const Viz         = VIZ[type] ?? Gauge;

  return (
    <div style={{
      background: "#0d1b2a",
      border: `1px solid ${color}44`,
      borderRadius: 18,
      display: "flex",
      flexDirection: "column",
      boxShadow: `0 4px 24px ${color}12`,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "14px 18px 12px", borderBottom: "1px solid #1a2a3a", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>
            {ICON[type] ?? "📡"} {name}
          </div>
          <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{description}</div>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.8, padding: "3px 10px", borderRadius: 99, background: color + "22", color, border: `1px solid ${color}55` }}>
          {statusLabel}
        </span>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#475569", fontSize: 12 }}>טוען...</div>
      ) : (
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Visualization */}
          <Viz value={latest} min={min} max={max} unit={unit} alertLow={alertLow} alertHigh={alertHigh} />

          {/* Bar chart */}
          <div>
            <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: "#475569", marginBottom: 8 }}>ממוצע יומי</div>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={daily} barSize={18} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2a3a" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 9, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#475569", fontSize: 9, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} />
                <Tooltip content={<BTooltip unit={unit} />} cursor={{ fill: "#1e3a5f22" }} />
                <ReferenceLine y={alertHigh} stroke="#f87171" strokeDasharray="4 3" strokeWidth={1} />
                <ReferenceLine y={alertLow}  stroke="#fbbf24" strokeDasharray="4 3" strokeWidth={1} />
                <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                  {daily.map((d, i) => (
                    <Cell key={i} fill={alertColor(d.avg, alertLow, alertHigh)} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Samples table */}
          <div>
            <div
              onClick={() => setTableOpen((o) => !o)}
              style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 2, color: "#475569", marginBottom: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", userSelect: "none" }}
            >
              <span>50 דגימות אחרונות</span>
              <span style={{ color: "#38bdf8", fontSize: 10 }}>{tableOpen ? "▲" : "▼"}</span>
            </div>
            {tableOpen && (
              <div style={{ maxHeight: 280, overflowY: "auto", borderRadius: 10, border: "1px solid #1a2a3a" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'DM Mono',monospace" }}>
                  <thead>
                    <tr style={{ background: "#08111a", position: "sticky", top: 0, zIndex: 1 }}>
                      {["#", "זמן", "ערך", "סטטוס"].map((h) => (
                        <th key={h} style={{ padding: "7px 10px", textAlign: "right", color: "#475569", fontWeight: 500, fontSize: 9, letterSpacing: 1, borderBottom: "1px solid #1a2a3a" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {last50.map((r, i) => {
                      const c   = alertColor(r.value, alertLow, alertHigh);
                      const lbl = r.value >= alertHigh ? "חריגה" : r.value <= alertLow ? "אזהרה" : "תקין";
                      return (
                        <tr key={i} style={{ background: i % 2 === 0 ? "#0a151f" : "transparent", borderBottom: "1px solid #0d1b2a" }}>
                          <td style={{ padding: "6px 10px", color: "#334155" }}>{i + 1}</td>
                          <td style={{ padding: "6px 10px", color: "#64748b" }}>{fmtTime(r.timestamp)}</td>
                          <td style={{ padding: "6px 10px", color: c, fontWeight: 600 }}>{r.value.toLocaleString()} {unit}</td>
                          <td style={{ padding: "6px 10px" }}>
                            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 99, background: c + "22", color: c, border: `1px solid ${c}44` }}>{lbl}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
