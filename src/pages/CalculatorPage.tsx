import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Device } from '../types';
import { Calculator, Calendar, Zap, RefreshCw, CheckCircle2, AlertCircle, ArrowLeft, Clock, Search, FileText } from 'lucide-react';
import { cn } from '../lib/utils';
import { format, subDays } from 'date-fns';
import { exportToPDF } from '../lib/exportUtils';

interface CalculatorPageProps {
  devices: Device[];
  token: string | null;
  isDebugMode?: boolean;
}

export const CalculatorPage: React.FC<CalculatorPageProps> = ({ devices, token, isDebugMode = false }) => {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | 'all'>(() => {
    // Try to get the last selected device from localStorage or use the first one
    const saved = localStorage.getItem('selectedDeviceId');
    if (saved === 'all') return 'all';
    if (saved) return Number(saved);
    return 'all';
  });

  // Update selectedDeviceId if devices change and none is selected
  React.useEffect(() => {
    if (isDebugMode) {
      console.log("CalculatorPage: devices received:", devices);
      console.log("CalculatorPage: current selectedDeviceId:", selectedDeviceId);
    }
    
    if (devices.length > 0) {
      // If selectedDeviceId is not 'all' and not in the devices list, reset to 'all'
      if (selectedDeviceId !== 'all' && !devices.some(d => d.id_user === selectedDeviceId)) {
        if (isDebugMode) {
          console.log("CalculatorPage: selectedDeviceId not found in devices, resetting to 'all'");
        }
        setSelectedDeviceId('all');
      }
    }
  }, [devices, selectedDeviceId, isDebugMode]);

  if (isDebugMode) {
    console.log("CalculatorPage: Rendering with", devices.length, "devices. Selected:", selectedDeviceId);
  }

  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<'summary' | 'raw'>('summary');
  const [rawHistory, setRawHistory] = useState<any[]>([]);
  const [rawSearch, setRawSearch] = useState('');

  const calculateForDevice = async (deviceId: number, token: string, start: Date, end: Date) => {
    const res = await fetch(`/api/energy/range-edges/${deviceId}?start=${start.toISOString()}&end=${end.toISOString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Failed to fetch range edges for device ${deviceId}`);
    const { first: firstRecord, last: lastRecord } = await res.json();

    if (!firstRecord || !lastRecord) return null;
    if (firstRecord.ts_getway === lastRecord.ts_getway) return null;

    const consumption = lastRecord.kwtot - firstRecord.kwtot;
    const days = Math.max(0.1, (new Date(lastRecord.ts_getway).getTime() - new Date(firstRecord.ts_getway).getTime()) / (1000 * 60 * 60 * 24));

    const t1 = Math.max(0, (lastRecord.kw_t1 ?? 0) - (firstRecord.kw_t1 ?? 0));
    const t2 = Math.max(0, (lastRecord.kw_t2 ?? 0) - (firstRecord.kw_t2 ?? 0));
    const t3 = Math.max(0, (lastRecord.kw_t3 ?? 0) - (firstRecord.kw_t3 ?? 0));

    return {
      deviceId,
      deviceName: devices.find(d => d.id_user === deviceId)?.site_name || `מכשיר ${deviceId}`,
      consumption: Math.max(0, consumption),
      t1,
      t2,
      t3,
      days,
      startVal: firstRecord.kwtot,
      endVal: lastRecord.kwtot,
      startDate: firstRecord.ts_getway,
      endDate: lastRecord.ts_getway
    };
  };

  const handleCalculate = async () => {
    if (!selectedDeviceId || !token) return;
    
    setLoading(true);
    setError(null);
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (selectedDeviceId === 'all') {
        const results = await Promise.all(
          devices.map(d => calculateForDevice(d.id_user, token, start, end))
        );
        const validResults = results.filter(r => r !== null);
        console.log("CalculatorPage: validResults:", validResults);
        
        if (validResults.length === 0) {
          throw new Error("לא נמצאו מספיק נתונים עבור אף אחד מהמונים בטווח התאריכים הנבחר.");
        }

        const totalConsumption = validResults.reduce((sum, r) => sum + (r?.consumption || 0), 0);
        setResult({
          isAll: true,
          totalConsumption,
          items: validResults,
          startDate: start.toISOString(),
          endDate: end.toISOString()
        });

        // Fetch raw history for all devices if in raw view
        if (viewType === 'raw') {
          const allHistory = await Promise.all(
            devices.map(async d => {
              const res = await fetch(`/api/energy/history/${d.id_user}?start=${start.toISOString()}&end=${end.toISOString()}&limit=2000`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (!res.ok) return [];
              const data = await res.json();
              return data.filter((item: any) => {
                const ts = new Date(item.ts_getway);
                return ts >= start && ts <= end;
              }).map((item: any) => ({ ...item, site_name: d.site_name }));
            })
          );
          setRawHistory(allHistory.flat().sort((a, b) => new Date(b.ts_getway).getTime() - new Date(a.ts_getway).getTime()));
        }
      } else {
        const res = await calculateForDevice(selectedDeviceId, token, start, end);
        if (!res) {
          throw new Error("לא נמצאו מספיק נתונים עבור המונה הנבחר בטווח התאריכים הנבחר.");
        }
        setResult({ ...res, isAll: false });

        if (viewType === 'raw') {
          const histRes = await fetch(`/api/energy/history/${selectedDeviceId}?start=${start.toISOString()}&end=${end.toISOString()}&limit=2000`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (histRes.ok) {
            const data = await histRes.json();
            const filtered = data.filter((item: any) => {
              const ts = new Date(item.ts_getway);
              return ts >= start && ts <= end;
            }).map((item: any) => ({ ...item, site_name: devices.find(d => d.id_user === selectedDeviceId)?.site_name }));
            setRawHistory(filtered.sort((a: any, b: any) => new Date(b.ts_getway).getTime() - new Date(a.ts_getway).getTime()));
          }
        }
      }
    } catch (err: any) {
      console.error("Calculation failed:", err);
      setError(err.message || "החישוב נכשל. נסה שוב מאוחר יותר.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!result) return;
    
    const deviceName = result.isAll ? 'כל המכשירים' : result.deviceName;
    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const fileName = `energy_calculation_${deviceName}_${dateStr}`;
    const dateRange = `${format(new Date(result.startDate), 'dd/MM/yyyy')} - ${format(new Date(result.endDate), 'dd/MM/yyyy')}`;

    const headers = ['מונה', 'זמן התחלה', 'זמן סיום', 'קריאה התחלתית', 'קריאה סופית', 'צריכה kWh', 'T1 פסגה (kWh)', 'T2 גבע (kWh)', 'T3 שפל (kWh)', 'ממוצע ליום'];
    const tableData = result.isAll
      ? result.items.map((item: any) => [
          item.deviceName,
          new Date(item.startDate).toLocaleString('he-IL'),
          new Date(item.endDate).toLocaleString('he-IL'),
          item.startVal.toLocaleString(undefined, { maximumFractionDigits: 1 }),
          item.endVal.toLocaleString(undefined, { maximumFractionDigits: 1 }),
          item.consumption.toLocaleString(undefined, { maximumFractionDigits: 1 }),
          (item.t1 || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }),
          (item.t2 || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }),
          (item.t3 || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }),
          (item.consumption / item.days).toFixed(2)
        ])
      : [[
          result.deviceName,
          new Date(result.startDate).toLocaleString('he-IL'),
          new Date(result.endDate).toLocaleString('he-IL'),
          result.startVal.toLocaleString(undefined, { maximumFractionDigits: 1 }),
          result.endVal.toLocaleString(undefined, { maximumFractionDigits: 1 }),
          result.consumption.toLocaleString(undefined, { maximumFractionDigits: 1 }),
          (result.t1 || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }),
          (result.t2 || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }),
          (result.t3 || 0).toLocaleString(undefined, { maximumFractionDigits: 1 }),
          (result.consumption / result.days).toFixed(2)
        ]];

    await exportToPDF(null, tableData, headers, 'דוח חישוב צריכת אנרגיה', fileName, {
      deviceName,
      dateRange,
      stats: {
        total: (result.isAll ? result.totalConsumption : result.consumption).toFixed(2),
        peak: result.isAll ? 'N/A' : (result.consumption / result.days).toFixed(2)
      }
    });
  };

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-8 bg-[var(--background)] min-h-full">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--foreground)] tracking-tight flex items-center gap-3">
            <Zap className="w-6 h-6 md:w-8 md:h-8 text-[var(--primary)]" />
            חישוב צריכת אנרגיה
          </h2>
          <p className="text-[var(--muted)] text-base md:text-sm font-medium mt-1">
            מאזן הספק וסיכום צריכה (מבוסס על הפרשי קריאות מונה)
          </p>
        </div>
        <Link
          to="/"
          className="flex items-center gap-2 px-4 py-2.5 md:py-2 bg-[var(--card)] hover:bg-[var(--border)] text-[var(--foreground)] rounded-xl transition-all border border-[var(--border)] text-base md:text-sm font-bold self-start sm:self-auto"
        >
          חזרה לדשבורד
          <ArrowLeft className="w-4 h-4" />
        </Link>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-[var(--card)] rounded-2xl p-6 space-y-6 shadow-xl border border-white/5">
            <div className="space-y-4">
              <p className="text-base md:text-sm font-medium text-[var(--foreground)]">בחר מונה אנרגיה וטווח תאריכים לחישוב</p>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm md:text-xs font-bold uppercase tracking-widest text-[var(--muted)]">מונה</label>
                  <span className="text-xs md:text-[10px] text-[var(--muted)]">{devices.length} מונים נמצאו</span>
                </div>
                <select 
                  value={selectedDeviceId} 
                  onChange={(e) => {
                    const val = e.target.value === 'all' ? 'all' : Number(e.target.value);
                    if (isDebugMode) {
                      console.log("CalculatorPage: Selected device ID:", val);
                    }
                    setSelectedDeviceId(val);
                    localStorage.setItem('selectedDeviceId', val.toString());
                  }}
                  className="w-full bg-[var(--background)] border border-[var(--border)] rounded-xl p-3 text-base md:text-sm focus:outline-none focus:border-[var(--primary)] transition-colors text-[var(--foreground)] shadow-inner"
                >
                  <option value="all" className="bg-[var(--card)]">כל המונים (סיכום)</option>
                  {devices.map(d => {
                    if (isDebugMode) {
                      console.log(`CalculatorPage: Rendering option for device ${d.id_user}: ${d.site_name}`);
                    }
                    return (
                      <option key={d.id_user} value={d.id_user} className="bg-[var(--card)]">
                        {d.site_name} (#{d.id_user})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <label className="text-sm md:text-xs font-bold uppercase tracking-widest text-[var(--muted)]">מתאריך</label>
                  <div className="relative">
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-black/5 border border-[var(--border)] rounded-xl p-3 pr-10 text-base md:text-sm focus:outline-none focus:border-[var(--primary)] transition-colors text-[var(--foreground)]"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm md:text-xs font-bold uppercase tracking-widest text-[var(--muted)]">עד תאריך</label>
                  <div className="relative">
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-black/5 border border-[var(--border)] rounded-xl p-3 pr-10 text-base md:text-sm focus:outline-none focus:border-[var(--primary)] transition-colors text-[var(--foreground)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm md:text-xs font-bold uppercase tracking-widest text-[var(--muted)]">סוג תצוגה</label>
              <div className="flex items-center gap-1 bg-black/5 p-1 rounded-xl border border-[var(--border)]">
                <button 
                  onClick={() => setViewType('summary')}
                  className={cn(
                    "flex-1 py-2.5 md:py-2 rounded-lg text-sm md:text-xs font-bold transition-all",
                    viewType === 'summary' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  )}
                >
                  סיכום
                </button>
                <button 
                  onClick={() => setViewType('raw')}
                  className={cn(
                    "flex-1 py-2.5 md:py-2 rounded-lg text-sm md:text-xs font-bold transition-all",
                    viewType === 'raw' ? "bg-[var(--primary)] text-white shadow-lg" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  )}
                >
                  נתונים גולמיים
                </button>
              </div>
            </div>

            <button 
              onClick={handleCalculate}
              disabled={loading || !selectedDeviceId}
              className="w-full py-4 bg-[var(--primary)] hover:bg-[var(--primary)]/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[var(--primary)]/20"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Calculator className="w-5 h-5" />}
              חשב צריכה
            </button>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-500">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-base md:text-sm font-medium">{error}</p>
            </div>
          )}

          <div className="p-4 bg-[var(--primary)]/5 border border-[var(--primary)]/10 rounded-xl space-y-2">
            <h4 className="text-sm md:text-xs font-bold uppercase tracking-widest text-[var(--primary)]">שיטת החישוב</h4>
            <p className="text-sm md:text-xs text-[var(--muted)] leading-relaxed">
              החישוב מתבצע על ידי מציאת הקריאה הראשונה והאחרונה בטווח התאריכים הנבחר, וחישוב ההפרש ביניהן (kWh). 
              שיטה זו מבטיחה דיוק מרבי עבור מונים מצטברים.
            </p>
          </div>
        </div>

        {/* Results Section */}
        <div className="lg:col-span-2">
          {result ? (
            <div className="space-y-6 animate-in fade-in slide-in-from-left-4 duration-500">
              {viewType === 'summary' ? (
                <>
                  <div className="bg-[var(--card)] p-5 md:p-8 rounded-2xl flex flex-col items-center text-center space-y-4 shadow-xl border border-white/5">
                    <div className="p-4 bg-[var(--primary)]/10 rounded-full">
                      <Zap className="w-10 h-10 text-[var(--primary)]" />
                    </div>
                    <div>
                      <p className="text-base md:text-sm font-bold uppercase tracking-widest text-[var(--muted)] mb-1">
                        {result.isAll ? 'סה"כ צריכה לכל המונים' : `סה"כ צריכה - ${result.deviceName}`}
                      </p>
                      <div className="flex items-baseline gap-2 justify-center">
                        <span className="text-4xl md:text-5xl font-bold font-mono text-[var(--foreground)] tracking-tighter">
                          {(result.isAll ? result.totalConsumption : result.consumption).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                        <span className="text-2xl md:text-xl font-bold text-[var(--muted)]">kWh</span>
                      </div>
                      {!result.isAll && (
                        <div className="mt-4 flex flex-col items-center gap-1">
                          <div className="flex items-center gap-2 text-xl md:text-sm text-[var(--muted)] font-mono">
                            <Clock className="w-5 h-5 md:w-4 md:h-4" />
                            <span>התחלה: {new Date(result.startDate).toLocaleString('he-IL')}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xl md:text-sm text-[var(--muted)] font-mono">
                            <Clock className="w-5 h-5 md:w-4 md:h-4" />
                            <span>סיום: {new Date(result.endDate).toLocaleString('he-IL')}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-[var(--card)] rounded-2xl overflow-hidden shadow-xl border border-white/5">
                    <div className="p-4 md:p-6 border-b border-[var(--border)] bg-white/5 flex flex-wrap justify-between items-center gap-3">
                      <h3 className="font-bold text-[var(--foreground)] flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-[var(--status-online)]" />
                        פירוט חישוב
                      </h3>
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={handleExportPDF}
                          className="flex items-center gap-2 px-3 py-2 md:py-1.5 bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 text-[var(--primary)] rounded-lg transition-all text-sm md:text-xs font-bold"
                        >
                          <FileText className="w-4 h-4" />
                          ייצוא PDF
                        </button>
                        <span className="text-sm md:text-xs font-mono text-[var(--muted)]">
                          {new Date(result.startDate).toLocaleDateString('he-IL')} - {new Date(result.endDate).toLocaleDateString('he-IL')}
                        </span>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-right border-collapse">
                        <thead>
                          <tr className="bg-white/5 text-base md:text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                            <th className="p-4">מונה</th>
                            <th className="p-4">זמן התחלה</th>
                            <th className="p-4">זמן סיום</th>
                            <th className="p-4">קריאה התחלתית</th>
                            <th className="p-4">קריאה סופית</th>
                            <th className="p-4">צריכה (kWh)</th>
                            <th className="p-4">T1 פסגה (kWh)</th>
                            <th className="p-4">T2 גבע (kWh)</th>
                            <th className="p-4">T3 שפל (kWh)</th>
                            <th className="p-4">ממוצע ליום</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.isAll ? (
                            result.items.map((item: any) => (
                              <tr key={item.deviceId} className="border-b border-[var(--border)] hover:bg-white/5 transition-colors">
                                <td className="p-4 text-lg md:text-sm font-bold text-[var(--foreground)]">{item.deviceName}</td>
                                <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{new Date(item.startDate).toLocaleString('he-IL')}</td>
                                <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{new Date(item.endDate).toLocaleString('he-IL')}</td>
                                <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{item.startVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{item.endVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                <td className="p-4 text-lg md:text-sm font-bold text-[var(--foreground)] font-mono">{item.consumption.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{item.t1.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{item.t2.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{item.t3.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                <td className="p-4 text-lg md:text-sm text-[var(--primary)] font-mono">{(item.consumption / item.days).toFixed(2)}</td>
                              </tr>
                            ))
                          ) : (
                            <tr className="border-b border-[var(--border)]">
                              <td className="p-4 text-lg md:text-sm font-bold text-[var(--foreground)]">{result.deviceName}</td>
                              <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{new Date(result.startDate).toLocaleString('he-IL')}</td>
                              <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{new Date(result.endDate).toLocaleString('he-IL')}</td>
                              <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{result.startVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{result.endVal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="p-4 text-lg md:text-sm font-bold text-[var(--foreground)] font-mono">{result.consumption.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{result.t1.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{result.t2.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">{result.t3.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="p-4 text-lg md:text-sm text-[var(--primary)] font-mono">{(result.consumption / result.days).toFixed(2)}</td>
                            </tr>
                          )}
                        </tbody>
                        {result.isAll && (
                          <tfoot>
                            <tr className="bg-[var(--primary)]/5 font-bold">
                              <td colSpan={5} className="p-4 text-lg md:text-sm text-[var(--foreground)]">סה"כ משולב</td>
                              <td className="p-4 text-xl md:text-lg text-[var(--primary)] font-mono">{result.totalConsumption.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">
                                {result.items.reduce((sum: number, item: any) => sum + (item.t1 || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                              </td>
                              <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">
                                {result.items.reduce((sum: number, item: any) => sum + (item.t2 || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                              </td>
                              <td className="p-4 text-lg md:text-sm text-[var(--muted)] font-mono">
                                {result.items.reduce((sum: number, item: any) => sum + (item.t3 || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                              </td>
                              <td className="p-4 text-lg md:text-sm text-[var(--primary)] font-mono">
                                {(result.items.reduce((sum: number, item: any) => sum + (item.consumption / item.days), 0)).toFixed(2)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-[var(--card)] rounded-2xl overflow-hidden shadow-xl border border-white/5">
                  <div className="p-6 border-b border-[var(--border)] bg-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-[var(--primary)]" />
                      <h3 className="font-bold text-[var(--foreground)]">
                        היסטוריית קריאות גולמית (kwtot)
                      </h3>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                      <div className="relative flex-1 md:w-64">
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                        <input 
                          type="text" 
                          placeholder="חפש בנתונים..."
                          className="w-full bg-black/10 border border-[var(--border)] rounded-xl py-2.5 md:py-2 pr-10 pl-3 text-base md:text-sm focus:outline-none focus:border-[var(--primary)] transition-colors text-[var(--foreground)]"
                          value={rawSearch}
                          onChange={(e) => setRawSearch(e.target.value)}
                        />
                      </div>
                      <span className="text-sm md:text-xs font-mono text-[var(--muted)] whitespace-nowrap">
                        {rawHistory.filter(item => 
                          item.site_name.toLowerCase().includes(rawSearch.toLowerCase()) ||
                          item.kwtot.toString().includes(rawSearch) ||
                          new Date(item.ts_getway).toLocaleString('he-IL').includes(rawSearch)
                        ).length} רשומות
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-right border-collapse">
                      <thead className="sticky top-0 bg-[var(--card)] z-10">
                        <tr className="bg-white/5 text-xs font-bold uppercase tracking-widest text-[var(--muted)]">
                          <th className="p-4">זמן</th>
                          <th className="p-4">מונה</th>
                          <th className="p-4">קריאה (kwtot)</th>
                          <th className="p-4">V L1</th>
                          <th className="p-4">A L1</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rawHistory
                          .filter(item => 
                            item.site_name.toLowerCase().includes(rawSearch.toLowerCase()) ||
                            item.kwtot.toString().includes(rawSearch) ||
                            new Date(item.ts_getway).toLocaleString('he-IL').includes(rawSearch)
                          )
                          .map((item, idx) => (
                          <tr key={idx} className="border-b border-[var(--border)] hover:bg-white/5 transition-colors">
                            <td className="p-4 text-base md:text-sm text-[var(--muted)] font-mono">
                              {new Date(item.ts_getway).toLocaleString('he-IL')}
                            </td>
                            <td className="p-4 text-base md:text-sm font-bold text-[var(--foreground)]">{item.site_name}</td>
                            <td className="p-4 text-base md:text-sm font-bold text-[var(--primary)] font-mono">
                              {item.kwtot.toLocaleString(undefined, { minimumFractionDigits: 1 })}
                            </td>
                            <td className="p-4 text-base md:text-sm text-[var(--muted)] font-mono">{item.vl1n}V</td>
                            <td className="p-4 text-base md:text-sm text-[var(--muted)] font-mono">{item.AL1}A</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full min-h-[400px] bg-[var(--card)] rounded-2xl flex flex-col items-center justify-center text-center p-12 space-y-4 opacity-50 shadow-xl border border-white/5">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/10">
                <Calculator className="w-10 h-10 text-[var(--muted)]" />
              </div>
              <h3 className="text-xl font-bold text-[var(--foreground)]">ממתין לחישוב</h3>
              <p className="text-base md:text-sm text-[var(--muted)] max-w-xs">בחר מונה וטווח תאריכים כדי לראות את תוצאות החישוב כאן.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
