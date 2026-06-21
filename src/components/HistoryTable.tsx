import React, { useState, useMemo } from 'react';
import { EnergyData } from '../types';
import { Download, ChevronLeft, ChevronRight, ArrowUpDown, FileText, FileSpreadsheet, FileJson, Calendar } from 'lucide-react';
import { cn } from '../lib/utils';
import { exportToCSV, exportToExcel, exportToPDF } from '../lib/exportUtils';

interface HistoryTableProps {
  data: EnergyData[];
  deviceName: string;
  deviceId?: number;
}

type SortKey = keyof EnergyData | 'ts';

export const HistoryTable: React.FC<HistoryTableProps> = ({ data, deviceName, deviceId }) => {
  const isSinglePhase = data.length > 0 && data[0].meter_type === 'EM511';
  const hasHz = data.some(d => d.hz != null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [showRangeModal, setShowRangeModal] = useState(false);
  const [rangeType, setRangeType] = useState<'week' | 'month' | 'custom'>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [rangeExporting, setRangeExporting] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'ts',
    direction: 'desc'
  });

  const rowsPerPage = 20;

  const sortedData = useMemo(() => {
    const sortableData = [...data];
    sortableData.sort((a, b) => {
      const aValue = a[sortConfig.key] ?? '';
      const bValue = b[sortConfig.key] ?? '';

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    return sortableData;
  }, [data, sortConfig]);

  const totalPages = Math.ceil(sortedData.length / rowsPerPage);
  const paginatedData = sortedData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortButton = ({ columnKey, label }: { columnKey: SortKey; label: string }) => (
    <button 
      onClick={() => requestSort(columnKey)}
      className="flex items-center gap-2 hover:text-[var(--foreground)] transition-colors group"
    >
      {label}
      <ArrowUpDown className={cn(
        "w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity",
        sortConfig.key === columnKey && "opacity-100 text-[var(--primary)]"
      )} />
    </button>
  );

  const headers = isSinglePhase
    ? ['תאריך', 'V L1', 'A L1', 'kWh', ...(hasHz ? ['Hz'] : [])]
    : ['תאריך', 'V L1', 'V L2', 'V L3', 'A L1', 'A L2', 'A L3', 'kWh', 'T1', 'T3', ...(hasHz ? ['Hz'] : [])];

  const getExportData = () => {
    return sortedData.map(d => isSinglePhase
      ? [
          new Date(d.ts).toLocaleString('he-IL'),
          d.vl1n.toFixed(1),
          d.AL1.toFixed(2),
          d.kwtot.toFixed(2),
          ...(hasHz ? [d.hz?.toFixed(2) ?? ''] : []),
        ]
      : [
          new Date(d.ts).toLocaleString('he-IL'),
          d.vl1n.toFixed(1),
          d.vl2n.toFixed(1),
          d.vl3n.toFixed(1),
          d.AL1.toFixed(2),
          d.AL2.toFixed(2),
          d.AL3.toFixed(2),
          d.kwtot.toFixed(2),
          d.t1?.toFixed(2) ?? '',
          d.t3?.toFixed(2) ?? '',
          ...(hasHz ? [d.hz?.toFixed(2) ?? ''] : []),
        ]
    );
  };

  const handleExport = async (type: 'csv' | 'excel' | 'pdf') => {
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `energy_history_${deviceName}_${dateStr}`;
    const exportData = getExportData();

    if (type === 'csv') {
      exportToCSV(exportData, headers, fileName);
    } else if (type === 'excel') {
      const excelData = sortedData.map(d => isSinglePhase
        ? {
            'תאריך': new Date(d.ts).toLocaleString('he-IL'),
            'V L1': d.vl1n,
            'A L1': d.AL1,
            'kWh': d.kwtot,
            ...(hasHz ? { 'Hz': d.hz ?? null } : {}),
          }
        : {
            'תאריך': new Date(d.ts).toLocaleString('he-IL'),
            'V L1': d.vl1n, 'V L2': d.vl2n, 'V L3': d.vl3n,
            'A L1': d.AL1,  'A L2': d.AL2,  'A L3': d.AL3,
            'kWh': d.kwtot,
            'T1': d.t1 ?? null,
            'T3': d.t3 ?? null,
            ...(hasHz ? { 'Hz': d.hz ?? null } : {}),
          }
      );
      exportToExcel(excelData, headers, fileName);
    } else if (type === 'pdf') {
      const dateRange = sortedData.length > 0 
        ? `${new Date(sortedData[sortedData.length - 1].ts).toLocaleDateString('he-IL')} - ${new Date(sortedData[0].ts).toLocaleDateString('he-IL')}`
        : dateStr;
      
      await exportToPDF(null, exportData, headers, 'דוח היסטוריית קריאות', fileName, {
        deviceName,
        dateRange
      });
    }
    setIsExportOpen(false);
  };

  const handleRangeExport = async () => {
    if (!deviceId) return;
    setRangeExporting(true);
    try {
      const now = new Date();
      let start: Date, end: Date;
      if (rangeType === 'week') {
        end = now;
        start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      } else if (rangeType === 'month') {
        end = now;
        start = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
      } else {
        if (!customStart || !customEnd) return;
        start = new Date(customStart);
        end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
      }

      const token = localStorage.getItem('token');
      const res = await fetch(
        `/api/energy/history/${deviceId}?start=${start.toISOString()}&end=${end.toISOString()}&limit=50000`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) { const e = await res.json(); alert(e.error || 'שגיאה בטעינת נתונים'); return; }

      const rows: EnergyData[] = await res.json();
      // detect phase and hz from fetched data (may differ from current view)
      const sp = rows.length > 0 && rows[0].meter_type === 'EM511';
      const rhz = rows.some(d => d.hz != null);
      const hdrs = sp
        ? ['תאריך', 'V L1', 'A L1', 'kWh', ...(rhz ? ['Hz'] : [])]
        : ['תאריך', 'V L1', 'V L2', 'V L3', 'A L1', 'A L2', 'A L3', 'kWh', 'T1', 'T3', ...(rhz ? ['Hz'] : [])];
      const csvRows = rows.map(d => sp
        ? [new Date(d.ts).toLocaleString('he-IL'), d.vl1n?.toFixed(1) ?? '', d.AL1?.toFixed(2) ?? '', d.kwtot?.toFixed(2) ?? '', ...(rhz ? [d.hz?.toFixed(2) ?? ''] : [])]
        : [new Date(d.ts).toLocaleString('he-IL'),
           d.vl1n?.toFixed(1) ?? '', d.vl2n?.toFixed(1) ?? '', d.vl3n?.toFixed(1) ?? '',
           d.AL1?.toFixed(2) ?? '', d.AL2?.toFixed(2) ?? '', d.AL3?.toFixed(2) ?? '',
           d.kwtot?.toFixed(2) ?? '', d.t1?.toFixed(2) ?? '', d.t3?.toFixed(2) ?? '',
           ...(rhz ? [d.hz?.toFixed(2) ?? ''] : [])]
      );

      const label = rangeType === 'week' ? 'week' : rangeType === 'month' ? 'month'
        : `${customStart}_${customEnd}`;
      exportToCSV(csvRows, hdrs, `energy_${deviceName}_${label}`);
      setShowRangeModal(false);
    } finally {
      setRangeExporting(false);
    }
  };

  return (
    <div className="bg-[var(--card)] rounded-2xl shadow-lg border border-white/5 overflow-hidden">
      <div className="p-4 md:p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl md:text-lg font-bold text-[var(--foreground)] tracking-tight uppercase">היסטוריית קריאות</h3>
          <p className="text-sm md:text-xs text-[var(--muted)]">{data.length} קריאות אחרונות מהמכשיר</p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Range CSV export */}
          {deviceId && (
            <button
              onClick={() => { setShowRangeModal(true); setIsExportOpen(false); }}
              className="flex items-center gap-2 px-4 py-2.5 md:py-2 bg-[var(--primary)]/10 hover:bg-[var(--primary)]/20 text-[var(--primary)] rounded-lg transition-all border border-[var(--primary)]/30 text-sm md:text-xs font-bold uppercase tracking-widest"
            >
              <Calendar className="w-4 h-4" />
              ייצוא טווח
            </button>
          )}

          {/* Current view export */}
          <div className="relative">
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="flex items-center gap-2 px-4 py-2.5 md:py-2 bg-white/5 hover:bg-white/10 text-[var(--muted)] hover:text-[var(--foreground)] rounded-lg transition-all border border-white/5 text-sm md:text-xs font-bold uppercase tracking-widest"
            >
              <Download className="w-4 h-4" />
              ייצוא נתונים
            </button>

            {isExportOpen && (
              <div className="absolute left-0 mt-2 w-48 bg-[var(--card)] border border-white/10 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2">
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
        </div>
      </div>

      {/* Range export modal */}
      {showRangeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={e => { if (e.target === e.currentTarget) setShowRangeModal(false); }}
        >
          <div className="bg-[var(--card)] border border-white/10 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" dir="rtl">
            <h3 className="text-base font-bold text-[var(--foreground)] mb-4">ייצוא נתונים לפי טווח</h3>

            {/* Range selector */}
            <div className="flex gap-2 mb-5">
              {(['week', 'month', 'custom'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setRangeType(t)}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-xs font-bold border transition-all',
                    rangeType === t
                      ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                      : 'bg-white/5 text-[var(--muted)] border-white/10 hover:bg-white/10'
                  )}
                >
                  {t === 'week' ? 'שבוע' : t === 'month' ? 'חודש' : 'מותאם'}
                </button>
              ))}
            </div>

            {rangeType === 'custom' && (
              <div className="flex flex-col gap-3 mb-5">
                <div>
                  <label className="text-xs text-[var(--muted)] block mb-1">מתאריך</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--muted)] block mb-1">עד תאריך</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                    dir="ltr"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleRangeExport}
                disabled={rangeExporting || (rangeType === 'custom' && (!customStart || !customEnd))}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[var(--primary)] hover:bg-[var(--primary)]/80 text-white rounded-lg text-sm font-bold transition-all disabled:opacity-40"
              >
                {rangeExporting
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Download className="w-4 h-4" />}
                {rangeExporting ? 'מוריד...' : 'ייצוא CSV'}
              </button>
              <button
                onClick={() => setShowRangeModal(false)}
                className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-[var(--muted)] rounded-lg text-sm transition-all"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-black/20">
              <th className="px-3 md:px-6 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="ts" label="זמן" />
              </th>
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="vl1n" label="V L1" />
              </th>
              {!isSinglePhase && <>
                <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                  <SortButton columnKey="vl2n" label="V L2" />
                </th>
                <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                  <SortButton columnKey="vl3n" label="V L3" />
                </th>
              </>}
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="AL1" label="A L1" />
              </th>
              {!isSinglePhase && <>
                <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                  <SortButton columnKey="AL2" label="A L2" />
                </th>
                <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                  <SortButton columnKey="AL3" label="A L3" />
                </th>
              </>}
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="kwtot" label="kWh" />
              </th>
              {!isSinglePhase && <>
                <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                  <SortButton columnKey="t1" label="T1" />
                </th>
                <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                  <SortButton columnKey="t3" label="T3" />
                </th>
              </>}
              {hasHz && (
                <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-fuchsia-400 uppercase tracking-widest border-b border-white/5">
                  <SortButton columnKey="hz" label="Hz" />
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginatedData.map((row, idx) => (
              <tr key={idx} className="hover:bg-white/5 transition-colors group">
                <td className="px-3 md:px-6 py-3 md:py-4 text-sm md:text-xs font-mono text-[var(--foreground)] whitespace-nowrap">
                  {new Date(row.ts).toLocaleString('he-IL')}
                </td>
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.vl1n.toFixed(1)}</td>
                {!isSinglePhase && <>
                  <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.vl2n.toFixed(1)}</td>
                  <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.vl3n.toFixed(1)}</td>
                </>}
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.AL1.toFixed(2)}</td>
                {!isSinglePhase && <>
                  <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.AL2.toFixed(2)}</td>
                  <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.AL3.toFixed(2)}</td>
                </>}
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.kwtot.toFixed(2)}</td>
                {!isSinglePhase && <>
                  <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.t1?.toFixed(2)}</td>
                  <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.t3?.toFixed(2)}</td>
                </>}
              {hasHz && (
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-fuchsia-400">{row.hz?.toFixed(2) ?? '—'}</td>
              )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 md:p-6 border-t border-white/5 flex items-center justify-between gap-2">
        <p className="text-sm md:text-xs text-[var(--muted)]">
          מציג <span className="text-[var(--foreground)] font-bold">{(currentPage - 1) * rowsPerPage + 1}</span> עד <span className="text-[var(--foreground)] font-bold">{Math.min(currentPage * rowsPerPage, sortedData.length)}</span> מתוך <span className="text-[var(--foreground)] font-bold">{sortedData.length}</span> קריאות
        </p>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-30 transition-all text-[var(--muted)]"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(page => {
                if (totalPages <= 5) return true;
                return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
              })
              .reduce<(number | 'ellipsis')[]>((acc, page, idx, arr) => {
                if (idx > 0 && typeof arr[idx - 1] === 'number' && (page as number) - (arr[idx - 1] as number) > 1) {
                  acc.push('ellipsis');
                }
                acc.push(page);
                return acc;
              }, [])
              .map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e${idx}`} className="w-6 text-center text-[var(--muted)] text-xs">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item as number)}
                    className={cn(
                      "w-9 h-9 md:w-8 md:h-8 rounded-lg text-sm md:text-xs font-bold transition-all",
                      currentPage === item ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-white/5"
                    )}
                  >
                    {item}
                  </button>
                )
              )}
          </div>
          <button 
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
            className="p-2 hover:bg-white/5 rounded-lg disabled:opacity-30 transition-all text-[var(--muted)]"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
