// ─── alertColor ───────────────────────────────────────────────────
// green / yellow / red based on value vs thresholds
export function alertColor(value, alertLow, alertHigh) {
  if (value >= alertHigh) return "#f87171"; // red
  if (value <= alertLow)  return "#fbbf24"; // yellow
  return "#34d399";                          // green
}

// ─── groupByDay ───────────────────────────────────────────────────
// [{ timestamp, value }] → [{ date: "MM-DD", avg }]
export function groupByDay(rows) {
  const map = {};
  rows.forEach(({ timestamp, value }) => {
    const day = timestamp.slice(0, 10);
    if (!map[day]) map[day] = { total: 0, count: 0 };
    map[day].total += value;
    map[day].count += 1;
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { total, count }]) => ({
      date: date.slice(5),
      avg:  Math.round(total / count),
    }));
}

// ─── fmtTime ──────────────────────────────────────────────────────
export function fmtTime(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }) +
    "  " +
    d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })
  );
}

// ─── clamp ────────────────────────────────────────────────────────
export const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
