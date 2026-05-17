import React, { useState } from 'react';
import { 
  Menu,
  Download,
  Maximize2,
  Bell,
  LogOut,
  Sun, 
  Moon,
  ChevronDown,
  FileSpreadsheet,
  FileText
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { Device } from '../types';

interface NavbarProps {
  isDarkMode: boolean;
  toggleTheme: () => void;
  devices?: Device[];
  onToggleSidebar: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  isDarkMode,
  toggleTheme,
  devices = [],
  onToggleSidebar,
  onLogout
}) => {
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  const exportDevicesCSV = () => {
    if (devices.length === 0) return;
    
    const headers = ['מזהה', 'שם אתר', 'מיקום', 'סטטוס'];
    const rows = devices.map(d => [
      d.id_user,
      d.site_name,
      d.location,
      'פעיל'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        const str = String(cell);
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `devices_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadOptions = [
    { label: 'ייצוא רשימת מכשירים (CSV)', icon: FileSpreadsheet, action: exportDevicesCSV },
    { label: 'צילום מסך (PDF)', icon: FileText, action: () => window.print() },
  ];

  return (
    <nav className="h-16 md:h-16 border-b border-[var(--border)] bg-[var(--background)] flex items-center justify-between px-3 md:px-6 sticky top-0 z-50">
      {/* Left side: hamburger + logo */}
      <div className="flex items-center gap-2 md:gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2.5 md:p-2 hover:bg-[var(--border)] rounded-lg transition-colors text-[var(--foreground)]"
          aria-label="פתח תפריט"
        >
          <Menu className="w-7 h-7 md:w-6 md:h-6" />
        </button>
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-9 h-9 md:w-8 md:h-8 bg-[var(--primary)] rounded flex items-center justify-center">
            <span className="text-white font-bold text-lg md:text-lg">M</span>
          </div>
          <span className="text-xl md:text-xl font-bold tracking-tight text-[var(--foreground)]">Monitor It</span>
        </Link>
      </div>

      {/* Right side: actions */}
      <div className="flex items-center gap-1 md:gap-2">

        {/* Export Dropdown — hidden on mobile */}
        <div className="relative hidden md:block">
          <button
            onClick={() => setIsDownloadOpen(!isDownloadOpen)}
            className="flex items-center gap-2 px-3 py-2 hover:bg-[var(--border)] rounded-lg transition-colors text-[var(--foreground)]"
            title="ייצוא"
          >
            <Download className="w-5 h-5" />
            <ChevronDown className={cn("w-4 h-4 transition-transform", isDownloadOpen && "rotate-180")} />
          </button>
          {isDownloadOpen && (
            <div className="absolute left-0 mt-2 w-56 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl py-2 z-[60] animate-in fade-in slide-in-from-top-2">
              {downloadOptions.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => { option.action(); setIsDownloadOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--border)] transition-colors text-right"
                >
                  <option.icon className="w-4 h-4 flex-shrink-0 text-[var(--muted)]" />
                  <span className="flex-1">{option.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fullscreen — hidden on mobile */}
        <button
          onClick={toggleFullscreen}
          className="hidden md:flex p-2 hover:bg-[var(--border)] rounded-lg transition-colors text-[var(--foreground)]"
          title="מסך מלא"
        >
          <Maximize2 className="w-5 h-5" />
        </button>

        {/* Bell */}
        <button className="p-2.5 md:p-2 hover:bg-[var(--border)] rounded-lg transition-colors text-[var(--foreground)] relative" title="התראות">
          <Bell className="w-6 h-6 md:w-5 md:h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-[var(--background)]" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2.5 md:p-2 hover:bg-[var(--border)] rounded-lg transition-colors text-[var(--foreground)]"
          title="החלף מצב תצוגה"
        >
          {isDarkMode ? <Sun className="w-6 h-6 md:w-5 md:h-5" /> : <Moon className="w-6 h-6 md:w-5 md:h-5" />}
        </button>

        {/* Logout */}
        <button
          onClick={onLogout}
          className="p-2.5 md:p-2 hover:bg-red-500/10 rounded-lg transition-colors text-red-500"
          title="התנתק"
        >
          <LogOut className="w-6 h-6 md:w-5 md:h-5" />
        </button>
      </div>
    </nav>
  );
};
