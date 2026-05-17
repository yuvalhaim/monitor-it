import { alertColor } from "./helpers";

/**
 * ValueCard – large value display, no chart, no table.
 * Auto-colors by unit string, or use alertLow/alertHigh for threshold logic.
 *
 * Props:
 *   name        {string}   – parameter label, e.g. "O2", "pH", "Pressure"
 *   value       {number}   – current reading
 *   unit        {string}   – "mg/L" | "°C" | "bar" | "%" | …
 *   color       {string?}  – override hex color
 *   alertLow    {number?}  – yellow threshold
 *   alertHigh   {number?}  – red threshold
 *   decimals    {number?}  – decimal places (default: 2)
 */

const UNIT_COLORS = {
  // Water quality
  "ph":      "#a78bfa",
  "mg/l":    "#fb923c",
  "o2":      "#fb923c",
  "orp":     "#38bdf8",
  "ntu":     "#a3e635",
  // Temperature
  "°c":      "#f87171",
  "°f":      "#f87171",
  // Pressure
  "bar":     "#60a5fa",
  "psi":     "#60a5fa",
  "kpa":     "#60a5fa",
  "mbar":    "#60a5fa",
  // Flow / volume
  "m³/h":    "#34d399",
  "l/min":   "#34d399",
  "m³":      "#34d399",
  // Weight / level
  "kg":      "#fbbf24",
  "g":       "#fbbf24",
  "ton":     "#fbbf24",
  "%":       "#818cf8",
  "m":       "#818cf8",
  "cm":      "#818cf8",
  "mm":      "#818cf8",
  // Electrical
  "v":       "#facc15",
  "a":       "#facc15",
  "kw":      "#facc15",
  "kwh":     "#facc15",
  "hz":      "#e879f9",
  // Fallback
  default:   "#64748b",
};

function resolveColor(unit, value, alertLow, alertHigh) {
  if (alertLow !== undefined && alertHigh !== undefined)
    return alertColor(value, alertLow, alertHigh);
  const key = unit?.toLowerCase().trim();
  return UNIT_COLORS[key] ?? UNIT_COLORS.default;
}

export default function ValueCard({ name, value, unit, color, alertLow, alertHigh, decimals = 2 }) {
  const accent  = color ?? resolveColor(unit, value, alertLow, alertHigh);
  const display = typeof value === "number" ? value.toFixed(decimals) : "—";

  return (
    <div style={{
      background: `linear-gradient(145deg, ${accent}22 0%, ${accent}0a 100%)`,
      border: `1px solid ${accent}55`,
      borderRadius: 16,
      padding: "18px 20px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      boxShadow: `0 0 24px ${accent}18, inset 0 1px 0 ${accent}22`,
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Glow blob */}
      <div style={{
        position: "absolute", top: -30, right: -30,
        width: 120, height: 120, borderRadius: "50%",
        background: accent, opacity: 0.08,
        filter: "blur(30px)", pointerEvents: "none",
      }} />

      {/* Name */}
      <div style={{
        fontSize: 14, fontFamily: "'DM Sans',sans-serif",
        textTransform: "uppercase", letterSpacing: 1,
        color: accent, opacity: 0.9, fontWeight: 600,
      }}>
        {name}
      </div>

      {/* Value + unit */}
      <div dir="ltr" style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
        <span style={{
          fontSize: 52,
          fontFamily: "'Bebas Neue',sans-serif",
          fontWeight: 400,
          color: "var(--foreground)",
          lineHeight: 1,
          letterSpacing: 2,
        }}>
          {display}
        </span>
        <span style={{
          fontSize: 16, fontFamily: "'DM Mono',monospace",
          color: accent, opacity: 0.75, paddingBottom: 4,
        }}>
          {unit}
        </span>
      </div>

      {/* Bottom accent line */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, transparent, ${accent}88, transparent)`,
        borderRadius: "0 0 16px 16px",
      }} />
    </div>
  );
}
