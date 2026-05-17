
# CLAUDE.md
# Project context for Claude in VS Code.
# Place this file at the root of your project.

---

## 1 · Frontend Design Skill

Create distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics.
Implement real working code with exceptional attention to aesthetic details and creative choices.

### Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick a clear direction — brutally minimal, maximalist, retro-futuristic, organic/natural, luxury/refined, playful, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. Commit fully.
- **Constraints**: Technical requirements (framework, performance, accessibility, mobile responsiveness).
- **Differentiation**: What makes this UNFORGETTABLE?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

Then implement working code (React/TypeScript, HTML/CSS/JS, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail
- Mobile-responsive by default

### Frontend Aesthetics Guidelines

- **Typography**: Distinctive font pairings only. Never use Inter, Roboto, Arial, or system fonts. Use Google Fonts / CDN. Every project should feel typographically unique.
- **Color & Theme**: Cohesive palette with CSS variables. Dominant colors + sharp accents. Support dark/light modes when relevant. For IoT dashboards: high-contrast data-centric palettes.
- **Motion**: CSS animations for HTML, Framer Motion for React. High-impact moments: page load stagger, scroll-trigger, hover surprises.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements.
- **Backgrounds**: Gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows. Never flat solid colors.

### Never Do

- Overused fonts (Inter, Roboto, Arial, system fonts)
- Cliché purple gradients on white
- Predictable layouts / cookie-cutter SaaS templates
- Same design repeated across projects

### Stack Defaults

When not specified:
- **React + TypeScript** with functional components and hooks
- **Tailwind CSS** (extend with custom CSS when needed)
- **Responsive-first** — mobile is not an afterthought
- **RTL support** — include `dir="rtl"` when Hebrew content is involved
- **Accessible** — semantic HTML, ARIA labels, keyboard navigation

### Dashboard & Data UI Guidelines

- Clear visual hierarchy: metrics → charts → controls
- Status indicators: color + icon (never color alone)
- Real-time data: subtle pulse/update animations
- Consistent card spacing and border radius
- Prefer data density over excessive whitespace — industrial users want information
- Always include loading, empty, and error states

---

## 2 · IoT Widgets Library

**Location**: `src/components/iot-widgets/`

### File Structure

```
src/components/iot-widgets/
├── helpers.js       – alertColor, groupByDay, fmtTime, clamp
├── Gauge.jsx        – arc meter (270° sweep), any unit
├── Tank.jsx         – rectangular vessel, fills from bottom
├── Silo.jsx         – cylinder + cone bottom, fills from bottom
├── ValueCard.jsx    – large value display, auto-color by unit
├── DeviceCard.jsx   – full card: viz + daily bar chart + 50-row table
└── index.js         – re-exports everything
```

### Installation

```bash
npm install recharts
```

Add to `index.html` (fonts used across all widgets):
```html
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&family=Bebas+Neue&display=swap" rel="stylesheet"/>
```

### Design System

| Role | Value |
|------|-------|
| Background | `#060d14` |
| Card | `#0d1b2a` |
| Inner / deep | `#08111a` |
| Border | `#1a2a3a` |
| Text primary | `#f1f5f9` |
| Text muted | `#475569` |
| Alert green | `#34d399` |
| Alert yellow | `#fbbf24` |
| Alert red | `#f87171` |
| Font – numbers | `Bebas Neue` (uniform, bold, all-caps digits) |
| Font – labels | `DM Mono` |
| Font – headings | `Syne` |

### Data Contract

Every `fetchData` function must return:
```js
[{ timestamp: "2025-04-14T09:00:00", value: 428 }, ...]
```
- `timestamp` — ISO 8601 string
- `value` — numeric reading (any unit)
- **Do NOT rename these fields** — used throughout DeviceCard and helpers

`fetchData` is passed as a prop on the device object:
```jsx
<DeviceCard device={{ ...deviceConfig, fetchData }} />
```

### Device Config Object

```js
{
  id:          number | string,
  type:        "gauge" | "tank" | "silo",
  name:        string,          // e.g. "Main Pressure Line"
  description: string,          // e.g. "Compressor #1"
  unit:        string,          // "kg" | "%" | "bar" | "°C" | "m³" | "mg/L" | …
  min:         number,
  max:         number,
  alertLow:    number,          // yellow: value <= alertLow
  alertHigh:   number,          // red:    value >= alertHigh
  fetchData:   async (id) => [{ timestamp, value }]
}
```

### Gauge — Critical Geometry (do NOT change)

```
cx = 120, cy = 100, R = 82
Value text Y : cy + R + 28  ← below arc, never overlaps needle
Unit  text Y : cy + R + 46
viewBox height: cy + R + 58  ← computed, never clips
Needle: strokeWidth 1.5, tip at R-4, heel at radius 10
```

Changing these values will break the layout. Only modify if explicitly asked.

### ValueCard — Auto Colors by Unit

| Unit | Color |
|------|-------|
| pH | `#a78bfa` purple |
| mg/L, O2 | `#fb923c` orange |
| ORP | `#38bdf8` cyan |
| °C, °F | `#f87171` red |
| bar, psi, kPa | `#60a5fa` blue |
| kg, g, ton | `#fbbf24` yellow |
| %, m, cm, mm | `#818cf8` indigo |
| V, A, kW, kWh | `#facc15` electric yellow |
| Hz | `#e879f9` fuchsia |
| m³/h, L/min | `#34d399` green |
| unknown | `#64748b` grey |

Override with `color="#hex"` prop. Use `alertLow`/`alertHigh` to switch to threshold-based coloring.

### SQL Integration

```js
async function fetchData(deviceId) {
  const res = await fetch(`/api/readings?device=${deviceId}&limit=50`);
  return res.json();
}
// SQL: SELECT TOP 50 timestamp, value
//      FROM readings
//      WHERE device_id = @deviceId
//      ORDER BY timestamp DESC
```

### Usage Examples

```jsx
import { Gauge, Tank, Silo, ValueCard, DeviceCard } from "./iot-widgets";

// Standalone widgets — pass value directly
<Gauge     value={428}  min={0} max={600}  unit="kg"   alertLow={150} alertHigh={480} />
<Tank      value={62}   min={0} max={100}  unit="%"    alertLow={20}  alertHigh={85}  />
<Silo      value={32}   min={0} max={50}   unit="ton"  alertLow={10}  alertHigh={45}  />
<ValueCard name="O2"    value={7.8}        unit="mg/L" />
<ValueCard name="pH"    value={8.22}       unit="pH"   alertLow={6.5} alertHigh={9.0} />

// Full card — fetches its own data
<DeviceCard device={{ id:1, type:"gauge", name:"Compressor", description:"Unit A",
  unit:"bar", min:0, max:10, alertLow:1.5, alertHigh:8, fetchData }} />

// Dashboard grid
const DEVICES = [ /* array of device config objects */ ];
{DEVICES.map(dev => <DeviceCard key={dev.id} device={{ ...dev, fetchData }} />)}
```

### How to Add a New Widget Type

1. Create `NewWidget.jsx` in `iot-widgets/`
2. Import `{ alertColor, clamp }` from `./helpers`
3. Accept props: `{ value, min, max, unit, alertLow, alertHigh }`
4. Export as default
5. Add to `index.js`: `export { default as NewWidget } from "./NewWidget"`
6. Register in `DeviceCard.jsx`:
```js
import NewWidget from "./NewWidget";
const VIZ  = { gauge: Gauge, tank: Tank, silo: Silo, newwidget: NewWidget };
const ICON = { ..., newwidget: "🔧" };
```

### Editing Rules for Claude

- **Edit one file at a time.** Never rewrite the whole library in one response.
- **Do not change Gauge geometry** (`cx`, `cy`, `R`, viewBox formula) unless explicitly asked.
- **Do not rename `value`** in the data contract.
- **helpers.js is shared** — changes there affect all widgets.
- `Gauge.jsx` → needle, arc, geometry changes
- `Tank.jsx` / `Silo.jsx` → fill animation, shape changes
- `ValueCard.jsx` → display-only changes, color map
- `DeviceCard.jsx` → bar chart, table, card layout
- `helpers.js` → alert logic, date grouping, formatting

### Quick Reference — Common Tasks

| Task | File |
|------|------|
| Change alert threshold colors | `helpers.js` → `alertColor()` |
| Change table row count | `DeviceCard.jsx` → `last50` slice |
| Add animation to tank fill | `Tank.jsx` |
| Add export-to-CSV | `DeviceCard.jsx` |
| Change bar chart to hourly | `helpers.js` → `groupByDay()` |
| Add new sensor type/widget | New file + register in `DeviceCard` + `index.js` |
| Change date format | `helpers.js` → `fmtTime()` |
| Add loading skeleton | `DeviceCard.jsx` → loading branch |
| Change ValueCard font size | `ValueCard.jsx` → fontSize on value span |
| Add unit to ValueCard color map | `ValueCard.jsx` → `UNIT_COLORS` object |

---

## 3 · IoT Application Page Rules

### Root Layout — Sticky Sidebar (REQUIRED — do NOT change)

The app shell in `App.tsx` uses `h-screen overflow-hidden` on the outermost div so that:
- The **sidebar stays fixed** on screen while the user scrolls
- All scrolling happens inside `<main className="flex-1 overflow-y-auto">`, not at the window level

```jsx
// App.tsx — root layout (NEVER change h-screen/overflow-hidden here)
<div className="h-screen flex flex-col overflow-hidden ...">
  <Navbar />
  <div className="flex flex-1 overflow-hidden relative">
    <Sidebar />
    <main className="flex-1 overflow-y-auto custom-scrollbar ...">
      {/* page content */}
    </main>
  </div>
</div>
```

**Why `h-screen` and not `min-h-screen`:**  
`min-h-screen` lets the outer div grow taller than the viewport, so scroll happens at the window/body level and the sidebar scrolls with the page. `h-screen overflow-hidden` locks the viewport — only `<main>` scrolls.

**Page content wrappers** (`WeighingPage`, `OcioPage`, `LevelPage`, `HaifaPage`, etc.) use `minHeight: "100vh"` on their inner div — this is correct and intentional. The content can be taller than `<main>`; it will scroll inside `<main>`, not the window.

> Fixed 2026-04-25. Applies to all pages: Weighing, Ocio, Level, Haifa, Energy.

---

### Unified Color Palette (REQUIRED — all app pages must use the same palette)

All pages share one color system. **Never introduce a different accent color for a new page.**

#### Accent color — one value for all pages

```js
const ACCENT = "hsl(198, 93%, 59%)";  // sky blue — Weighing, Level, Ocio, all future pages
```

> Previously `OcioPage` and `LevelPage` used teal `hsl(172, 66%, 50%)`. Unified to sky blue on 2026-04-21.

#### Base palette (dark / light)

```js
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
```

#### Semantic colors (same across all pages — do not change per page)

| Role | Value | Usage |
|------|-------|-------|
| Alert / error | `#f87171` | Error state, max value, "bad" trend |
| OK / min | `#34d399` | Min value, "good" trend |
| Accent / highlight | `hsl(198, 93%, 59%)` | Buttons, spinners, chart line, selected state |

#### Fonts (same across all pages)

| Role | Font |
|------|------|
| Big numbers / values | `Bebas Neue` |
| Labels / body | `DM Sans` |
| Monospace data | `DM Mono` |

---

### Loading State Pattern (REQUIRED for all app pages)

Pages with range selectors (היום / אתמול / שבוע / טווח מותאם) **must not** replace the full page content with a spinner when the user changes range. Only the initial load (no data yet) should show the full spinner.

**Correct pattern — copy exactly into every new page:**

```jsx
{loading && readings.length === 0 ? (
  // Full-page spinner — first load only
  <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
    <div style={{ textAlign: "center", ...S.muted }}>
      <div style={{ width: 36, height: 36, border: `3px solid ${C.border}`,
        borderTop: `3px solid ${ACCENT}`, borderRadius: "50%",
        animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
      <p style={{ fontSize: 13 }}>טוען נתונים...</p>
    </div>
  </div>
) : (
  // Content stays visible — dims + small floating pill while re-fetching
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
    {/* ... page content ... */}
  </div>
)}
```

**Why:** Without this, selecting a range on mobile triggers `setLoading(true)` which hides all content and shows a full-screen spinner — looks like a page refresh. This pattern keeps content visible and only shows a subtle overlay.

**Pages already using this pattern:** `LevelPage`, `OcioPage`, `WeighingPage`.

### Chart Pattern (REQUIRED for all app pages)

All Recharts charts must follow this layout so that graphs are full-width and consistent across the app:

**1. Wrap the chart container in `dir="ltr"`** — pages use `dir="rtl"` which mirrors Recharts charts (right→left flow, Y-axis on wrong side). Override it on the chart wrapper only:
```jsx
<div style={{ ... }} dir="ltr">
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart ...>
```

**2. Y-axis: left side, labels inside the chart** — use `mirror={true}` so labels float inside the chart area and don't reserve horizontal space:
```jsx
<YAxis
  orientation="left"
  stroke={C.muted} fontSize={12} tickLine={false} axisLine={false}
  width={1} mirror={true} dx={6}
  domain={[cfg.min, cfg.max]}
  tickFormatter={v => v.toLocaleString()}
/>
```

- `width={1}` — chart loses 1px, labels are not clipped (width={0} clips them)
- `mirror={true}` — labels render inside the chart, no reserved space outside
- `dx={6}` — nudges labels slightly right so they're readable
- Do NOT append the unit to tick labels — keep ticks as numbers only; unit belongs in the tooltip formatter

**Components already using this pattern:** `LevelPage`, `OcioPage`, `WeighingPage`, `HistoryChart`.

### Device List ("רשימת מכשירים") Pattern (REQUIRED for all app pages)

Always render the device selector card when `devices.length > 0` — **not** `> 1`. With a single device the card still shows the device name and location, which is useful context for the user. With multiple devices it works as a selector.

```jsx
{devices.length > 0 && (
  <div style={{ ...S.card, padding: "10px 14px", flex: 1, minWidth: 0 }}>
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
```

Also use `devices.length > 0` (not `> 1`) for the header `marginBottom` ternary:
```jsx
marginBottom: devices.length > 0 ? 12 : 28
```

**Pages already using this pattern:** `LevelPage`, `OcioPage`, `WeighingPage`.

### Page Header Pattern (REQUIRED for all app pages)

Every new page **must** use the same two-part header. Copy the structure below exactly — only change the icon, title string, and class-name prefix.

**Desktop:** single row — `[icon · site name]` on the left, timestamp block auto-pushed to the right, refresh button last.

**Mobile (≤600px):** two rows — Row 1: `[icon · site name]` + `[🔄 רענן]` on the same line. Row 2: timestamp + msg/h in a framed card (background `C.inner`, border `C.border`, `border-radius: 12px`), font 15px white (`C.text`).

```jsx
{/* ── Header ─────────────────────────────────────────────────────── */}
<div className="X-hdr" style={{ display: "flex", alignItems: "center", marginBottom: 16, gap: 10 }}>
  <div className="X-hdr-left" style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <PageIcon style={{ color: ACCENT, width: 22, height: 22 }} />
    <h1 style={{ fontFamily: "DM Sans, sans-serif", fontSize: 18, fontWeight: 700, margin: 0, color: C.text }}>
      {selectedDevice?.site_name ?? userProfile?.site_name ?? "כותרת דף"}
    </h1>
  </div>
  <div className="X-hdr-ts" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
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
  <button className="X-hdr-refresh" onClick={() => fetchData(true)} disabled={refreshing}
    style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: "6px 12px", cursor: "pointer", color: ACCENT,
      display: "flex", alignItems: "center", gap: 6, fontFamily: "DM Sans, sans-serif" }}>
    <RefreshCw style={{ width: 14, height: 14, animation: refreshing ? "spin 1s linear infinite" : "none" }} />
    <span style={{ fontSize: 14 }}>רענן</span>
  </button>
</div>
```

Add these rules inside the page's `<style>` tag (replace `X` with the page prefix, e.g. `weighing`, `ocio`, `level`):

```css
.X-hdr { flex-wrap:wrap!important; gap:8px!important; }   /* desktop: no-op (no wrapping) */
@media(max-width:600px){
  .X-hdr { flex-wrap:wrap!important; gap:8px!important; }
  .X-hdr-left { flex:1!important; order:1; min-width:0; }
  .X-hdr-refresh { order:2; flex-shrink:0; }
  .X-hdr-ts { order:3; width:100%!important; margin-left:0!important; background:${C.inner}; border:1px solid ${C.border}; border-radius:12px; padding:10px 14px!important; justify-content:flex-start!important; }
  .X-hdr-ts span { font-size:15px!important; color:${C.text}!important; }
}
```

> Use `${C.inner}`, `${C.border}`, `${C.text}` directly in the template-literal `<style>` tag — they interpolate at render time and update on dark/light mode toggle.

**Pages already using this pattern:** `LevelPage`, `OcioPage`, `WeighingPage`.

---

## 4 · Project: Galoz IoT Energy Monitor

### Stack

- **Frontend**: React + TypeScript + Tailwind CSS (Vite)
- **Backend**: Express (`server.ts`) + MSSQL (`mssql` package)
- **Auth**: JWT (`jsonwebtoken`) + bcrypt passwords

### Databases & Tables

| Table | DB (env var) | Purpose |
|-------|-------------|---------|
| `[Energy].[dbo].[Energy]` | `SQL_DATABASE` (default: `Energy`) | Sensor readings: `Device_ID`, `ts_getway`, `value`, energy fields |
| `[Galoziot].[dbo].[Custumer]` | `SQL_CUSTOMERS_DATABASE` (default: `Galoziot`) | Users/devices: `id_user`, `device_id`, `user_name`, `email`, `password`, `role`, `application`, `cast_num` |
| `[Galoziot].[dbo].[cast_{n}]` | `SQL_CUSTOMERS_DATABASE` | Weighing & Ocio sensor readings — one table per `cast_num` |

Table names are resolved via `getTableName()` in `server.ts:362` using cross-database `[db].[dbo].[table]` syntax.

> **DB schema is never modified automatically.** The server does not run migrations on startup. All schema changes (new columns, indexes, etc.) are applied manually via MSSQL.

### Cast Table — id_user / device_id / Device_ID Contract (CRITICAL — applies to all apps)

**Two separate ID concepts — do not confuse them:**

| Column | Lives in | Meaning |
|--------|----------|---------|
| `id_user` | `Custumer` | Sequential login identity. Small unique integer (1, 2, 3…). Used for auth, not for hardware filtering. |
| `device_id` | `Custumer` | Hardware ID the sensor sends to Node-RED. May differ from `id_user`. |
| `Device_ID` | `cast_{n}` | The value Node-RED actually inserts — must match `device_id` in Custumer. |

**Backward-compatible query pattern** — always use `ISNULL(device_id, id_user)` so rows created before `device_id` column existed still work:
```sql
WHERE Device_ID = ISNULL(device_id, id_user)
```

**`id_user` numbering convention (established 2026-05-06):**
`id_user` values are now small sequential integers starting from 1, assigned one client at a time. Do not use large/random numbers (e.g. 669, 993). When creating a new client row, use the next available integer.

**`device_id` numbering convention:**
Within each cast table, hardware Device_IDs are renumbered to small sequential integers (1, 2, 3…). The Node-RED `METER_ID` constant must match.

| App | Device_ID filter | Rule |
|-----|-----------------|------|
| Weighing | **Yes** | `device_id` in Custumer = `METER_ID` in Node-RED flow |
| Level | Yes | `device_id` = hardware device_id |
| Energy | Yes | `device_id` = hardware Device_ID |
| Ocio | No | always one device per cast table |

**Multi-device (same client, same cast table):**
Two scales for "eli" both inserting into `cast_5` with different `Device_ID`:
```
id_user=22, user_name=eli,  device_id=1, cast_num=5  →  WHERE Device_ID=1
id_user=23, user_name=lior, device_id=2, cast_num=5  →  WHERE Device_ID=2
```

**Shared access (two logins, same physical device):**
Both rows get the same `device_id` = hardware Device_ID (DB does not enforce UNIQUE on `device_id`):
```
id_user=22, user_name=eli,  device_id=1, cast_num=5
id_user=23, user_name=lior, device_id=1, cast_num=5
```

**Admin rule:** when creating a row in CustomersPage, set `device_id` = the `METER_ID` constant in the Node-RED flow for that device. `id_user` (מזהה #) is the next available sequential integer — it is the login identity, NOT the hardware ID.

#### Cast Table Schema — Weighing (`[Galoziot].[dbo].[cast_5]`)

Confirmed column list, verified 2026-04-28:

| Column | Type | Notes |
|--------|------|-------|
| `Row_Num` | INT PK | auto-increment primary key |
| `Device_ID` | INT NULL | device hardware ID |
| `ts` | DATETIME NULL | insert timestamp |
| `gross_weight` | INT DEFAULT 0 | gross weight kg |
| `net_weight` | INT DEFAULT 0 | net weight kg — main display value |
| `input_status` | TINYINT DEFAULT 0 | digital input state |
| `fill_start` | INT DEFAULT 0 | net_weight at fill begin — 0 = not a filling row |
| `fill_stop` | INT DEFAULT 0 | net_weight at fill end — 0 = not a filling row |
| `fill_total` | INT DEFAULT 0 | kg added — 0 = not a filling row |

**Node-RED INSERT — normal reading (msg.query in Format & Publish node):**
```js
`INSERT INTO [Galoziot].[dbo].[cast_5] (Device_ID, ts, gross_weight, net_weight, input_status)
VALUES (${data.id}, '${data.ts_gateway}', ${data.gross_weight}, ${data.net_weight}, ${data.input_status});
SELECT 'OK' AS Status;`
```

> `data.id` = Node-RED `METER_ID` constant — must match `device_id` in Custumer (small integer, e.g. 1 or 2).

**Node-RED INSERT — filling event:**
```js
`INSERT INTO [Galoziot].[dbo].[cast_5] (Device_ID, ts, fill_start, fill_stop, fill_total)
VALUES (${data.id}, GETDATE(), ${data.fill_start}, ${data.fill_stop}, ${data.fill_total});
SELECT 'OK' AS Status;`
```

> `fill_total > 0` = filling event row. `fill_total = 0` = normal reading row.
> MSSQL node uses `msg.query` mode (not mustache, not queryParams).

#### Cast Table Schema — Ocio

Ocio application uses a separate cast table (e.g. `cast_6`) with columns: `device_id`, `ts`, `lv` (level mm), `vol` (liters), `rssi`, `st`.

### CustomersPage — Admin UI Notes

- **`device_id` column is visible** in the admin table (added 2026-05-06). It shows the hardware ID separate from `id_user`.
- **Double-submit guard**: `savingRef = useRef(false)` prevents a duplicate PUT request if the user clicks Save twice. The guard is set before `fetch` and cleared in `finally`.
- **Duplicate `id_user` check**: The `PUT /api/customers/:id` handler verifies that the new `id_user` value doesn't already exist in the table before applying the update, and returns HTTP 400 with a Hebrew error message if it does.
- **Do NOT change the `id_user` edit field to auto-increment** — the admin must be able to set it manually to keep `id_user` in sync with the sequential numbering scheme.

### Frontend Routes & Redirect Policies

| Path | Component | Access | Notes |
|------|-----------|--------|-------|
| `/` | `Dashboard` | All users | Auto-redirects to `/weighing` if `application === 'Weighing'`; to `/ocio` if `application === 'Ocio'` |
| `/energy` | `Dashboard` | All users | |
| `/weighing` | `WeighingPage` | All users | |
| `/graph` | `GraphPage` | All users | |
| `/calculator` | `CalculatorPage` | All users | |
| `/alerts` | `Alerts` | All users | |
| `/users` | `UsersPage` | **Admin only** | `role === 'admin'` guard in `App.tsx` |
| `/customers` | `CustomersPage` | **Admin only** | `role === 'admin'` guard in `App.tsx` |
| `/ocio` | `OcioPage` | All users | Level/volume monitoring; auto-redirect target for `application === 'Ocio'` |
| `/iot-test` | `IoTWidgetsTestPage` | All users | |
| `*` | — | — | Catch-all redirects to `/` |

### Public API Endpoints (no auth required)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/offjer` | GET | Returns latest counter snapshot for 2 OffJer PLCs. No JWT required. CORS `*`. |

#### `/api/offjer` — OffJer PLC snapshot

- **Auth**: none — public endpoint, accessible by external clients
- **CORS**: `Access-Control-Allow-Origin: *` set on the route
- **Data source**: queries `application = 'OffJer'` devices from `Custumer`, ordered by `id_user ASC`; first device → `plc_1`, second → `plc_2`
- **Timestamps**: `ts` column is stored as Israel local time — returned as-is (`YYYY-MM-DDTHH:MM:SS`, no UTC conversion, no `AT TIME ZONE` in SQL). Top-level `timestamp` generated in `Asia/Jerusalem`.
- **Counters**: always returned as numbers (`Number()`), never strings. `null` if the value is missing or the PLC is offline.
- **Offline fallback**: if a DB query fails for a PLC, that PLC gets `"status": "offline"` and all counters set to `null`. The endpoint never returns HTTP 500 — always returns HTTP 200 with the offline structure.

```json
{
  "device": "galoz-energy-monitor",
  "timestamp": "<Israel local ISO>",
  "plc_1": { "id": "plc_01", "status": "online", "last_update": "<local ISO>", "counters": { "counter_1": 0, ... } },
  "plc_2": { "id": "plc_02", "status": "online", "last_update": "<local ISO>", "counters": { "counter_1": 0, ... } }
}
```

> **Do NOT add auth to this endpoint** — it is intentionally public and called by external systems.

### Auth & Security

- JWT on all `/api/` routes via `authenticateToken` middleware
- Rate limits: general 2000/15min · login 5/15min · energy burst 200/min · energy sustained 3000/hr
- Auto-logout after **15 min** inactivity (`App.tsx`) — **do NOT simplify this logic**
- Admin-only actions protected by `adminActionLimiter` (5 attempts/15min)

#### Auto-logout — iOS Safari implementation (REQUIRED — do not change)

iOS Safari freezes `setTimeout` when the app is backgrounded, and can **kill the page entirely** under memory pressure. Three separate mechanisms are needed — removing any one breaks iOS:

| Scenario | Handler | How |
|----------|---------|-----|
| Tab switch / return to browser | `visibilitychange` | `checkAndReset()` compares wall-clock elapsed time |
| bfcache restore (page suspended in memory) | `pageshow` with `e.persisted === true` | `checkAndReset()` |
| iOS kills the page, fresh reload | `useEffect` mount — checks `lastActivityAt` **before** calling `markActivity()` | if elapsed > 15 min → logout immediately |

**Critical rules:**
- `markActivity()` must only be called AFTER the elapsed-time check on mount — calling it first resets the clock and breaks the iOS-killed-page case
- `handleLogout()` must call `localStorage.removeItem('lastActivityAt')` — otherwise a stale timestamp from a previous session triggers an immediate phantom logout on the next login
- `lastActivityAt` is a `localStorage` key (wall-clock ms) used instead of relying on `setTimeout` which iOS suspends

### Key Environment Variables

```
SQL_SERVER, SQL_PORT, SQL_DATABASE, SQL_CUSTOMERS_DATABASE
SQL_USER, SQL_PASSWORD
JWT_SECRET
SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_PASSWORD, SMTP_SECURE
```