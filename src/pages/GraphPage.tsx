import React, { useState, useEffect, useCallback } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer
} from 'recharts';
import { Device, EnergyData } from '../types';
import { RefreshCw, TrendingUp, Zap, Clock, Activity, Maximize2, Minimize2, AlertTriangle, Download, FileText, FileSpreadsheet, FileJson } from 'lucide-react';
import { cn } from '../lib/utils';
import { format, subDays, eachDayOfInterval, isSameDay } from 'date-fns';
import { exportToCSV, exportToExcel, exportToPDF } from '../lib/exportUtils';

interface GraphPageProps {
  devices: Device[];
  token: string | null;
  isDebugMode?: boolean;
}

const DEVICE_COLORS = [
  '#0ea5e9', // Sky blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#f43f5e', // Rose
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#a855f7', // Purple
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, e: any) => s + (Number(e.value) || 0), 0);
  return (
    <div style={{
      background: 'rgba(10,20,40,0.96)',
      border: '1px solid rgba(14,165,233,0.3)',
      borderRadius: '10px',
      padding: '12px 16px',
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      textAlign: 'right',
      minWidth: '170px',
      direction: 'rtl'
    }}>
      <p style={{ color: 'rgba(14,165,233,0.9)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>{label}</p>
      {[...payload].reverse().map((entry: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '5px' }}>
          <span style={{ color: entry.color, fontWeight: 700, fontSize: '13px', fontVariantNumeric: 'tabular-nums' }}>{Number(entry.value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(148,163,184,0.75)', fontSize: '11px' }}>
            {entry.name}
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, display: 'inline-block', flexShrink: 0 }} />
          </span>
        </div>
      ))}
      {payload.length > 1 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '14px', fontVariantNumeric: 'tabular-nums' }}>{total.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          <span style={{ color: 'rgba(148,163,184,0.5)', fontSize: '11px' }}>kWh סה"כ</span>
        </div>
      )}
    </div>
  );
};

