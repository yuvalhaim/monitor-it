import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./pages/Dashboard";
import { Alerts } from "./pages/Alerts";
import { Login } from "./pages/Login";
import { GraphPage } from "./pages/GraphPage";
import { CalculatorPage } from "./pages/CalculatorPage";
import { UsersPage } from "./pages/UsersPage";
import { CustomersPage } from "./pages/CustomersPage";
import { WeighingPage } from "./pages/WeighingPage";
import { OcioPage } from "./pages/OcioPage";
import { LevelPage } from "./pages/LevelPage";
import { PsKsPage } from "./pages/PsKsPage";
import { HaifaPage } from "./pages/HaifaPage";
import { OffJerPage } from "./pages/OffJerPage";
import { AdminOverviewPage } from "./pages/AdminOverviewPage";
import { IoTWidgetsTestPage } from "./pages/IoTWidgetsTestPage";
import { Device, AlertConfig, AlertHistory, User, EnergyData, WeighingDevice, OcioDevice, LevelDevice, PsKsDevice, OffJerDevice } from "./types";
import { cn } from "./lib/utils";
import { setUnauthorizedHandler } from "./lib/apiFetch";

export default function App() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [userProfile, setUserProfile] = useState<any>(null);
  const [alertsConfig, setAlertsConfig] = useState<AlertConfig>({
    smtp: { from: "", password: "", recipients: "" },
    rules: []
  });
  const [alertsHistory, setAlertsHistory] = useState<AlertHistory[]>([]);
  const [allLatestData, setAllLatestData] = useState<Record<number, EnergyData>>({});
  const [weighingDevices, setWeighingDevices] = useState<WeighingDevice[]>([]);
  const [selectedWeighingId, setSelectedWeighingId] = useState<number | null>(null);
  const [ocioDevices, setOcioDevices] = useState<OcioDevice[]>([]);
  const [selectedOcioId, setSelectedOcioId] = useState<number | null>(null);
  const [levelDevices, setLevelDevices] = useState<LevelDevice[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<number | null>(null);
  const [psKsDevices, setPsKsDevices] = useState<PsKsDevice[]>([]);
  const [selectedPsKsId, setSelectedPsKsId] = useState<number | null>(null);
  const [offJerDevices, setOffJerDevices] = useState<OffJerDevice[]>([]);
  const [selectedOffJerId, setSelectedOffJerId] = useState<number | null>(null);

  // Fetch all devices
  const fetchDevices = async () => {
    if (!user || !token) return;
    try {
      const res = await fetch(`/api/devices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to fetch devices");
      }
      const data = await res.json();
      setDevices(data);
      fetchAllLatestData(data);
    } catch (err: any) {
      console.error("Error fetching devices:", err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllLatestData = async (deviceList: Device[]) => {
    if (deviceList.length === 0 || !token) return;
    try {
      const results = await Promise.all(
        deviceList.map(device =>
          fetch(`/api/energy/latest/${device.id_user}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(res => res.ok ? res.json() : null)
        )
      );
      const newData: Record<number, EnergyData> = {};
      results.forEach((data, idx) => {
        if (data) newData[deviceList[idx].id_user] = data;
      });
      setAllLatestData(newData);
    } catch (err) {
      console.error("Error fetching latest device data:", err);
    }
  };

  const fetchWeighingDevices = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/weighing/devices", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data: WeighingDevice[] = await res.json();
      setWeighingDevices(data);
      if (data.length > 0) setSelectedWeighingId(prev => prev ?? data[0].id_user);
    } catch (err) {
      console.error("Error fetching weighing devices:", err);
    }
  };

  const fetchOcioDevices = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/ocio/devices", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data: OcioDevice[] = await res.json();
      setOcioDevices(data);
      if (data.length > 0) setSelectedOcioId(prev => prev ?? data[0].id_user);
    } catch (err) {
      console.error("Error fetching ocio devices:", err);
    }
  };

  const fetchLevelDevices = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/level/devices", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data: LevelDevice[] = await res.json();
      setLevelDevices(data);
      if (data.length > 0) setSelectedLevelId(prev => prev ?? data[0].id_user);
    } catch (err) {
      console.error("Error fetching level devices:", err);
    }
  };

  const fetchPsKsDevices = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/psks/devices", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data: PsKsDevice[] = await res.json();
      setPsKsDevices(data);
      if (data.length > 0) setSelectedPsKsId(prev => prev ?? data[0].id_user);
    } catch (err) {
      console.error("Error fetching psks devices:", err);
    }
  };

  const fetchOffJerDevices = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/ofjer/devices", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data: OffJerDevice[] = await res.json();
      setOffJerDevices(data);
      if (data.length > 0) setSelectedOffJerId(prev => prev ?? data[0].id_user);
    } catch (err) {
      console.error("Error fetching ofjer devices:", err);
    }
  };

  const fetchAlertsConfig = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/alerts/config", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAlertsConfig(data);
    } catch (err) {
      console.error("Error fetching alerts config:", err);
    }
  };

  const fetchAlertsHistory = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/alerts/history", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAlertsHistory(data);
    } catch (err) {
      console.error("Error fetching alerts history:", err);
    }
  };

  const fetchUserProfile = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/users/me", {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data);
      }
    } catch (err) {
      console.error("Error fetching user profile:", err);
    }
  };

  useEffect(() => {
    setUnauthorizedHandler(handleLogout);
  }, []);

  useEffect(() => {
    if (user) {
      fetchDevices();
      fetchWeighingDevices();
      fetchOcioDevices();
      fetchLevelDevices();
      fetchPsKsDevices();
      fetchOffJerDevices();
      fetchAlertsConfig();
      fetchAlertsHistory();
      fetchUserProfile();
    } else {
      setLoading(false);
    }

    const interval = setInterval(() => {
      if (user) {
        fetchAlertsHistory();
        fetchAllLatestData(devices);
      }
    }, 120000); // Refresh history every 120s

    return () => clearInterval(interval);
  }, [user]);

  const handleLogin = (userData: User, tokenData: string) => {
    setUser(userData);
    setToken(tokenData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', tokenData);
    window.history.replaceState({}, '', '/');
  };

  const handleLogout = () => {
    const currentToken = token;
    setUser(null);
    setToken(null);
    setUserProfile(null);
    setDevices([]);
    setSelectedDevice(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('lastActivityAt');
    if (currentToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Authorization": `Bearer ${currentToken}` }
      }).catch(() => {});
    }
  };

  const handleSaveAlertsConfig = async (config: AlertConfig) => {
    if (!token) return false;
    try {
      const res = await fetch("/api/alerts/config", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        setAlertsConfig(config);
        return true;
      }
    } catch (err) {
      console.error("Failed to save alerts config", err);
    }
    return false;
  };

  const handleTestEmail = async (smtp: any) => {
    if (!token) return;
    try {
      const res = await fetch("/api/alerts/test", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(smtp)
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);

  // Handle window resize to auto-close sidebar on mobile
  useEffect(() => {
    let prevWidth = window.innerWidth;
    const handleResize = () => {
      const currentWidth = window.innerWidth;
      if (currentWidth === prevWidth) return; // height-only resize (e.g. iOS address bar scroll)
      prevWidth = currentWidth;
      if (currentWidth <= 768) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  // Auto-logout after 15 minutes of inactivity
  // Uses localStorage timestamp so iOS Safari's suspended timers don't keep sessions alive.
  useEffect(() => {
    if (!user) return;

    const TIMEOUT_MS = 15 * 60 * 1000;
    const STORAGE_KEY = 'lastActivityAt';

    const markActivity = () => localStorage.setItem(STORAGE_KEY, String(Date.now()));

    const checkAndReset = () => {
      const last = Number(localStorage.getItem(STORAGE_KEY) || 0);
      if (Date.now() - last > TIMEOUT_MS) {
        handleLogout();
        alert('נותקת מהמערכת עקב חוסר פעילות של 15 דקות.');
        return;
      }
      resetTimer();
    };

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        handleLogout();
        alert('נותקת מהמערכת עקב חוסר פעילות של 15 דקות.');
      }, TIMEOUT_MS);
    };

    const onActivity = () => {
      markActivity();
      resetTimer();
    };

    // When returning from background, check wall-clock elapsed time.
    // visibilitychange covers most browsers; pageshow covers iOS Safari bfcache restores.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkAndReset();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) checkAndReset();
    };

    // On fresh mount (e.g. iOS killed and reloaded the page): check wall-clock
    // elapsed time BEFORE marking activity. Without this, markActivity() would
    // overwrite lastActivityAt with "now" and reset the 15-min clock even after
    // the user was away for an hour.
    const storedLast = Number(localStorage.getItem(STORAGE_KEY) || 0);
    if (storedLast > 0 && Date.now() - storedLast > TIMEOUT_MS) {
      handleLogout();
      alert('נותקת מהמערכת עקב חוסר פעילות של 15 דקות.');
      return;
    }
    markActivity();
    resetTimer();

    const events = ['mousedown', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(e => window.addEventListener(e, onActivity));
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(e => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [user]);

  if (loading) {
    return (
      <div className={cn("min-h-screen flex items-center justify-center", isDarkMode ? "dark bg-[var(--background)] text-white" : "bg-[#f0f2f5] text-black")}>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-[#00b4d8]"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={cn(isDarkMode ? "dark" : "")}>
        <Login onLogin={handleLogin} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
      </div>
    );
  }

  return (
    <Router>
      <div className={cn("h-screen flex flex-col overflow-hidden transition-colors duration-300", isDarkMode ? "dark bg-[var(--background)] text-[var(--foreground)]" : "bg-[var(--background)] text-[var(--foreground)]")}>
        <Navbar
          isDarkMode={isDarkMode}
          toggleTheme={toggleTheme}
          devices={devices}
          onToggleSidebar={toggleSidebar}
          onLogout={handleLogout}
        />
        
        <div className="flex flex-1 overflow-hidden relative">
          <Sidebar
            user={user}
            userProfile={userProfile}
            devices={devices}
            allLatestData={allLatestData}
            selectedDeviceId={selectedDevice?.id_user || null}
            onSelectDevice={setSelectedDevice}
            weighingDevices={weighingDevices}
            selectedWeighingId={selectedWeighingId}
            onSelectWeighingDevice={setSelectedWeighingId}
            ocioDevices={ocioDevices}
            selectedOcioId={selectedOcioId}
            onSelectOcioDevice={setSelectedOcioId}
            levelDevices={levelDevices}
            selectedLevelId={selectedLevelId}
            onSelectLevelDevice={setSelectedLevelId}
            psKsDevices={psKsDevices}
            selectedPsKsId={selectedPsKsId}
            onSelectPsKsDevice={setSelectedPsKsId}
            offJerDevices={offJerDevices}
            selectedOffJerId={selectedOffJerId}
            onSelectOffJerDevice={setSelectedOffJerId}
            isDemoMode={isDemoMode}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />
          
          <main className={cn("flex-1 overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out", isSidebarOpen ? "pr-72" : "pr-0")}>
            <Routes>
              <Route path="/" element={
                user.role === 'admin'
                  ? <Navigate to="/overview" replace />
                  : userProfile?.application === 'Energy'
                  ? <Navigate to="/energy" replace />
                  : userProfile?.application === 'Weighing'
                  ? <Navigate to="/weighing" replace />
                  : userProfile?.application === 'Ocio'
                  ? <Navigate to="/ocio" replace />
                  : userProfile?.application === 'Level'
                  ? <Navigate to="/level" replace />
                  : userProfile?.application === 'Level_PsKs'
                  ? <Navigate to="/level/ps_ks" replace />
                  : userProfile?.application === 'Custom'
                  ? <Navigate to="/custom/haifa" replace />
                  : userProfile?.application === 'OffJer'
                  ? <Navigate to="/custom/offjer" replace />
                  : <Dashboard user={user} token={token} selectedDevice={selectedDevice} devices={devices} onSelectDevice={setSelectedDevice} />
              } />
              <Route path="/energy" element={
                user.role === 'admin'
                  ? <Navigate to="/overview" replace />
                  : <Dashboard user={user} token={token} selectedDevice={selectedDevice} devices={devices} onSelectDevice={setSelectedDevice} />
              } />
              <Route path="/weighing" element={<WeighingPage token={token} userProfile={userProfile} isDarkMode={isDarkMode} />} />
              <Route path="/ocio" element={<OcioPage token={token} userProfile={userProfile} isDarkMode={isDarkMode} />} />
              <Route path="/level" element={<LevelPage token={token} userProfile={userProfile} isDarkMode={isDarkMode} />} />
              <Route path="/level/ps_ks" element={<PsKsPage token={token} userProfile={userProfile} isDarkMode={isDarkMode} />} />
              <Route path="/custom/haifa" element={<HaifaPage token={token} userProfile={userProfile} isDarkMode={isDarkMode} />} />
              <Route path="/custom/offjer" element={<OffJerPage token={token} userProfile={userProfile} isDarkMode={isDarkMode} />} />
              <Route path="/graph" element={<GraphPage devices={devices} token={token} isDebugMode={isDebugMode} />} />
              <Route path="/calculator" element={<CalculatorPage devices={devices} token={token} isDebugMode={isDebugMode} />} />
              {user.role === 'admin' && (
                <Route path="/users" element={<UsersPage token={token} />} />
              )}
              {user.role === 'admin' && (
                <Route path="/customers" element={<CustomersPage token={token} />} />
              )}
              {user.role === 'admin' && (
                <Route path="/overview" element={<AdminOverviewPage token={token} isDarkMode={isDarkMode} />} />
              )}
              <Route path="/alerts" element={
                <Alerts
                  devices={devices}
                  token={token}
                  config={alertsConfig}
                  history={alertsHistory}
                  onSaveConfig={handleSaveAlertsConfig}
                />
              } />
              <Route path="/iot-test" element={<IoTWidgetsTestPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </Router>
  );
}
