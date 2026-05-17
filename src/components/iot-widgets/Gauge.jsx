import { alertColor, clamp } from "./helpers";

/**
 * Gauge – arc-style meter (270° sweep).
 *
 * Props:
 *   value      {number}  – current reading
 *   min        {number}  – scale minimum
 *   max        {number}  – scale maximum
 *   unit       {string}  – "kg" | "%" | "bar" | "°C" | …
 *   alertLow   {number}  – yellow threshold
 *   alertHigh  {number}  – red threshold
 *
 * ⚠️  Geometry constants – do NOT change:
 *   cx=120, cy=100, R=82
 *   Value text: cy + R + 28  (below arc, never overlaps needle)
 *   Unit  text: cy + R + 46
 *   viewBox height: cy + R + 58  (computed, never clips)
 */
export default function Gauge({ value, min, max, unit, alertLow, alertHigh }) {
  const pct    = clamp((value     - min) / (max - min), 0, 1);
  const pctLow = clamp((alertLow  - min) / (max - min), 0, 1);
  const pctHi  = clamp((alertHigh - min) / (max - min), 0, 1);

  const polar = (cx, cy, r, deg) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const arc = (cx, cy, r, s, e) => {
    const sp = polar(cx, cy, r, s), ep = polar(cx, cy, r, e);
    return `M ${sp.x} ${sp.y} A ${r} ${r} 0 ${e - s > 180 ? 1 : 0} 1 ${ep.x} ${ep.y}`;
  };

  const cx = 120, cy = 100, R = 82;
  const T0 = -135, SWEEP = 270;
  const toAngle = (p) => T0 + p * SWEEP;
  const color   = alertColor(value, alertLow, alertHigh);

  const needleAngle = toAngle(pct);
  const tip  = polar(cx, cy, R - 4,  needleAngle);
  const heel = polar(cx, cy, 10,     needleAngle + 180);
  const lp   = polar(cx, cy, 3.5,    needleAngle - 90);
  const rp   = polar(cx, cy, 3.5,    needleAngle + 90);

  const lowDot = polar(cx, cy, R + 11, toAngle(pctLow));
  const hiDot  = polar(cx, cy, R + 11, toAngle(pctHi));
  const minPos = polar(cx, cy, R + 26, T0);
  const maxPos = polar(cx, cy, R + 26, T0 + SWEEP);

  const vbH = cy + R + 58;

  return (
    <svg viewBox={`0 0 240 ${vbH}`} style={{ width: "100%", maxWidth: 220, display: "block", margin: "0 auto" }}>
      {/* Background track */}
      <path d={arc(cx, cy, R, T0, T0 + SWEEP)} fill="none" stroke="#1a2a3a" strokeWidth={16} strokeLinecap="round" />
      {/* Zone tints */}
      <path d={arc(cx, cy, R, T0, toAngle(pctLow))} fill="none" stroke="#34d39930" strokeWidth={16} strokeLinecap="round" />
      {pctLow < pctHi && (
        <path d={arc(cx, cy, R, toAngle(pctLow), toAngle(pctHi))} fill="none" stroke="#fbbf2430" strokeWidth={16} strokeLinecap="round" />
      )}
      <path d={arc(cx, cy, R, toAngle(pctHi), T0 + SWEEP)} fill="none" stroke="#f8717130" strokeWidth={16} strokeLinecap="round" />
      {/* Value fill */}
      {pct > 0 && (
        <path d={arc(cx, cy, R, T0, toAngle(pct))} fill="none" stroke={color} strokeWidth={16} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${color}99)` }} />
      )}
      {/* Inner circle */}
      <circle cx={cx} cy={cy} r={R - 12} fill="var(--card)" stroke="var(--border)" strokeWidth={1.5} />
      {/* Threshold dots */}
      <circle cx={lowDot.x} cy={lowDot.y} r={3.5} fill="#fbbf24" />
      <circle cx={hiDot.x}  cy={hiDot.y}  r={3.5} fill="#f87171" />
      {/* Needle – thin */}
      <line x1={heel.x} y1={heel.y} x2={tip.x} y2={tip.y}
        stroke={color} strokeWidth={1.5} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
      <polygon points={`${tip.x},${tip.y} ${lp.x},${lp.y} ${rp.x},${rp.y}`} fill={color} />
      <circle cx={cx} cy={cy} r={5} fill="#cbd5e1" />
      {/* Min / Max labels at arc endpoints */}
      <text x={minPos.x} y={minPos.y + 4} textAnchor="middle" fontSize={13} fill="#f1f5f9" fontFamily="'DM Mono',monospace">{min}</text>
      <text x={maxPos.x} y={maxPos.y + 4} textAnchor="middle" fontSize={13} fill="#f1f5f9" fontFamily="'DM Mono',monospace">{max}</text>
      {/* Value – below arc */}
      <text x={cx} y={cy + R + 28} textAnchor="middle" fontSize={24} fontWeight={700} fill="var(--foreground)" fontFamily="'Bebas Neue',sans-serif" letterSpacing={1}>
        {value.toLocaleString()}
      </text>
      {/* Unit */}
      <text x={cx} y={cy + R + 46} textAnchor="middle" fontSize={16} fill="#f1f5f9" fontFamily="'DM Mono',monospace">
        {unit}
      </text>
    </svg>
  );
}
