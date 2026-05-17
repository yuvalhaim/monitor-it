import React, { useState } from "react";
import { Gauge, Tank, Silo, ValueCard, DeviceCard } from "../components/iot-widgets";

// ── Mock fetchData ────────────────────────────────────────────────────────────
function makeFetchData(baseValue: number, unit: string) {
  return async (_id: number) => {
    const now = Date.now();
    return Array.from({ length: 50 }, (_, i) => ({
      timestamp: new Date(now - (49 - i) * 30 * 60 * 1000).toISOString(),
      value: Math.round((baseValue + (Math.random() - 0.5) * baseValue * 0.2) * 10) / 10,
    }));
  };
}

// ── Device configs ────────────────────────────────────────────────────────────
const DEVICES = [
  {
    id: 1, type: "gauge", name: "לחץ קו ראשי", description: "קומפרסור #1",
    unit: "bar", min: 0, max: 10, alertLow: 1.5, alertHigh: 8,
    fetchData: makeFetchData(6, "bar"),
  },
  {
    id: 2, type: "tank", name: "מיכל מים", description: "מאגר גג",
    unit: "%", min: 0, max: 100, alertLow: 20, alertHigh: 90,
    fetchData: makeFetchData(62, "%"),
  },
  {
    id: 3, type: "silo", name: "סילו דגן", description: "מחסן A",
    unit: "ton", min: 0, max: 50, alertLow: 10, alertHigh: 45,
    fetchData: makeFetchData(32, "ton"),
  },
];

// ── Standalone widget demos ───────────────────────────────────────────────────
const STANDALONE = [
  { label: "Gauge — normal",   el: <Gauge  value={6}    min={0} max={10}  unit="bar"  alertLow={1.5} alertHigh={8}  /> },
  { label: "Gauge — low",      el: <Gauge  value={1.2}  min={0} max={10}  unit="bar"  alertLow={1.5} alertHigh={8}  /> },
  { label: "Gauge — high",     el: <Gauge  value={9.1}  min={0} max={10}  unit="bar"  alertLow={1.5} alertHigh={8}  /> },
  { label: "Tank — 62%",       el: <Tank   value={62}   min={0} max={100} unit="%"    alertLow={20}  alertHigh={85} /> },
  { label: "Tank — empty",     el: <Tank   value={8}    min={0} max={100} unit="%"    alertLow={20}  alertHigh={85} /> },
  { label: "Silo — 32 ton",    el: <Silo   value={32}   min={0} max={50}  unit="ton"  alertLow={10}  alertHigh={45} /> },
];

const VALUE_CARDS = [
  { name: "O₂",   value: 7.8,   unit: "mg/L" },
  { name: "pH",   value: 8.22,  unit: "pH",  alertLow: 6.5, alertHigh: 9.0 },
  { name: "טמפ",  value: 23.4,  unit: "°C" },
  { name: "זרם",  value: 14.2,  unit: "A" },
  { name: "מתח",  value: 231.0, unit: "V" },
  { name: "הספק", value: 3.28,  unit: "kW" },
  { name: "תדר",  value: 50.01, unit: "Hz" },
  { name: "ניהול", value: 78,   unit: "%" },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export function IoTWidgetsTestPage() {
  const [gaugeVal, setGaugeVal] = useState(6);
  const [tankVal, setTankVal]   = useState(62);
  const [siloVal, setSiloVal]   = useState(32);

  return (
    <div dir="rtl" style={{ background: "#060d14", minHeight: "100vh", padding: "32px 24px", fontFamily: "DM Mono, monospace" }}>
      <h1 style={{ color: "#f1f5f9", fontFamily: "Syne, sans-serif", fontSize: 28, marginBottom: 8 }}>
        IoT Widgets — דף בדיקה
      </h1>
      <p style={{ color: "#475569", marginBottom: 40, fontSize: 13 }}>
        כל הווידג'טים עם נתונים מדומים · ניתן לשנות ערכים בזמן אמת
      </p>

      {/* ── Interactive sliders ─────────────────────────────────────── */}
      <section style={{ marginBottom: 48 }}>
        <SectionTitle>שליטה ידנית בערכים</SectionTitle>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 32 }}>
          <Slider label="Gauge (bar)" value={gaugeVal} min={0} max={10} step={0.1} onChange={setGaugeVal} />
          <Slider label="Tank (%)"    value={tankVal}  min={0} max={100} step={1}  onChange={setTankVal}  />
          <Slider label="Silo (ton)"  value={siloVal}  min={0} max={50}  step={0.5} onChange={setSiloVal} />
        </div>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div style={{ background: "#0d1b2a", borderRadius: 12, padding: 16 }}>
            <Label>Gauge</Label>
            <Gauge value={gaugeVal} min={0} max={10} unit="bar" alertLow={1.5} alertHigh={8} />
          </div>
          <div style={{ background: "#0d1b2a", borderRadius: 12, padding: 16 }}>
            <Label>Tank</Label>
            <Tank value={tankVal} min={0} max={100} unit="%" alertLow={20} alertHigh={85} />
          </div>
          <div style={{ background: "#0d1b2a", borderRadius: 12, padding: 16 }}>
            <Label>Silo</Label>
            <Silo value={siloVal} min={0} max={50} unit="ton" alertLow={10} alertHigh={45} />
          </div>
        </div>
      </section>

      {/* ── Standalone widgets ──────────────────────────────────────── */}
      <section style={{ marginBottom: 48 }}>
        <SectionTitle>ווידג'טים עצמאיים — מצבי ערך</SectionTitle>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {STANDALONE.map(({ label, el }) => (
            <div key={label} style={{ background: "#0d1b2a", border: "1px solid #1a2a3a", borderRadius: 12, padding: 16, minWidth: 160 }}>
              <Label>{label}</Label>
              {el}
            </div>
          ))}
        </div>
      </section>

      {/* ── ValueCards ──────────────────────────────────────────────── */}
      <section style={{ marginBottom: 48 }}>
        <SectionTitle>ValueCard — כל סוגי היחידות</SectionTitle>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {VALUE_CARDS.map((vc) => (
            <ValueCard key={vc.name} {...vc} />
          ))}
        </div>
      </section>

      {/* ── Full DeviceCards ────────────────────────────────────────── */}
      <section>
        <SectionTitle>DeviceCard — כרטיסי מכשיר מלאים (עם fetch מדומה)</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 24 }}>
          {DEVICES.map((dev) => (
            <DeviceCard key={dev.id} device={dev} />
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{ color: "#94a3b8", fontFamily: "Syne, sans-serif", fontSize: 14,
      textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: 16, borderBottom: "1px solid #1a2a3a", paddingBottom: 8 }}>
      {children}
    </h2>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: "#475569", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
      {children}
    </p>
  );
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div style={{ minWidth: 180 }}>
      <p style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>
        {label}: <span style={{ color: "#f1f5f9", fontFamily: "Bebas Neue, sans-serif", fontSize: 18 }}>{value}</span>
      </p>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#34d399" }}
      />
    </div>
  );
}
