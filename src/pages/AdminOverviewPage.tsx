import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Wifi, WifiOff, Clock, LogIn, ChevronUp, ChevronDown, Filter, X } from 'lucide-react';
import { apiFetch } from '../lib/apiFetch';

interface OverviewDevice {
  id_user: number;
  user_name: string;
  site_name: string;
  location: string;
  application: string;
  last_seen: string | null;
  is_online: boolean;
}

interface LoginEntry {
  user_name: string;
  ip: string;
  timestamp: string;
}

interface Props {
  token: string | null;
  isDarkMode: boolean;
}

const ACCENT = "hsl(198, 93%, 59%)";

const APP_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  energy:      { bg: "#fbbf2422", text: "#fbbf24", label: "Energy" },
  weighing:    { bg: "#38bdf822", text: "#38bdf8", label: "Weighing" },
  level:       { bg: "#34d39922", text: "#34d399", label: "Level" },
  ocio:        { bg: "#4ade8022", text: "#4ade80", label: "Ocio" },
  offjer:      { bg: "#a78bfa22", text: "#a78bfa", label: "OffJer" },
  temperature: { bg: "#f8717122", text: "#f87171", label: "Temperature" },
  custom:      { bg: "#94a3b822", text: "#94a3b8", label: "Custom" },
};

function appStyle(app: string) {
  return APP_COLORS[app?.toLowerCase()] ?? APP_COLORS.custom;
}

function relativeTime(isoStr: string | null): string {
  if (!isoStr) return '—';
  const diffMs = Date.now() - new Date(isoStr).getTime();
  const mins   = Math.floor(diffMs / 60000);
  const hours  = Math.floor(diffMs / 3600000);
  const days   = Math.floor(diffMs / 86400000);
  if (mins < 1)   return 'עכשיו';
  if (mins < 60)  return `לפני ${mins} דק'`;
  if (hours < 24) return `לפני ${hours} שע'`;
  if (days < 7)   return `לפני ${days} ימים`;
  return new Date(isoStr).toLocaleDateString('he-IL');
}

