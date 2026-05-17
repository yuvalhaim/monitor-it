import React, { useState, useMemo } from 'react';
import { EnergyData } from '../types';
import { Download, ChevronLeft, ChevronRight, ArrowUpDown, FileText, FileSpreadsheet, FileJson } from 'lucide-react';
import { cn } from '../lib/utils';
import { exportToCSV, exportToExcel, exportToPDF } from '../lib/exportUtils';

interface HistoryTableProps {
  data: EnergyData[];
  deviceName: string;
}

type SortKey = keyof EnergyData | 'ts_getway';

export const HistoryTable: React.FC<HistoryTableProps> = ({ data, deviceName }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'ts_getway',
    direction: 'desc'
  });

  const rowsPerPage = 20;

  const sortedData = useMemo(() => {
    const sortableData = [...data];
    sortableData.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

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

  const headers = ['תאריך', 'צריכה (kWh)', 'מתח ממוצע (V)', 'זרם ממוצע (A)'];
  
  const getExportData = () => {
    return sortedData.map(d => [
      new Date(d.ts_getway).toLocaleString('he-IL'),
      d.kwtot.toFixed(2),
      ((d.vl1n + d.vl2n + d.vl3n) / 3).toFixed(1),
      ((d.AL1 + d.AL2 + d.AL3) / 3).toFixed(2)
    ]);
  };

  const handleExport = async (type: 'csv' | 'excel' | 'pdf') => {
    const dateStr = new Date().toISOString().split('T')[0];
    const fileName = `energy_history_${deviceName}_${dateStr}`;
    const exportData = getExportData();

    if (type === 'csv') {
      exportToCSV(exportData, headers, fileName);
    } else if (type === 'excel') {
      const excelData = sortedData.map(d => ({
        'תאריך': new Date(d.ts_getway).toLocaleString('he-IL'),
        'צריכה (kWh)': d.kwtot,
        'מתח ממוצע (V)': Number(((d.vl1n + d.vl2n + d.vl3n) / 3).toFixed(1)),
        'זרם ממוצע (A)': Number(((d.AL1 + d.AL2 + d.AL3) / 3).toFixed(2))
      }));
      exportToExcel(excelData, headers, fileName);
    } else if (type === 'pdf') {
      const dateRange = sortedData.length > 0 
        ? `${new Date(sortedData[sortedData.length - 1].ts_getway).toLocaleDateString('he-IL')} - ${new Date(sortedData[0].ts_getway).toLocaleDateString('he-IL')}`
        : dateStr;
      
      await exportToPDF(null, exportData, headers, 'דוח היסטוריית קריאות', fileName, {
        deviceName,
        dateRange
      });
    }
    setIsExportOpen(false);
  };

  return (
    <div className="bg-[var(--card)] rounded-2xl shadow-lg border border-white/5 overflow-hidden">
      <div className="p-4 md:p-6 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl md:text-lg font-bold text-[var(--foreground)] tracking-tight uppercase">היסטוריית קריאות</h3>
          <p className="text-sm md:text-xs text-[var(--muted)]">{data.length} קריאות אחרונות מהמכשיר</p>
        </div>
        
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

      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-black/20">
              <th className="px-3 md:px-6 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="ts_getway" label="זמן" />
              </th>
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="vl1n" label="V L1" />
              </th>
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="vl2n" label="V L2" />
              </th>
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="vl3n" label="V L3" />
              </th>
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="AL1" label="A L1" />
              </th>
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="AL2" label="A L2" />
              </th>
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="AL3" label="A L3" />
              </th>
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="kwtot" label="kW" />
              </th>
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="kw_t1" label="T1" />
              </th>
              <th className="px-3 md:px-4 py-3 md:py-4 text-xs md:text-[10px] font-bold text-[var(--muted)] uppercase tracking-widest border-b border-white/5">
                <SortButton columnKey="kw_t3" label="T3" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginatedData.map((row, idx) => (
              <tr key={idx} className="hover:bg-white/5 transition-colors group">
                <td className="px-3 md:px-6 py-3 md:py-4 text-sm md:text-xs font-mono text-[var(--foreground)] whitespace-nowrap">
                  {new Date(row.ts_getway).toLocaleString('he-IL')}
                </td>
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.vl1n.toFixed(1)}</td>
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.vl2n.toFixed(1)}</td>
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.vl3n.toFixed(1)}</td>
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.AL1.toFixed(2)}</td>
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.AL2.toFixed(2)}</td>
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.AL3.toFixed(2)}</td>
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.kwtot.toFixed(2)}</td>
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.kw_t1.toFixed(2)}</td>
                <td className="px-3 md:px-4 py-3 md:py-4 text-base md:text-sm font-mono text-[var(--foreground)]">{row.kw_t3.toFixed(2)}</td>
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
