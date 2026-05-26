import { alertColor, clamp } from "./helpers";

/**
 * Silo – cylinder body + cone bottom, fills from bottom up.
 * Props: value, min, max, unit, alertLow, alertHigh
 */
export default function Silo({ value, min, max, unit, alertLow, alertHigh, isDarkMode = true }) {
  const pct    = clamp((value     - min) / (max - min), 0, 1);
  const pctLow = clamp((alertLow  - min) / (max - min), 0, 1);
  const pctHi  = clamp((alertHigh - min) / (max - min), 0, 1);
  const color  = alertColor(value, alertLow, alertHigh, true);

  const labelColor = isDarkMode ? "#f1f5f9" : "#1e293b";
  const cx = 120;
  const bodyX = 70, bodyW = 100, bodyY = 12, bodyH = 120;
  const coneH = 36, spoutH = 8, spoutW = 14;
  const coneY  = bodyY + bodyH;
  const spoutY = coneY + coneH;
  const coneL  = cx - bodyW/2, coneR = cx + bodyW/2;
  const spoutL = cx - spoutW/2, spoutR = cx + spoutW/2;

  const totalH    = bodyH + coneH;
  const fillPx    = totalH * pct;
  const coneFillH = Math.min(fillPx, coneH);
  const bodyFillH = Math.max(fillPx - coneH, 0);
  const bodyFillY = bodyY + bodyH - bodyFillH;

  const threshY = (p) => {
    const bp = clamp((totalH*p - coneH) / bodyH, 0, 1);
    return bodyY + bodyH - bp * bodyH;
  };

  return (
    <svg viewBox="0 0 240 220" style={{ width: "100%", maxWidth: 220, display: "block", margin: "0 auto" }}>
      <defs>
        <clipPath id="siloBodyClip">
          <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} />
        </clipPath>
        <clipPath id="siloConeClip">
          <polygon points={`${coneL},${coneY} ${coneR},${coneY} ${spoutR},${spoutY} ${spoutL},${spoutY}`} />
        </clipPath>
      </defs>
      <rect x={bodyX} y={bodyY} width={bodyW} height={bodyH} fill="#08111a" stroke="#1a2a3a" strokeWidth={2.5} />
      <line x1={bodyX} y1={bodyY} x2={bodyX+bodyW} y2={bodyY} stroke="#243447" strokeWidth={4} strokeLinecap="round" />
      <polygon points={`${coneL},${coneY} ${coneR},${coneY} ${spoutR},${spoutY} ${spoutL},${spoutY}`} fill="#08111a" stroke="#1a2a3a" strokeWidth={2.5} />
      <rect x={spoutL} y={spoutY} width={spoutW} height={spoutH} fill="#0d1b2a" stroke="#1a2a3a" strokeWidth={1.5} />
      {coneFillH > 0 && (() => {
        const t = coneFillH / coneH;
        const fL = spoutL + (coneL-spoutL)*t, fR = spoutR + (coneR-spoutR)*t;
        const fTopY = spoutY + coneH - coneFillH;
        return <polygon points={`${fL},${fTopY} ${fR},${fTopY} ${spoutR},${spoutY+spoutH} ${spoutL},${spoutY+spoutH}`} fill={color} fillOpacity={0.3} clipPath="url(#siloConeClip)" />;
      })()}
      {bodyFillH > 0 && <>
        <rect x={bodyX} y={bodyFillY} width={bodyW} height={bodyFillH} fill={color} fillOpacity={0.25} clipPath="url(#siloBodyClip)" />
        <line x1={bodyX+4} y1={bodyFillY} x2={bodyX+bodyW-4} y2={bodyFillY} stroke={color} strokeWidth={1.5} strokeOpacity={0.8} style={{ filter:`drop-shadow(0 0 3px ${color})` }} />
      </>}
      <line x1={bodyX-8} y1={threshY(pctLow)} x2={bodyX+bodyW+8} y2={threshY(pctLow)} stroke="#f87171" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.7} />
      <line x1={bodyX-8} y1={threshY(pctHi)}  x2={bodyX+bodyW+8} y2={threshY(pctHi)}  stroke="#fbbf24" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.7} />
      {[0,50,100].map(p => {
        const ty = bodyY + bodyH - bodyH*p/100;
        return <g key={p}>
          <line x1={bodyX-12} y1={ty} x2={bodyX} y2={ty} stroke={labelColor} strokeWidth={1} strokeOpacity={0.5} />
          <text x={bodyX-14} y={ty-2} textAnchor="end" fontSize={8} fill={labelColor} fontFamily="'DM Mono',monospace">
            {p===0 ? min : p===100 ? max : Math.round((min+max)/2)}
          </text>
        </g>;
      })}
      <text x={cx} y={spoutY+spoutH+26} textAnchor="middle" fontSize={24} fill="#f1f5f9" fontFamily="'Bebas Neue',sans-serif" letterSpacing={1}>
        {value.toLocaleString()}
      </text>
      <text x={cx} y={spoutY+spoutH+44} textAnchor="middle" fontSize={11} fill="#64748b" fontFamily="'DM Mono',monospace">
        {unit}
      </text>
    </svg>
  );
}
