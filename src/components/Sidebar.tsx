import React, { useState } from 'react';
import {
  LayoutDashboard,
  Droplets,
  Waves,
  Scale,
  Bell,
  Calculator,
  BarChart3,
  Monitor,
  Search,
  Users,
  User as UserIcon,
  Mail,
  Phone,
  Building2,
  Contact,
  CalendarClock,
  Zap,
  Table2,
  Hash,
  Activity,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Device, EnergyData, User, WeighingDevice, OcioDevice, LevelDevice, OffJerDevice } from '../types';
import { cn } from '../lib/utils';

interface SidebarProps {
  user: User;
  userProfile: any;
  devices: Device[];
  allLatestData?: Record<string, EnergyData>;
  selectedDeviceId: number | null;
  onSelectDevice: (device: Device | null) => void;
  weighingDevices?: WeighingDevice[];
  selectedWeighingId?: number | null;
  onSelectWeighingDevice?: (id: number) => void;
  ocioDevices?: OcioDevice[];
  selectedOcioId?: number | null;
  onSelectOcioDevice?: (id: number) => void;
  levelDevices?: LevelDevice[];
  selectedLevelId?: number | null;
  onSelectLevelDevice?: (id: number) => void;
  offJerDevices?: OffJerDevice[];
  selectedOffJerId?: number | null;
  onSelectOffJerDevice?: (id: number) => void;
  isDemoMode: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  userProfile,
  devices,
  allLatestData = {} as Record<string, EnergyData>,
  selectedDeviceId,
  onSelectDevice,
  weighingDevices = [],
  selectedWeighingId,
  onSelectWeighingDevice,
  ocioDevices = [],
  selectedOcioId,
  onSelectOcioDevice,
  levelDevices = [],
  selectedLevelId,
  onSelectLevelDevice,
  offJerDevices = [],
  selectedOffJerId,
  onSelectOffJerDevice,
  isDemoMode,
  isOpen,
  onClose
}) => {
  const getDeviceStatusColor = (deviceId: number) => {
    const data = allLatestData[String(deviceId)];
    if (!data) return { bg: 'bg-[var(--status-offline)]', glow: 'var(--status-offline)' };
    const diffMinutes = (Date.now() - new Date(data.ts_getway).getTime()) / (1000 * 60);
    if (diffMinutes < 5)  return { bg: 'bg-[var(--status-online)]',  glow: 'var(--status-online)' };
    if (diffMinutes < 30) return { bg: 'bg-[var(--status-warning)]', glow: 'var(--status-warning)' };
    return { bg: 'bg-[var(--status-offline)]', glow: 'var(--status-offline)' };
  };
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');

  const [showOnlyMyDevices, setShowOnlyMyDevices] = useState(false);
  const overlayTouchMoved = React.useRef(false);

  // On desktop the sidebar stays open — only the hamburger button closes it.
  // On mobile it's a full-screen overlay, so navigation/selection must close it.
  const closeOnMobile = () => { if (window.innerWidth < 768) onClose(); };

  const filteredDevices = devices.filter(d => {
    const siteName = d.site_name.toLowerCase();
    if (siteName.includes('ocio') || siteName.includes('silo')) return false;
    
    const matchesSearch = d.site_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         d.id_user.toString().includes(searchQuery);
    const matchesMyDevices = !showOnlyMyDevices || d.email === user.email;
    return matchesSearch && matchesMyDevices;
  });

  const isAdmin    = user.role === 'admin';
  const application = isAdmin ? null : (userProfile?.application ?? 'Energy');
  const isEnergy   = application === 'Energy';
  const isWeighing = application === 'Weighing';
  const isOcio     = application === 'Ocio';
  const isLevel    = application === 'Level';
  const isHaifa    = application === 'Custom';
  const isOffJer   = application === 'OffJer';

  const actionLinks = isAdmin ? [] : [
    ...(isEnergy  ? [
      { label: 'דאשבורד',     icon: LayoutDashboard, path: '/energy' },
      { label: 'חישוב צריכה', icon: Calculator,       path: '/calculator' },
      { label: 'גרף צריכה',   icon: BarChart3,        path: '/graph' },
    ] : []),
    ...(isWeighing ? [
      { label: 'משקל', icon: Scale, path: '/weighing' },
    ] : []),
    ...(isOcio ? [
      { label: 'מפלס', icon: Waves, path: '/ocio' },
    ] : []),
    ...(isLevel ? [
      { label: 'מפלס', icon: Waves, path: '/level' },
    ] : []),
    ...(isHaifa ? [
      { label: 'ניטור מים', icon: Droplets, path: '/custom/haifa' },
    ] : []),
    ...(isOffJer ? [
      { label: 'מוני ספירה', icon: Hash, path: '/custom/offjer' },
    ] : []),
    { label: 'התראות', icon: Bell, path: '/alerts' },
  ];

  return (
    <>
      {/* Mobile Overlay — sits below navbar */}
      <div
        className={cn(
          "fixed left-0 right-72 bottom-0 top-16 bg-black/60 z-40 transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onTouchStart={() => { overlayTouchMoved.current = false; }}
        onTouchMove={() => { overlayTouchMoved.current = true; }}
        onTouchEnd={(e) => { if (!overlayTouchMoved.current) { e.preventDefault(); onClose(); } }}
        onClick={onClose}
      />

      <aside
        onTouchStart={(e) => e.stopPropagation()}
        onTouchMove={(e) => e.stopPropagation()}
        onTouchEnd={(e) => e.stopPropagation()}
        className={cn(
        "bg-[var(--sidebar-bg)] text-[var(--sidebar-foreground)] flex flex-col overflow-hidden transition-all duration-300 ease-in-out z-50",
        // Always fixed — below the navbar, pinned to the right edge
        "fixed top-16 right-0 bottom-0 w-72",
        isOpen
          ? "translate-x-0"
          : "translate-x-full"
      )}>
        <div className="w-72 flex flex-col h-full">
      {/* Middle Section - Action Links */}
      <div className="p-4 space-y-1 border-b border-[var(--sidebar-border)]">
        {actionLinks.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={closeOnMobile}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
              (location.pathname === item.path || (item.path === '/' && location.pathname === '/energy'))
                ? "bg-[var(--sidebar-hover)] text-[var(--sidebar-foreground)] font-bold"
                : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
            )}
          >
            <item.icon className={cn("w-4 h-4", (location.pathname === item.path || (item.path === '/' && location.pathname === '/energy')) ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]")} />
            <span className="text-base md:text-sm">{item.label}</span>
          </Link>
        ))}
{user.role === 'admin' && (
          <Link
            to="/overview"
            onClick={closeOnMobile}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
              location.pathname === '/overview'
                ? "bg-[var(--sidebar-hover)] text-[var(--sidebar-foreground)] font-bold"
                : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
            )}
          >
            <Activity className={cn("w-4 h-4", location.pathname === '/overview' ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]")} />
            <span className="text-base md:text-sm">סקירת מערכת</span>
          </Link>
        )}
        {user.role === 'admin' && (
          <Link
            to="/customers"
            onClick={closeOnMobile}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
              location.pathname === '/customers'
                ? "bg-[var(--sidebar-hover)] text-[var(--sidebar-foreground)] font-bold"
                : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
            )}
          >
            <Building2 className={cn("w-4 h-4", location.pathname === '/customers' ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]")} />
            <span className="text-base md:text-sm">ניהול לקוחות</span>
          </Link>
        )}
        {user.role === 'admin' && (
          <Link
            to="/users"
            onClick={closeOnMobile}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 group",
              location.pathname === '/users'
                ? "bg-[var(--sidebar-hover)] text-[var(--sidebar-foreground)] font-bold"
                : "text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
            )}
          >
            <Users className={cn("w-4 h-4", location.pathname === '/users' ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]")} />
            <span className="text-base md:text-sm">ניהול משתמשים</span>
          </Link>
        )}
      </div>

      {/* User Profile Card */}
      {userProfile && (
        <div className="p-4 border-b border-[var(--sidebar-border)]">
          <div className="bg-[var(--sidebar-hover)] rounded-xl p-3 border border-[var(--sidebar-border)] space-y-2">
            <div className="flex items-center gap-2 text-[var(--sidebar-foreground)] mb-1">
              <UserIcon className="w-4 h-4 text-[var(--primary)]" />
              <span className="text-lg md:text-base font-bold truncate">{userProfile.user_name}</span>
            </div>

            {userProfile.email && (
              <div className="flex items-center gap-2 text-[var(--sidebar-muted)]">
                <Mail className="w-4 h-4" />
                <span className="text-sm md:text-xs truncate">{userProfile.email}</span>
              </div>
            )}

            {userProfile.contact_name && (
              <div className="flex items-center gap-2 text-[var(--sidebar-foreground)]">
                <Contact className="w-4 h-4 text-[var(--primary)]" />
                <span className="text-base md:text-sm font-semibold truncate">{userProfile.contact_name}</span>
              </div>
            )}

            {userProfile.mobile_phone && (
              <div className="flex items-center gap-2 text-[var(--sidebar-foreground)]">
                <Phone className="w-4 h-4 text-[var(--primary)]" />
                <span className="text-base md:text-sm font-mono font-semibold" dir="ltr">{userProfile.mobile_phone}</span>
              </div>
            )}

            {userProfile.site_name && (
              <div className="flex items-center gap-2 text-[var(--sidebar-muted)]">
                <Building2 className="w-4 h-4" />
                <span className="text-sm md:text-xs truncate">שם אתר: {userProfile.site_name}</span>
              </div>
            )}

            {userProfile.date_exp && (
              <div className="flex items-center gap-2 text-[var(--sidebar-muted)]">
                <CalendarClock className="w-4 h-4 shrink-0" />
                <span className="text-sm md:text-xs">
                  תפוגה: {new Date(userProfile.date_exp).toLocaleDateString('he-IL')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Section - Device List */}
      <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm md:text-xs font-bold uppercase tracking-widest text-[var(--sidebar-muted)]">מידע</h3>
          {!isWeighing && !isOcio && !isLevel && !isHaifa && !isOffJer && (
            <button
              onClick={() => onSelectDevice(null)}
              className="text-xs md:text-[10px] font-bold text-[var(--primary)] hover:underline uppercase tracking-wider"
            >
              הצג הכל
            </button>
          )}
        </div>

        {isOffJer ? (
          /* ── OffJer device list ── */
          <div className="space-y-1">
            {offJerDevices.map((device) => (
              <button
                key={device.id_user}
                onClick={() => { onSelectOffJerDevice?.(device.id_user); closeOnMobile(); }}
                className={cn(
                  "w-full text-right p-3 rounded-xl border transition-all duration-200 group relative overflow-hidden",
                  selectedOffJerId === device.id_user
                    ? "bg-[var(--primary)]/20 border-[var(--primary)]"
                    : "bg-transparent border-transparent hover:bg-[var(--sidebar-hover)]"
                )}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Hash className={cn("w-3.5 h-3.5", selectedOffJerId === device.id_user ? "text-[var(--primary)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]")} />
                    <span className={cn(
                      "text-base md:text-sm font-bold truncate",
                      selectedOffJerId === device.id_user ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]"
                    )}>
                      {device.site_name || `מכשיר ${device.id_user}`}
                    </span>
                  </div>
                </div>
                {device.location && (
                  <span className="text-sm text-[var(--sidebar-muted)] font-mono tracking-tighter">
                    {device.location}
                  </span>
                )}
                {selectedOffJerId === device.id_user && (
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-[var(--primary)]" />
                )}
              </button>
            ))}
          </div>
        ) : isWeighing ? (
          /* ── Weighing device list ── */
          <div className="space-y-1">
            {weighingDevices.map((device) => (
              <button
                key={device.id_user}
                onClick={() => { onSelectWeighingDevice?.(device.id_user); closeOnMobile(); }}
                className={cn(
                  "w-full text-right p-3 rounded-xl border transition-all duration-200 group relative overflow-hidden",
                  selectedWeighingId === device.id_user
                    ? "bg-[var(--primary)]/20 border-[var(--primary)]"
                    : "bg-transparent border-transparent hover:bg-[var(--sidebar-hover)]"
                )}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Scale className={cn("w-3.5 h-3.5", selectedWeighingId === device.id_user ? "text-[var(--primary)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]")} />
                    <span className={cn(
                      "text-base md:text-sm font-bold truncate",
                      selectedWeighingId === device.id_user ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]"
                    )}>
                      {device.site_name || `מכשיר ${device.id_user}`}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm md:text-sm text-[var(--sidebar-muted)] font-mono uppercase tracking-tighter">#{device.id_user} · {device.unit}</span>
                </div>
                {selectedWeighingId === device.id_user && (
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-[var(--primary)]" />
                )}
              </button>
            ))}
          </div>
        ) : isOcio ? (
          /* ── Ocio device list ── */
          <div className="space-y-1">
            {ocioDevices.map((device) => (
              <button
                key={device.id_user}
                onClick={() => { onSelectOcioDevice?.(device.id_user); closeOnMobile(); }}
                className={cn(
                  "w-full text-right p-3 rounded-xl border transition-all duration-200 group relative overflow-hidden",
                  selectedOcioId === device.id_user
                    ? "bg-[var(--primary)]/20 border-[var(--primary)]"
                    : "bg-transparent border-transparent hover:bg-[var(--sidebar-hover)]"
                )}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Waves className={cn("w-3.5 h-3.5", selectedOcioId === device.id_user ? "text-[var(--primary)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]")} />
                    <span className={cn(
                      "text-base md:text-sm font-bold truncate",
                      selectedOcioId === device.id_user ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]"
                    )}>
                      {device.site_name || `מכשיר ${device.id_user}`}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm md:text-sm text-[var(--sidebar-muted)] font-mono uppercase tracking-tighter">#{device.id_user} · {device.unit}</span>
                </div>
                {selectedOcioId === device.id_user && (
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-[var(--primary)]" />
                )}
              </button>
            ))}
          </div>
        ) : isHaifa ? (
          <div className="space-y-1">
            {[
              { label: 'ניטור מיכלים', icon: Droplets, anchor: 'haifa-tank1'          },
              { label: 'אנרגיה',       icon: Zap,      anchor: 'haifa-energy'         },
              { label: 'טבלת חיישנים', icon: Table2,   anchor: 'haifa-table'          },
              { label: 'טבלת אנרגיה', icon: Zap,      anchor: 'haifa-energy-table'   },
            ].map(({ label, icon: Icon, anchor }) => (
              <button
                key={anchor}
                onClick={() => {
                  closeOnMobile();
                  setTimeout(() => {
                    document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }, 320);
                }}
                className="w-full text-right flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--sidebar-foreground)]"
              >
                <Icon className="w-4 h-4" />
                <span className="text-base md:text-sm">{label}</span>
              </button>
            ))}
          </div>
        ) : isLevel ? (
          /* ── Level device list ── */
          <div className="space-y-1">
            {levelDevices.map((device) => (
              <button
                key={device.id_user}
                onClick={() => { onSelectLevelDevice?.(device.id_user); closeOnMobile(); }}
                className={cn(
                  "w-full text-right p-3 rounded-xl border transition-all duration-200 group relative overflow-hidden",
                  selectedLevelId === device.id_user
                    ? "bg-[var(--primary)]/20 border-[var(--primary)]"
                    : "bg-transparent border-transparent hover:bg-[var(--sidebar-hover)]"
                )}
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Waves className={cn("w-3.5 h-3.5", selectedLevelId === device.id_user ? "text-[var(--primary)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]")} />
                    <span className={cn(
                      "text-base md:text-sm font-bold truncate",
                      selectedLevelId === device.id_user ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]"
                    )}>
                      {device.site_name || `מכשיר ${device.id_user}`}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm md:text-sm text-[var(--sidebar-muted)] font-mono uppercase tracking-tighter">#{device.id_user} · {device.unit}</span>
                </div>
                {selectedLevelId === device.id_user && (
                  <div className="absolute right-0 top-0 bottom-0 w-1 bg-[var(--primary)]" />
                )}
              </button>
            ))}
          </div>
        ) : (
          /* ── Energy device list ── */
          <>
            <div className="mb-4 space-y-3">
              {user.role === 'admin' && (
                <button
                  onClick={() => setShowOnlyMyDevices(!showOnlyMyDevices)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm md:text-xs font-bold transition-all duration-200 border",
                    showOnlyMyDevices
                      ? "bg-[var(--primary)]/20 border-[var(--primary)] text-[var(--primary)]"
                      : "bg-[var(--sidebar-hover)] border-[var(--sidebar-border)] text-[var(--sidebar-muted)] hover:text-[var(--sidebar-foreground)]"
                  )}
                >
                  <span>המכשירים שלי</span>
                  <div className={cn(
                    "w-8 h-4 rounded-full relative transition-colors duration-200",
                    showOnlyMyDevices ? "bg-[var(--primary)]" : "bg-[var(--sidebar-muted)]/20"
                  )}>
                    <div className={cn(
                      "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all duration-200",
                      showOnlyMyDevices ? "right-4.5" : "right-0.5"
                    )} />
                  </div>
                </button>
              )}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--sidebar-muted)]" />
                <input
                  type="text"
                  placeholder="חפש מכשיר..."
                  className="w-full bg-[var(--sidebar-hover)] border border-[var(--sidebar-border)] rounded-lg py-2.5 md:py-2 pr-10 pl-3 text-base md:text-sm focus:outline-none focus:border-[var(--primary)] transition-colors text-[var(--sidebar-foreground)]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              {filteredDevices.map((device) => (
                <button
                  key={device.id_user}
                  onClick={() => { onSelectDevice(device); closeOnMobile(); }}
                  className={cn(
                    "w-full text-right p-3 rounded-xl border transition-all duration-200 group relative overflow-hidden",
                    selectedDeviceId === device.id_user
                      ? "bg-[var(--primary)]/20 border-[var(--primary)]"
                      : "bg-transparent border-transparent hover:bg-[var(--sidebar-hover)]"
                  )}
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getDeviceStatusColor(device.id_user).bg}`} style={{ boxShadow: `0 0 8px ${getDeviceStatusColor(device.id_user).glow}` }} />
                      <span className={cn(
                        "text-base md:text-sm font-bold truncate",
                        selectedDeviceId === device.id_user ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]"
                      )}>
                        {device.site_name}
                      </span>
                    </div>
                    <Monitor className={cn("w-4 h-4", selectedDeviceId === device.id_user ? "text-[var(--sidebar-foreground)]" : "text-[var(--sidebar-muted)] group-hover:text-[var(--sidebar-foreground)]")} />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm md:text-sm text-[var(--sidebar-muted)] font-mono uppercase tracking-tighter">#{device.id_user}</span>
                    <span className="text-sm md:text-sm text-[var(--sidebar-muted)] font-medium truncate">{device.location}</span>
                  </div>
                  {selectedDeviceId === device.id_user && (
                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-[var(--primary)]" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sidebar Footer */}
      <div className="p-4 bg-[var(--sidebar-hover)] text-[10px] text-[var(--sidebar-muted)] font-mono flex justify-between items-center">
        <span>v2.0.4</span>
        <div className="flex items-center gap-2">
          <div className={cn("w-1.5 h-1.5 rounded-full", isDemoMode ? "bg-blue-500" : "bg-[var(--status-online)]")} />
          <span>{isDemoMode ? 'DEMO' : 'LIVE'}</span>
        </div>
      </div>
    </div>
  </aside>
</>
  );
};
