import { alertColor, clamp } from "./helpers";

/**
 * Tank – rectangular vessel filling from bottom.
 * Props: value, min, max, unit, alertLow, alertHigh
 */
export default function Tank({ value, min, max, unit, alertLow, alertHigh, isDarkMode = true }) {
  const pct    = clamp((value     - min) / (max - min), 0, 1);
  const pctLow = clamp((alertLow  - min) / (max - min), 0, 1);
  const pctHi  = clamp((alertHigh - min) / (max - min), 0, 1);
  const color  = alertColor(value, alertLow, alertHigh);

  const labelColor = isDarkMode ? "#f1f5f9" : "#1e293b";
  const W = 100, H = 140, X = 70, Y = 20;
  const fillH = H * pct;
  const fillY = Y + H - fillH;
  const yLow  = Y + H - H * pctLow;
  const yHi   = Y + H - H * pctHi;

  const wave = fillH > 2
    ? `M ${X} ${fillY + 4} Q ${X+25} ${fillY-4} ${X+50} ${fillY+4} Q ${X+75} ${fillY+10} ${X+W} ${fillY+4} L ${X+W} ${Y+H} L ${X} ${Y+H} Z`
    : `M ${X} ${Y+H} L ${X+W} ${Y+H} Z`;

  return (
    <svg viewBox="0 0 240 210" style={{ width: "100%", maxWidth: 220, display: "block", margin: "0 auto" }}>
      <defs>
        <clipPath id="tankBodyClip">
          <rect x={X} y={Y} width={W} height={H} rx={6} />
        </clipPath>
      </defs>
      <rect x={X-2} y={Y-2} width={W+4} height={H+4} rx={8} fill="none" stroke="#1a2a3a" strokeWidth={3} />
      <rect x={X} y={Y} width={W} height={H} rx={6} fill="#08111a" />
      {fillH > 0 && <>
        <path d={wave} fill={color} fillOpacity={0.35} clipPath="url(#tankBodyClip)" />
        <rect x={X} y={fillY+6} width={W} height={Math.max(fillH-6,0)} fill={color} fillOpacity={0.22} clipPath="url(#tankBodyClip)" />
        <line x1={X+4} y1={fillY+4} x2={X+W-4} y2={fillY+4} stroke={color} strokeWidth={1.5} strokeOpacity={0.8} style={{ filter:`drop-shadow(0 0 3px ${color})` }} />
      </>}
      <line x1={X-8} y1={yLow} x2={X+W+8} y2={yLow} stroke="#fbbf24" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.7} />
      <line x1={X-8} y1={yHi}  x2={X+W+8} y2={yHi}  stroke="#f87171" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.7} />
      {[0,25,50,75,100].map(p => {
        const ty = Y + H - H*p/100;
        return <g key={p}>
          <line x1={X-12} y1={ty} x2={X} y2={ty} stroke={labelColor} strokeWidth={1} strokeOpacity={0.5} />
          <text x={X-14} y={ty-2} textAnchor="end" fontSize={8} fill={labelColor} fontFamily="'DM Mono',monospace">
            {Math.round(min + (max-min)*p/100)}
          </text>
        </g>;
      })}
      <text x={X+W/2} y={Y+H+28} textAnchor="middle" fontSize={24} fill="#f1f5f9" fontFamily="'Bebas Neue',sans-serif" letterSpacing={1}>
        {value.toLocaleString()}
      </text>
      <text x={X+W/2} y={Y+H+46} textAnchor="middle" fontSize={11} fill="#64748b" fontFamily="'DM Mono',monospace">
        {unit}
      </text>
    </svg>
  );
}