function fmtTs(isoStr: string | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const AdminOverviewPage: React.FC<Props> = ({ token, isDarkMode }) => {
  const [devices,  setDevices]  = useState<OverviewDevice[]>([]);
  const [logins,   setLogins]   = useState<LoginEntry[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // login table filters & sort
  const [selUsers,    setSelUsers]    = useState<string[]>([]);
  const [selIPs,      setSelIPs]      = useState<string[]>([]);
  const [sortCol,     setSortCol]     = useState<'date' | 'user'>('date');
  const [sortDir,     setSortDir]     = useState<'desc' | 'asc'>('desc');
  const [dateFrom,    setDateFrom]    = useState('');
  const [dateTo,      setDateTo]      = useState('');
  const [openDrop,    setOpenDrop]    = useState<'user' | 'ip' | 'date' | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpenDrop(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const C = isDarkMode ? {
    page:   "hsl(222, 47%, 11%)",
    card:   "hsl(217, 32%, 17%)",
    inner:  "hsl(222, 47%, 9%)",
    border: "hsl(215, 19%, 34%)",
    text:   "hsl(210, 40%, 98%)",
    muted:  "hsl(215, 20%, 60%)",
  } : {
    page:   "#b8d4e8",
    card:   "#d4e8f6",
    inner:  "#c2daea",
    border: "rgba(0,120,180,0.26)",
    text:   "hsl(222, 47%, 11%)",
    muted:  "hsl(213, 28%, 38%)",
  };

  const S = {
    card: {
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 16,
      padding: 20,
    } as React.CSSProperties,
  };

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (!token) return;
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const [devRes, logRes] = await Promise.all([
        apiFetch('/api/admin/overview',       { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/api/admin/recent-logins',  { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (devRes.ok) setDevices(await devRes.json());
      if (logRes.ok) setLogins(await logRes.json());
    } catch { /* network error — keep stale data */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // auto-refresh every 120 s
  useEffect(() => {
    const id = setInterval(() => fetchAll(true), 120000);
    return () => clearInterval(id);
  }, [fetchAll]);

  const online  = devices.filter(d => d.is_online).length;
  const offline = devices.length - online;
  const active48 = devices.filter(d => d.last_seen &&
    Date.now() - new Date(d.last_seen).getTime() < 48 * 3600000).length;

  const groupedByApp = devices.reduce<Record<string, OverviewDevice[]>>((acc, d) => {
    const key = d.application || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(d);
    return acc;
  }, {});

  return (
    <div dir="rtl" style={{
      minHeight: '100vh',
      background: C.page,
      padding: '24px 20px',
      fontFamily: 'DM Sans, sans-serif',
      color: C.text,
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .ov-hdr { display:flex; align-items:center; gap:10px; margin-bottom:24px; flex-wrap:wrap; }
        .ov-hdr-left { display:flex; align-items:center; gap:10px; flex:1; min-width:0; }
        .ov-refresh { background:${C.card}; border:1px solid ${C.border}; border-radius:8px;
          padding:6px 14px; cursor:pointer; color:${ACCENT}; display:flex; align-items:center;
          gap:6px; font-family:DM Sans,sans-serif; font-size:14px; }
        .dev-card:hover { border-color:${ACCENT}44 !important; }
        .login-row:nth-child(even) { background:${C.inner}; }
      `}</style>

      {/* Header */}
      <div className="ov-hdr">
        <div className="ov-hdr-left">
          <Wifi style={{ color: ACCENT, width: 22, height: 22 }} />
          <h1 style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 20, fontWeight: 700, margin: 0 }}>
            סקירת מערכת — כל הלקוחות
          </h1>
        </div>
        <button className="ov-refresh" onClick={() => fetchAll(true)} disabled={refreshing}>
          <RefreshCw style={{ width: 14, height: 14,
            animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          רענן
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
          <div style={{ textAlign: 'center', color: C.muted }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${C.border}`,
              borderTop: `3px solid ${ACCENT}`, borderRadius: '50%',
              animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: 13 }}>טוען נתונים...</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24,
          opacity: refreshing ? 0.5 : 1, transition: 'opacity 0.2s',
          position: 'relative', pointerEvents: refreshing ? 'none' : 'auto' }}>

          {/* Stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {[
              { label: 'סה"כ לקוחות', value: devices.length, color: ACCENT },
              { label: 'מחובר',        value: online,         color: '#34d399' },
              { label: 'מנותק',        value: offline,        color: '#f87171' },
              { label: 'פעיל 48 שע׳', value: active48,       color: '#fbbf24' },
            ].map(s => (
              <div key={s.label} style={{ ...S.card, textAlign: 'center', padding: '16px 10px' }}>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 40,
                  color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4,
                  fontFamily: 'DM Sans, sans-serif' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Device groups */}
          {Object.entries(groupedByApp).sort(([a], [b]) => a.localeCompare(b)).map(([app, devs]) => {
            const aStyle = appStyle(app);
            return (
              <div key={app} style={S.card}>
                {/* Group header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <span style={{
                    padding: '3px 12px', borderRadius: 20,
                    background: aStyle.bg, color: aStyle.text,
                    fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
                    textTransform: 'uppercase', fontFamily: 'DM Mono, monospace',
                  }}>{aStyle.label}</span>
                  <span style={{ color: C.muted, fontSize: 13 }}>
                    {devs.filter(d => d.is_online).length} / {devs.length} מחוברים
                  </span>
                </div>

                {/* Device cards grid */}
                <div style={{ display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                  {devs.map(d => (
                    <div key={d.id_user} className="dev-card" style={{
                      background: C.inner,
                      border: `1px solid ${d.is_online ? '#34d39930' : '#f8717130'}`,
                      borderRadius: 12, padding: '12px 14px',
                      transition: 'border-color 0.15s',
                    }}>
                      {/* Status dot + site name */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: d.is_online ? '#34d399' : '#f87171',
                          boxShadow: `0 0 6px ${d.is_online ? '#34d399' : '#f87171'}`,
                        }} />
                        <span style={{ fontWeight: 700, fontSize: 15, color: C.text,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.site_name || d.user_name}
                        </span>
                      </div>

                      {/* Location */}
                      {d.location && (
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6,
                          paddingRight: 16, fontFamily: 'DM Mono, monospace' }}>
                          {d.location}
                        </div>
                      )}

                      {/* Last seen */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5,
                        paddingRight: 16, marginTop: 2 }}>
                        {d.is_online
                          ? <Wifi style={{ width: 12, height: 12, color: '#34d399' }} />
                          : <WifiOff style={{ width: 12, height: 12, color: '#f87171' }} />
                        }
                        <span style={{ fontSize: 12, color: d.is_online ? '#34d399' : C.muted,
                          fontFamily: 'DM Mono, monospace' }}
                          title={fmtTs(d.last_seen)}>
                          {relativeTime(d.last_seen)}
                        </span>
                        {d.last_seen && (
                          <span style={{ fontSize: 11, color: C.muted,
                            fontFamily: 'DM Mono, monospace', marginRight: 4 }}>
                            {new Date(d.last_seen).toLocaleTimeString('he-IL',
                              { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Recent logins panel */}
          {(() => {
            const uniqueUsers = [...new Set(logins.map(l => l.user_name))].sort();
            const uniqueIPs   = [...new Set(logins.map(l => l.ip?.replace('::ffff:', '') || ''))].filter(Boolean).sort();
            const hasFilters  = selUsers.length > 0 || selIPs.length > 0 || dateFrom || dateTo;

            const filtered = logins
              .filter(l => selUsers.length === 0 || selUsers.includes(l.user_name))
              .filter(l => selIPs.length   === 0 || selIPs.includes(l.ip?.replace('::ffff:', '') || ''))
              .filter(l => {
                if (!dateFrom && !dateTo) return true;
                const t = new Date(l.timestamp).getTime();
                if (dateFrom && t < new Date(dateFrom).getTime()) return false;
                if (dateTo   && t > new Date(dateTo + 'T23:59:59').getTime()) return false;
                return true;
              })
              .sort((a, b) => {
                const diff = sortCol === 'user'
                  ? a.user_name.localeCompare(b.user_name)
                  : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
                return sortDir === 'desc' ? -diff : diff;
              });

            const toggleUser = (u: string) =>
              setSelUsers(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);
            const toggleIP = (ip: string) =>
              setSelIPs(prev => prev.includes(ip) ? prev.filter(x => x !== ip) : [...prev, ip]);
            const clearAll = () => { setSelUsers([]); setSelIPs([]); setDateFrom(''); setDateTo(''); };

            const dropStyle: React.CSSProperties = {
              position: 'absolute', top: '100%', right: 0, zIndex: 50,
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
              padding: '10px 0', minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
              maxHeight: 260, overflowY: 'auto',
            };
            const checkRow = (label: string, checked: boolean, onClick: () => void) => (
              <div key={label} onClick={onClick} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 14px', cursor: 'pointer',
                background: checked ? `${ACCENT}18` : 'transparent',
                transition: 'background 0.1s',
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: `1.5px solid ${checked ? ACCENT : C.border}`,
                  background: checked ? ACCENT : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <div style={{ width: 6, height: 6, borderRadius: 1, background: C.page }} />}
                </div>
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: C.text }}>{label}</span>
              </div>
            );

            const hdrBtn = (active: boolean, onClick: () => void, children: React.ReactNode) => (
              <button onClick={onClick} style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                color: active ? ACCENT : C.muted, display: 'flex', alignItems: 'center', gap: 4,
                fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 13,
              }}>{children}</button>
            );

            return (
              <div style={S.card} ref={dropRef}>
                {/* Panel header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  <LogIn style={{ color: ACCENT, width: 18, height: 18 }} />
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                    כניסות אחרונות — 48 שעות אחרונות
                  </h2>
                  <span style={{ background: `${ACCENT}22`, color: ACCENT,
                    padding: '2px 10px', borderRadius: 20, fontSize: 12,
                    fontFamily: 'DM Mono, monospace' }}>
                    {filtered.length} / {logins.length} כניסות
                  </span>
                  {hasFilters && (
                    <button onClick={clearAll} style={{
                      marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 5,
                      background: '#f8717122', border: '1px solid #f8717144', borderRadius: 8,
                      color: '#f87171', padding: '3px 10px', cursor: 'pointer',
                      fontFamily: 'DM Sans, sans-serif', fontSize: 12,
                    }}>
                      <X style={{ width: 12, height: 12 }} /> נקה פילטרים
                    </button>
                  )}
                </div>

                {logins.length === 0 ? (
                  <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                    אין נתוני כניסה בשני הימים האחרונים
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse',
                      fontFamily: 'DM Mono, monospace', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          {/* Username — sort + filter */}
                          <th style={{ padding: '6px 12px', textAlign: 'right' }}>
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <button onClick={() => {
                                  if (sortCol === 'user') setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                                  else { setSortCol('user'); setSortDir('asc'); }
                                }} style={{
                                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                                  color: sortCol === 'user' ? ACCENT : C.muted,
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 13,
                                }}>
                                  משתמש
                                  {sortCol === 'user'
                                    ? (sortDir === 'asc' ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />)
                                    : <ChevronDown style={{ width: 13, height: 13, opacity: 0.3 }} />}
                                </button>
                                <button onClick={() => setOpenDrop(o => o === 'user' ? null : 'user')} style={{
                                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                                  color: selUsers.length > 0 ? ACCENT : C.muted,
                                  display: 'flex', alignItems: 'center', gap: 3,
                                }}>
                                  <Filter style={{ width: 11, height: 11 }} />
                                  {selUsers.length > 0 && (
                                    <span style={{ background: ACCENT, color: C.page,
                                      borderRadius: 10, fontSize: 10, padding: '0 5px', lineHeight: '16px' }}>
                                      {selUsers.length}
                                    </span>
                                  )}
                                </button>
                              </div>
                              {openDrop === 'user' && (
                                <div style={dropStyle}>
                                  {uniqueUsers.map(u => checkRow(u, selUsers.includes(u), () => toggleUser(u)))}
                                </div>
                              )}
                            </div>
                          </th>

                          {/* Date — sort + date range filter */}
                          <th style={{ padding: '6px 12px', textAlign: 'right' }}>
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <button onClick={() => {
                                  if (sortCol === 'date') setSortDir(d => d === 'desc' ? 'asc' : 'desc');
                                  else { setSortCol('date'); setSortDir('desc'); }
                                }} style={{
                                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                                  color: sortCol === 'date' ? ACCENT : C.muted,
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 13,
                                }}>
                                  תאריך
                                  {sortCol === 'date'
                                    ? (sortDir === 'asc' ? <ChevronUp style={{ width: 13, height: 13 }} /> : <ChevronDown style={{ width: 13, height: 13 }} />)
                                    : <ChevronDown style={{ width: 13, height: 13, opacity: 0.3 }} />}
                                </button>
                                <button onClick={() => setOpenDrop(o => o === 'date' ? null : 'date')} style={{
                                  background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                                  color: (dateFrom || dateTo) ? ACCENT : C.muted,
                                  display: 'flex', alignItems: 'center', gap: 3,
                                }}>
                                  <Filter style={{ width: 11, height: 11 }} />
                                  {(dateFrom || dateTo) && (
                                    <span style={{ background: ACCENT, color: C.page,
                                      borderRadius: 10, fontSize: 10, padding: '0 5px', lineHeight: '16px' }}>
                                      טווח
                                    </span>
                                  )}
                                </button>
                              </div>
                              {openDrop === 'date' && (
                                <div style={{ ...dropStyle, minWidth: 220, padding: 14 }}>
                                  <p style={{ margin: '0 0 6px', fontSize: 11, color: C.muted,
                                    fontFamily: 'DM Sans, sans-serif', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                    טווח תאריכים
                                  </p>
                                  {([['מ־', dateFrom, setDateFrom], ['עד', dateTo, setDateTo]] as [string, string, React.Dispatch<React.SetStateAction<string>>][]).map(([label, val, setter]) => (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                      <span style={{ fontSize: 12, color: C.muted, fontFamily: 'DM Sans, sans-serif', width: 22 }}>{label}</span>
                                      <input type="date" value={val}
                                        onChange={e => setter(e.target.value)}
                                        style={{
                                          flex: 1, background: C.inner, border: `1px solid ${C.border}`,
                                          borderRadius: 6, color: C.text, padding: '4px 8px',
                                          fontFamily: 'DM Mono, monospace', fontSize: 12,
                                          colorScheme: isDarkMode ? 'dark' : 'light',
                                        }} />
                                    </div>
                                  ))}
                                  {(dateFrom || dateTo) && (
                                    <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                                      style={{ marginTop: 4, width: '100%', background: 'none',
                                        border: 'none', color: '#f87171', cursor: 'pointer',
                                        fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}>
                                      נקה טווח
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </th>

                          {/* Time — display only */}
                          <th style={{ padding: '6px 12px', textAlign: 'right',
                            fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: 13, color: C.muted }}>
                            שעה
                          </th>

                          {/* IP — filter only */}
                          <th style={{ padding: '6px 12px', textAlign: 'right' }}>
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              {hdrBtn(selIPs.length > 0, () => setOpenDrop(o => o === 'ip' ? null : 'ip'),
                                <>
                                  IP
                                  <Filter style={{ width: 11, height: 11 }} />
                                  {selIPs.length > 0 && (
                                    <span style={{ background: ACCENT, color: C.page,
                                      borderRadius: 10, fontSize: 10, padding: '0 5px', lineHeight: '16px' }}>
                                      {selIPs.length}
                                    </span>
                                  )}
                                </>
                              )}
                              {openDrop === 'ip' && (
                                <div style={{ ...dropStyle, right: 'auto', left: 0 }}>
                                  {uniqueIPs.map(ip => checkRow(ip, selIPs.includes(ip), () => toggleIP(ip)))}
                                </div>
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr>
                            <td colSpan={4} style={{ padding: '20px 12px', textAlign: 'center', color: C.muted, fontSize: 13 }}>
                              אין תוצאות לפילטר הנוכחי
                            </td>
                          </tr>
                        ) : filtered.map((l, i) => {
                          const d = new Date(l.timestamp);
                          const dateStr = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
                          const timeStr = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                          const isLocal = l.ip?.startsWith('::ffff:') || l.ip === '::1' || /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(l.ip || '');
                          return (
                          <tr key={i} className="login-row" style={{ borderBottom: `1px solid ${C.border}44` }}>
                            <td style={{ padding: '9px 12px', color: C.text, fontWeight: 600 }}>
                              {l.user_name}
                            </td>
                            <td style={{ padding: '9px 12px', color: C.muted, fontFamily: 'DM Mono, monospace' }}>
                              {dateStr}
                            </td>
                            <td style={{ padding: '9px 12px', color: C.muted, fontFamily: 'DM Mono, monospace' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <Clock style={{ width: 11, height: 11 }} />
                                {timeStr}
                              </div>
                            </td>
                            <td style={{ padding: '9px 12px', color: isLocal ? '#fbbf24' : ACCENT,
                              fontFamily: 'DM Mono, monospace' }}>
                              {l.ip?.replace('::ffff:', '') || '—'}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

        </div>
      )}
    </div>
  );
};