export const GraphPage: React.FC<GraphPageProps> = ({ devices, token, isDebugMode = false }) => {
  const [viewMode, setViewMode] = useState<'weekly' | 'monthly' | 'custom'>('weekly');
  const [displayMode, setDisplayMode] = useState<'cumulative' | 'tariff' | 'raw_kwtot'>('cumulative');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    peak: 0,
    average: 0
  });

  const fetchData = useCallback(async () => {
    if (devices.length === 0 || !token) return;
    
    setLoading(true);
    try {
      const devicesToFetch = selectedDeviceId === 'all' 
        ? devices 
        : devices.filter(d => d.id_user === selectedDeviceId);

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      // Calculate hours for the API
      const diffMs = end.getTime() - start.getTime();
      const hours = Math.ceil(diffMs / (1000 * 60 * 60)) + 24; // Buffer

      const results = await Promise.all(
        devicesToFetch.map(device => 
          fetch(`/api/energy/history/${device.id_user}?start=${start.toISOString()}&end=${end.toISOString()}&limit=5000`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
            .then(async res => {
              const data = await res.json();
              if (isDebugMode) {
                console.log(`GraphPage: Fetched ${data.length} records for device ${device.id_user} (${device.site_name})`);
              }
              return { 
                deviceId: device.id_user, 
                siteName: device.site_name, 
                data: Array.isArray(data) ? data : [] 
              };
            })
            .catch(err => {
              console.error(`Error fetching for device ${device.id_user}:`, err);
              return { deviceId: device.id_user, siteName: device.site_name, data: [] };
            })
        )
      );
      if (isDebugMode) {
        console.log("GraphPage: results from API:", results);
      }

      const days = eachDayOfInterval({
        start: start,
        end: end
      });

      const aggregated = days.map(day => {
        const dayData: any = {
          name: format(day, 'dd/MM'),
          date: day
        };

        const isSameDayCustom = (d1: Date, d2: Date) => {
          return isSameDay(d1, d2);
        };

        if (displayMode === 'tariff') {
          // Tariff breakdown (summed across selected devices)
          let t1 = 0, t2 = 0, t3 = 0, total = 0;
          results.forEach(res => {
            const dayRecords = res.data.filter((d: any) => d.ts && isSameDayCustom(new Date(d.ts), day));
            if (dayRecords.length >= 2) {
              const sorted = dayRecords.sort((a: any, b: any) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
              const first = sorted[0];
              const last = sorted[sorted.length - 1];
              t1 += Math.max(0, (last.t1 || 0) - (first.t1 || 0));
              t2 += Math.max(0, (last.t2 || 0) - (first.t2 || 0));
              t3 += Math.max(0, (last.t3 || 0) - (first.t3 || 0));
              total += Math.max(0, (last.kwtot || 0) - (first.kwtot || 0));
            }
          });
          dayData['T1 שפל'] = Number(t1.toFixed(2));
          dayData['T2 גבע'] = Number(t2.toFixed(2));
          dayData['T3 פסגה'] = Number(t3.toFixed(2));
          dayData.total = Number(total.toFixed(2));
        } else if (displayMode === 'raw_kwtot') {
          // Show raw kwtot value (cumulative)
          results.forEach((res) => {
            const dayRecords = res.data.filter((d: any) => d.ts && isSameDayCustom(new Date(d.ts), day));
            if (dayRecords.length > 0) {
              const last = dayRecords.sort((a: any, b: any) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0];
              dayData[`device_${res.deviceId}`] = last.kwtot;
            } else {
              dayData[`device_${res.deviceId}`] = null;
            }
          });
        } else {
          // Cumulative consumption (delta per day)
          let dayTotal = 0;
          results.forEach((res) => {
            const dayRecords = res.data.filter((d: any) => d.ts && isSameDayCustom(new Date(d.ts), day));
            if (dayRecords.length >= 2) {
              const sorted = dayRecords.sort((a: any, b: any) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
              const first = sorted[0];
              const last = sorted[sorted.length - 1];
              const delta = Math.max(0, last.kwtot - first.kwtot);
              dayData[`device_${res.deviceId}`] = Number(delta.toFixed(2));
              dayTotal += delta;
            } else {
              dayData[`device_${res.deviceId}`] = 0;
            }
          });
          dayData.total = Number(dayTotal.toFixed(2));
        }

        return dayData;
      });

      if (isDebugMode) {
        console.log("GraphPage: chartData:", aggregated);
        if (aggregated.length > 0) {
          console.log("GraphPage: Sample day data keys:", Object.keys(aggregated[0]));
        }
      }
      setChartData(aggregated);
      
      const totalsByDay = aggregated.map(day => day.total || 0);
      const total = totalsByDay.reduce((a, b) => a + b, 0);
      const peak = Math.max(...totalsByDay, 0);

      setStats({
        total,
        peak,
        average: total / aggregated.length
      });

    } catch (err) {
      console.error("Error fetching graph data:", err);
    } finally {
      setLoading(false);
    }
  }, [devices, selectedDeviceId, displayMode, token, startDate, endDate]);

  useEffect(() => {
    console.log("GraphPage: devices received:", devices);
    fetchData();
  }, [fetchData, devices]);

  const handleRangeChange = (mode: 'weekly' | 'monthly' | 'custom') => {
    setViewMode(mode);
    if (mode === 'weekly') {
      setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
      setEndDate(format(new Date(), 'yyyy-MM-dd'));
    } else if (mode === 'monthly') {
      setStartDate(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
      setEndDate(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  const handleExport = async (type: 'csv' | 'excel' | 'pdf') => {
    const deviceName = selectedDeviceId === 'all' ? 'כל המכשירים' : devices.find(d => d.id_user === selectedDeviceId)?.site_name || 'מכשיר';
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const fileName = `energy_graph_${deviceName}_${dateStr}`;
    const dateRange = `${startDate} - ${endDate}`;

    // Prepare data for export
    const headers = ['תאריך', ...Object.keys(chartData[0] || {}).filter(k => k !== 'name' && k !== 'date')];
    const exportData = chartData.map(day => [
      format(day.date, 'dd/MM/yyyy'),
      ...headers.slice(1).map(h => day[h] || 0)
    ]);

    if (type === 'csv') {
      exportToCSV(exportData, headers, fileName);
    } else if (type === 'excel') {
      const excelData = chartData.map(day => {
        const row: any = { 'תאריך': format(day.date, 'dd/MM/yyyy') };
        headers.slice(1).forEach(h => {
          row[h] = day[h] || 0;
        });
        return row;
      });
      exportToExcel(excelData, headers, fileName);
    } else if (type === 'pdf') {
      await exportToPDF(null, exportData, headers, 'דוח גרף צריכת אנרגיה', fileName, {
        deviceName,
        dateRange,
        stats: {
          total: stats.total.toFixed(2),
          peak: stats.peak.toFixed(2)
        }
      });
    }
    setIsExportOpen(false);
  };

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-8 bg-[var(--background)] min-h-full">
      <header className="flex flex-col gap-3 md:gap-4">
        <div>
          <h2 className="text-xl md:text-3xl font-bold text-[var(--foreground)] tracking-tight flex items-center gap-3">
            <TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-[var(--primary)]" />
            גרף צריכה
          </h2>
          <p className="text-[var(--muted)] text-sm font-medium mt-1">
            ניתוח צריכת אנרגיה מצטברת לפי מכשירים
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-4">
          {/* Export Button */}
          <div className="relative">
            <button 
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)] text-xs font-bold hover:bg-[var(--accent)] transition-all"
            >
              <Download className="w-4 h-4" />
              ייצוא
            </button>

            {isExportOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-[var(--card)] border border-white/10 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
                <button
                  onClick={() => handleExport('csv')}
                  className="w-full flex items-center gap-3 px-4 py-2 text-xs text-[var(--foreground)] hover:bg-white/5 transition-colors text-right"
                >
                  <FileJson className="w-4 h-4 text-[var(--muted)]" />
                  <span>ייצוא CSV</span>
                </button>
                <button
                  onClick={() => handleExport('excel')}
                  className="w-full flex items-center gap-3 px-4 py-2 text-xs text-[var(--foreground)] hover:bg-white/5 transition-colors text-right"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[var(--muted)]" />
                  <span>ייצוא Excel</span>
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  className="w-full flex items-center gap-3 px-4 py-2 text-xs text-[var(--foreground)] hover:bg-white/5 transition-colors text-right"
                >
                  <FileText className="w-4 h-4 text-[var(--muted)]" />
                  <span>ייצוא PDF</span>
                </button>
              </div>
            )}
          </div>

          {/* Refresh Button */}
          <button 
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)] text-xs font-bold hover:bg-[var(--accent)] transition-all disabled:opacity-50"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            רענן
          </button>

          {/* Device Selector */}
          <div className="flex items-center gap-2 bg-[var(--card)] p-1 rounded-xl border border-[var(--border)]">
            <select 
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="bg-transparent text-xs font-bold text-[var(--foreground)] px-3 py-2 outline-none cursor-pointer"
            >
              <option value="all" className="bg-[var(--card)] text-[var(--foreground)]">כל המכשירים</option>
              {devices.map(d => (
                <option key={d.id_user} value={d.id_user} className="bg-[var(--card)] text-[var(--foreground)]">
                  {d.site_name} ({d.id_user})
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 bg-[var(--card)] p-1 rounded-xl border border-[var(--border)]">
            <button 
              onClick={() => handleRangeChange('weekly')}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                viewMode === 'weekly' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              שבועי
            </button>
            <button 
              onClick={() => handleRangeChange('monthly')}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                viewMode === 'monthly' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              חודשי
            </button>
            <button 
              onClick={() => setViewMode('custom')}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                viewMode === 'custom' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              מותאם
            </button>
          </div>

          {viewMode === 'custom' && (
            <div className="flex items-center gap-2 bg-[var(--card)] p-1 rounded-xl border border-[var(--border)]">
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-[var(--foreground)] px-2 py-1 outline-none"
              />
              <span className="text-[var(--muted)]">-</span>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-[var(--foreground)] px-2 py-1 outline-none"
              />
            </div>
          )}

          {/* Display Mode Toggle */}
          <div className="flex items-center gap-1 bg-[var(--card)] p-1 rounded-xl border border-[var(--border)]">
            <button 
              onClick={() => setDisplayMode('cumulative')}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                displayMode === 'cumulative' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              צריכה יומית
            </button>
            <button 
              onClick={() => setDisplayMode('raw_kwtot')}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                displayMode === 'raw_kwtot' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              קריאה מצטברת
            </button>
            <button 
              onClick={() => setDisplayMode('tariff')}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all",
                displayMode === 'tariff' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              לפי תעריף
            </button>
          </div>
        </div>
      </header>

      {/* Main Chart Card */}
      <div 
        id="consumption-chart-container"
        className={cn(
        "bg-[var(--card)] rounded-2xl p-3 md:p-6 flex flex-col shadow-xl border border-white/5 transition-all duration-300",
        isFullScreen ? "fixed inset-4 z-[100]" : "h-[480px] md:h-[750px]"
      )}>
        {devices.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4 opacity-50">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
              <TrendingUp className="w-10 h-10 text-[var(--muted)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--foreground)]">לא נמצאו מכשירים</h3>
            <p className="text-sm text-[var(--muted)] max-w-xs">לא נמצאו מוני אנרגיה המשוייכים לחשבון שלך.</p>
          </div>
        ) : loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[var(--primary)]"></div>
            <p className="text-[var(--muted)] animate-pulse">טוען נתונים...</p>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4 opacity-50">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
              <Activity className="w-10 h-10 text-[var(--muted)]" />
            </div>
            <h3 className="text-xl font-bold text-[var(--foreground)]">אין נתונים להצגה</h3>
            <p className="text-sm text-[var(--muted)] max-w-xs">לא נמצאו נתוני צריכה עבור המכשירים והטווח שנבחרו.</p>
          </div>
        ) : stats.total === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
            <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center border border-yellow-500/20">
              <AlertTriangle className="w-10 h-10 text-yellow-500/50" />
            </div>
            <h3 className="text-xl font-bold text-[var(--foreground)]">לא נמצאו רשומות</h3>
            <p className="text-sm text-[var(--muted)] max-w-xs">
              {selectedDeviceId === 'all' 
                ? "לא נמצאו נתונים עבור אף אחד מהמונים בטווח התאריכים שנבחר."
                : `לא נמצאו נתונים עבור מונה ${devices.find(d => Number(d.id_user) === Number(selectedDeviceId))?.site_name || selectedDeviceId} בטווח שנבחר.`}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-[var(--primary)]/10 rounded-lg">
                  <Zap className="w-5 h-5 text-[var(--primary)]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--foreground)]">צריכה יומית (kWh)</h3>
                  <p className="text-xs text-[var(--muted)]">
                    {selectedDeviceId === 'all' ? 'נתונים מצטברים מכל המכשירים הפעילים' : `נתוני צריכה עבור ${devices.find(d => d.id_user === selectedDeviceId)?.site_name}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-2 hover:bg-[var(--border)] rounded-lg transition-colors"
                  title={isFullScreen ? "מזער" : "מסך מלא"}
                >
                  {isFullScreen ? <Minimize2 className="w-5 h-5 text-[var(--muted)]" /> : <Maximize2 className="w-5 h-5 text-[var(--muted)]" />}
                </button>
                <button 
                  onClick={fetchData}
                  disabled={loading}
                  className="p-2 hover:bg-[var(--border)] rounded-lg transition-colors"
                >
                  <RefreshCw className={cn("w-5 h-5 text-[var(--muted)]", loading && "animate-spin")} />
                </button>
              </div>
            </div>

            <div className={cn("w-full relative", isFullScreen ? "flex-1" : "h-[320px] md:h-[600px]")}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} debounce={100}>
                <BarChart
                  data={chartData}
                  margin={{ top: 16, right: 16, left: 0, bottom: 4 }}
                  barCategoryGap="28%"
                  barGap={3}
                >
                  <defs>
                    {DEVICE_COLORS.map((color, i) => (
                      <linearGradient key={i} id={`barGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.95} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                      </linearGradient>
                    ))}
                    <linearGradient id="barGradT1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.55} />
                    </linearGradient>
                    <linearGradient id="barGradT2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.55} />
                    </linearGradient>
                    <linearGradient id="barGradT3" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="0"
                    stroke="rgba(255,255,255,0.045)"
                    vertical={false}
                    strokeWidth={1}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--muted)', fontSize: 12, fontWeight: 500 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.06)', strokeWidth: 1 }}
                    dy={10}
                  />
                  <YAxis
                    tick={{ fill: 'var(--muted)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    dx={-6}
                    width={62}
                    orientation="right"
                    tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: 'rgba(255,255,255,0.03)', radius: 4 }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ paddingBottom: '20px', fontSize: '15px', color: 'var(--muted)' }}
                  />
                  {displayMode === 'raw_kwtot' ? (
                    (selectedDeviceId === 'all' ? devices : devices.filter(d => Number(d.id_user) === Number(selectedDeviceId))).map((device, index) => (
                      <Bar
                        key={device.id_user}
                        dataKey={`device_${device.id_user}`}
                        name={device.site_name}
                        fill={`url(#barGrad${index % DEVICE_COLORS.length})`}
                        radius={[5, 5, 0, 0]}
                        maxBarSize={56}
                        animationDuration={700}
                        animationEasing="ease-out"
                      />
                    ))
                  ) : selectedDeviceId === 'all' || (selectedDeviceId !== 'all' && displayMode === 'cumulative') ? (
                    (() => {
                      const devList = selectedDeviceId === 'all'
                        ? devices
                        : devices.filter(d => Number(d.id_user) === Number(selectedDeviceId));
                      const isStacked = selectedDeviceId === 'all';
                      return devList.map((device, index) => (
                        <Bar
                          key={device.id_user}
                          dataKey={`device_${device.id_user}`}
                          name={device.site_name}
                          stackId={isStacked ? 'a' : undefined}
                          fill={`url(#barGrad${index % DEVICE_COLORS.length})`}
                          radius={isStacked
                            ? (index === devList.length - 1 ? [5, 5, 0, 0] : [0, 0, 0, 0])
                            : [5, 5, 0, 0]}
                          maxBarSize={56}
                          animationDuration={700}
                          animationEasing="ease-out"
                        />
                      ));
                    })()
                  ) : (
                    <>
                      <Bar dataKey="T1 שפל" stackId="a" fill="url(#barGradT1)" radius={[0, 0, 0, 0]} maxBarSize={56} animationDuration={700} animationEasing="ease-out" />
                      <Bar dataKey="T2 גבע"  stackId="a" fill="url(#barGradT2)" radius={[0, 0, 0, 0]} maxBarSize={56} animationDuration={700} animationEasing="ease-out" />
                      <Bar dataKey="T3 פסגה" stackId="a" fill="url(#barGradT3)" radius={[5, 5, 0, 0]} maxBarSize={56} animationDuration={700} animationEasing="ease-out" />
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* Summary Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
        <div className="bg-[var(--card)] p-3 md:p-6 rounded-2xl flex items-center gap-3 md:gap-5 shadow-lg border border-white/5">
          <div className="p-2 md:p-4 bg-[var(--primary)]/10 rounded-xl md:rounded-2xl shrink-0">
            <Zap className="w-5 h-5 md:w-8 md:h-8 text-[var(--primary)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-0.5 md:mb-1">סה"כ</p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg md:text-3xl font-bold font-mono text-[var(--foreground)] truncate">{stats.total.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              <span className="text-xs md:text-sm font-bold text-[var(--muted)]">kWh</span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--card)] p-3 md:p-6 rounded-2xl flex items-center gap-3 md:gap-5 shadow-lg border border-white/5">
          <div className="p-2 md:p-4 bg-[var(--status-online)]/10 rounded-xl md:rounded-2xl shrink-0">
            <Activity className="w-5 h-5 md:w-8 md:h-8 text-[var(--status-online)]" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-0.5 md:mb-1">יום שיא</p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg md:text-3xl font-bold font-mono text-[var(--foreground)] truncate">{stats.peak.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              <span className="text-xs md:text-sm font-bold text-[var(--muted)]">kWh</span>
            </div>
          </div>
        </div>

        <div className="bg-[var(--card)] p-3 md:p-6 rounded-2xl flex items-center gap-3 md:gap-5 shadow-lg border border-white/5">
          <div className="p-2 md:p-4 bg-purple-500/10 rounded-xl md:rounded-2xl shrink-0">
            <Clock className="w-5 h-5 md:w-8 md:h-8 text-purple-500" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[var(--muted)] mb-0.5 md:mb-1">ממוצע יומי</p>
            <div className="flex items-baseline gap-1">
              <span className="text-lg md:text-3xl font-bold font-mono text-[var(--foreground)] truncate">{stats.average.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
              <span className="text-xs md:text-sm font-bold text-[var(--muted)]">kWh</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
