import React, { useState, useEffect, useCallback } from 'react';
import { Device, EnergyData, User } from '../types';
import { EnergyCard } from '../components/EnergyCard';
import { StatusCard } from '../components/StatusCard';
import { VoltageCard } from '../components/VoltageCard';
import { ConsumptionCard } from '../components/ConsumptionCard';
import { HistoryChart } from '../components/HistoryChart';
import { HistoryTable } from '../components/HistoryTable';
import { ConsumptionDistribution } from '../components/ConsumptionDistribution';
import { RefreshCw, AlertCircle, ArrowRight, Monitor } from 'lucide-react';
import { cn } from '../lib/utils';
import { apiFetch } from '../lib/apiFetch';

interface DashboardProps {
  user: User;
  token: string | null;
  selectedDevice: Device | null;
  devices: Device[];
  onSelectDevice: (device: Device | null) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ token, selectedDevice, devices, onSelectDevice }) => {
  const [latestData, setLatestData] = useState<EnergyData | null>(null);
  const [historyData, setHistoryData] = useState<EnergyData[]>([]);
  const [distributionData, setDistributionData] = useState<any[]>([]);
  const [allLatestData, setAllLatestData] = useState<Record<number, EnergyData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [chartRange, setChartRange] = useState('today');

  const fetchChartData = useCallback(async (range: string) => {
    if (!selectedDevice || !token) return;
    
    let hours = 24;
    let limit = 1000;
    let customStart: Date | null = null;
    let customEnd: Date | null = null;
    
    if (range.startsWith('custom:')) {
      const parts = range.split(':');
      customStart = new Date(parts[1]);
      customEnd = new Date(parts[2]);
      customEnd.setHours(23, 59, 59, 999);
      
      // Calculate hours between start and now
      const diffMs = new Date().getTime() - customStart.getTime();
      hours = Math.ceil(diffMs / (1000 * 60 * 60));
      limit = 5000;
      range = 'custom';
    } else {
      switch (range) {
        case 'today': hours = 24; limit = 1000; break;
        case 'yesterday': hours = 48; limit = 2000; break;
        case 'week': hours = 168; limit = 3000; break;
        case 'custom': hours = 720; limit = 5000; break;
      }
    }

    try {
      const res = await apiFetch(`/api/energy/history/${selectedDevice.id_user}?hours=${hours}&limit=${limit}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        let data = await res.json();
        if (!Array.isArray(data)) data = [];
        
        if (range === 'yesterday') {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const startOfYesterday = new Date(yesterday.setHours(0, 0, 0, 0)).getTime();
          const endOfYesterday = new Date(yesterday.setHours(23, 59, 59, 999)).getTime();
          
          data = data.filter((d: EnergyData) => {
            if (!d || !d.ts) return false;
            const ts = new Date(d.ts).getTime();
            return ts >= startOfYesterday && ts <= endOfYesterday;
          });
        } else if (range === 'custom' && customStart && customEnd) {
          const startTs = customStart.getTime();
          const endTs = customEnd.getTime();

          data = data.filter((d: EnergyData) => {
            if (!d || !d.ts) return false;
            const ts = new Date(d.ts).getTime();
            return ts >= startTs && ts <= endTs;
          });
        }
        
        setHistoryData(data);
      }
    } catch (err) {
      console.error("Error fetching chart data:", err);
    }
  }, [selectedDevice, token]);

  const fetchAllLatestData = useCallback(async () => {
    if (devices.length === 0 || !token) return;

    setLoading(true);
    try {
      const res = await apiFetch('/api/energy/latest/all', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data: Record<number, EnergyData> = await res.json();
      setAllLatestData(data);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      console.error(err);
      setError('נכשל בטעינת נתונים עבור כל המכשירים.');
    } finally {
      setLoading(false);
    }
  }, [devices, token]);

  const fetchSelectedDeviceData = useCallback(async () => {
    if (!selectedDevice || !token) return;
    
    setLoading(true);
    try {
      // Fetch latest
      const latestRes = await apiFetch(`/api/energy/latest/${selectedDevice.id_user}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!latestRes.ok) throw new Error('Failed to fetch energy data');
      const latest = await latestRes.json();
      setLatestData(latest);

      // Fetch history for chart based on current range
      await fetchChartData(chartRange);

      // Fetch daily distribution data (last 30 days) - using the new efficient endpoint
      const distRes = await apiFetch(`/api/energy/daily/${selectedDevice.id_user}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (distRes.ok) {
        const distData = await distRes.json();
        setDistributionData(Array.isArray(distData) ? distData : []);
      }

      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      console.error(err);
      setError('חיבור למסד הנתונים נכשל. אנא בדוק את ההגדרות.');
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, token, chartRange, fetchChartData]);

  useEffect(() => {
    if (selectedDevice) {
      fetchSelectedDeviceData();
    } else {
      fetchAllLatestData();
    }
    
    const interval = setInterval(() => {
      if (selectedDevice) {
        fetchSelectedDeviceData();
      } else {
        fetchAllLatestData();
      }
    }, 60000); // Auto-refresh every 60 seconds
    
    return () => clearInterval(interval);
  }, [selectedDevice, fetchSelectedDeviceData, fetchAllLatestData]);

  useEffect(() => {
    if (selectedDevice) {
      fetchChartData(chartRange);
    }
  }, [chartRange, selectedDevice, fetchChartData]);


  return (
    <div className="flex-1 overflow-y-auto bg-[var(--background)] p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 mb-6 md:mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              {selectedDevice && (
                <button 
                  onClick={() => onSelectDevice(null)}
                  className="p-2 hover:bg-[var(--card)] rounded-lg transition-colors text-[var(--muted)]"
                >
                  <ArrowRight className="w-6 h-6" />
                </button>
              )}
              <h2 className="text-2xl md:text-3xl font-bold text-[var(--foreground)] tracking-tight">
                {selectedDevice ? selectedDevice.site_name : 'סקירת מערכת'}
              </h2>
              <span className="px-2 py-1 bg-[var(--primary)] text-white text-[10px] font-bold rounded uppercase tracking-widest">
                {selectedDevice ? 'מכשיר פעיל' : 'כל המכשירים'}
              </span>
            </div>
            <p className="text-[var(--muted)] text-base md:text-sm font-medium flex items-center gap-2">
              {selectedDevice ? (
                <>
                  מיקום: <span className="text-[var(--foreground)]">{selectedDevice.location}</span>
                  <span className="w-1 h-1 rounded-full bg-[var(--border)]" />
                  מזהה: <span className="text-[var(--foreground)] font-mono">#{selectedDevice.id_user}</span>
                </>
              ) : (
                <>סה"כ מכשירים מנוטרים: <span className="text-[var(--foreground)]">{devices.length}</span></>
              )}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs md:text-[10px] uppercase font-bold text-[var(--muted)] tracking-widest mb-1">סנכרון אחרון</p>
              <p className="text-sm md:text-xs font-mono text-[var(--foreground)]">{lastRefresh.toLocaleTimeString()}</p>
            </div>
            <button 
              onClick={selectedDevice ? fetchSelectedDeviceData : fetchAllLatestData}
              disabled={loading}
              className="p-3 bg-[var(--card)] hover:bg-[var(--border)] rounded-xl border border-[var(--border)] transition-all group active:scale-95 shadow-lg"
            >
              <RefreshCw className={cn("w-5 h-5 text-[var(--muted)] group-hover:text-[var(--foreground)]", loading && 'animate-spin')} />
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {selectedDevice ? (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* 1. Live Data */}
            <div className="space-y-6">
              <StatusCard data={latestData} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <VoltageCard data={latestData} />
                <ConsumptionCard data={latestData} />
              </div>
            </div>

            {/* 2. Current History Chart */}
            <HistoryChart 
              data={historyData} 
              onRangeChange={(range) => setChartRange(range)}
            />

            {/* 3. Monthly/Weekly Consumption Distribution */}
            <ConsumptionDistribution data={distributionData} />
            
            {/* 4. History Table */}
            <HistoryTable
              data={historyData}
              deviceName={selectedDevice.site_name}
              deviceId={selectedDevice.id_user}
            />
          </div>
        ) : devices.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {devices.map((device: Device) => (
              <EnergyCard 
                key={device.id_user} 
                device={device} 
                data={allLatestData[device.id_user] || null} 
                onClick={() => onSelectDevice(device)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 glass-card">
            <Monitor className="w-16 h-16 text-[var(--muted)] mb-4 opacity-20" />
            <h3 className="text-xl font-bold text-[var(--foreground)] mb-2">לא נמצאו מכשירים</h3>
            <p className="text-[var(--muted)] text-sm">אין מכשירים המשויכים לחשבון זה במערכת.</p>
          </div>
        )}
      </div>
    </div>
  );
};
