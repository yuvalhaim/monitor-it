import React, { useState } from 'react';
import { 
  Bell, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Settings, 
  History,
  Activity,
  Zap,
  Clock,
  Power,
  ChevronRight,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Device, AlertConfig, AlertRule, AlertHistory } from '../types';
import { cn } from '../lib/utils';

interface AlertsProps {
  devices: Device[];
  token: string | null;
  config: AlertConfig;
  history: AlertHistory[];
  onSaveConfig: (config: AlertConfig) => Promise<boolean>;
}

const FIELD_OPTIONS = [
  { value: 'vl1n', label: 'מתח L1 (V)' },
  { value: 'vl2n', label: 'מתח L2 (V)' },
  { value: 'vl3n', label: 'מתח L3 (V)' },
  { value: 'AL1', label: 'זרם L1 (A)' },
  { value: 'AL2', label: 'זרם L2 (A)' },
  { value: 'AL3', label: 'זרם L3 (A)' },
  { value: 'kwtot', label: 'הספק כולל (kW)' },
  { value: 'no-signal', label: 'ללא שידור (דקות)' },
];

export function Alerts({ devices, token, config, history, onSaveConfig }: AlertsProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState<Partial<AlertRule>>({
    active: true,
    cooldown: 30,
    operator: '>',
    field: 'vl1n'
  });

  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const energyDevices = devices.filter(d => d.Alerts);

  const handleAddRule = async () => {
    if (!newRule.deviceId || !newRule.field || (newRule.field !== 'no-signal' && !newRule.operator) || newRule.threshold === undefined) {
      setErrorMessage("נא למלא את כל שדות החובה");
      setTimeout(() => setErrorMessage(null), 3000);
      return;
    }

    const device = energyDevices.find(d => d.id_user === newRule.deviceId);
    const rule: AlertRule = {
      id: Math.random().toString(36).substr(2, 9),
      deviceId: newRule.deviceId,
      siteName: device?.site_name || 'Unknown',
      field: newRule.field as any,
      operator: newRule.field === 'no-signal' ? undefined : newRule.operator as any,
      threshold: newRule.threshold,
      cooldown: newRule.cooldown || 30,
      active: newRule.active ?? true
    };

    const newConfig = {
      ...config,
      rules: [...(config.rules || []), rule]
    };

    const success = await onSaveConfig(newConfig);
    if (success) {
      setIsAddDialogOpen(false);
      setNewRule({
        active: true,
        cooldown: 30,
        operator: '>',
        field: 'vl1n'
      });
    }
  };

  const handleDeleteRule = async (id: string) => {
    const newConfig = {
      ...config,
      rules: config.rules.filter(r => r.id !== id)
    };
    await onSaveConfig(newConfig);
    setRuleToDelete(null);
  };

  const handleToggleRule = async (id: string) => {
    const newConfig = {
      ...config,
      rules: config.rules.map(r => r.id === id ? { ...r, active: !r.active } : r)
    };
    await onSaveConfig(newConfig);
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--accent)]/10 rounded-xl">
              <Bell className="w-6 h-6 text-[var(--accent)]" />
            </div>
            <h1 className="text-xl md:text-3xl font-black text-[var(--text-primary)] tracking-tight uppercase">מערכת התראות</h1>
          </div>
          <p className="text-[var(--text-secondary)] text-sm font-medium">ניהול חוקי התראה וצפייה בהיסטוריית אירועים</p>
        </div>

        <button 
          onClick={() => setIsAddDialogOpen(true)}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-[var(--accent)] hover:bg-[var(--accent)]/80 text-white font-black rounded-xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-[var(--accent)]/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          הוסף חוק חדש
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
        {/* Rules List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-4 h-4 text-[var(--text-secondary)]" />
            <h2 className="text-base font-black text-[var(--text-secondary)] uppercase tracking-widest">חוקים פעילים</h2>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <AnimatePresence mode="popLayout">
              {config.rules.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass-card p-12 flex flex-col items-center justify-center text-center space-y-4 border-dashed"
                >
                  <div className="p-4 bg-white/5 rounded-full">
                    <Bell className="w-8 h-8 text-[var(--text-secondary)] opacity-20" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[var(--text-primary)] font-bold">אין חוקי התראה מוגדרים</p>
                    <p className="text-[var(--text-secondary)] text-xs">לחץ על "הוסף חוק חדש" כדי להתחיל</p>
                  </div>
                </motion.div>
              ) : (
                config.rules.map((rule) => (
                  <motion.div
                    key={rule.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={cn(
                      "glass-card p-5 group transition-all duration-300",
                      !rule.active && "opacity-60 grayscale"
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "p-3 rounded-xl transition-colors",
                          rule.active ? "bg-[var(--accent)]/10 text-[var(--accent)]" : "bg-white/5 text-[var(--text-secondary)]"
                        )}>
                          {rule.field === 'no-signal' ? <Power className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-bold text-[var(--text-primary)]">{rule.siteName}</h3>
                          <div className="flex items-center gap-3 text-xs font-black uppercase tracking-wider text-[var(--text-secondary)]">
                            <span className="flex items-center gap-1">
                              <Zap className="w-3 h-3" />
                              {FIELD_OPTIONS.find(f => f.value === rule.field)?.label}
                            </span>
                            <span className="text-[var(--border)]">|</span>
                            <span>
                              {rule.field === 'no-signal' ? `> ${rule.threshold} דקות` : `${rule.operator} ${rule.threshold}`}
                            </span>
                            <span className="text-[var(--border)]">|</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {rule.cooldown} דק'
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleRule(rule.id)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all",
                            rule.active 
                              ? "bg-[var(--secondary-accent)]/20 text-[var(--secondary-accent)] hover:bg-[var(--secondary-accent)]/30" 
                              : "bg-white/5 text-[var(--text-secondary)] hover:bg-white/10"
                          )}
                        >
                          {rule.active ? 'פעיל' : 'כבוי'}
                        </button>
                        <button
                          onClick={() => setRuleToDelete(rule.id)}
                          className="p-2 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* History Sidebar */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-[var(--text-secondary)]" />
            <h2 className="text-base font-black text-[var(--text-secondary)] uppercase tracking-widest">היסטוריית התראות</h2>
          </div>

          <div className="glass-card overflow-hidden flex flex-col max-h-[600px]">
            <div className="p-4 border-b border-[var(--border)] bg-white/5 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">50 אירועים אחרונים</span>
              <Activity className="w-3 h-3 text-[var(--accent)]" />
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
              {history.length === 0 ? (
                <div className="p-8 text-center space-y-2 opacity-30">
                  <Clock className="w-8 h-8 mx-auto" />
                  <p className="text-xs font-bold uppercase tracking-widest">אין היסטוריה</p>
                </div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl bg-white/5 border border-white/5 hover:border-[var(--border)] transition-all space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--text-secondary)]">
                        {new Date(item.timestamp).toLocaleString('he-IL')}
                      </span>
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-black uppercase tracking-tighter",
                        item.status === 'sent' ? "bg-[var(--secondary-accent)]/20 text-[var(--secondary-accent)]" : "bg-red-500/20 text-red-500"
                      )}>
                        {item.status === 'sent' ? 'נשלח' : 'נכשל'}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-[var(--text-primary)]">{item.siteName}</p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        {FIELD_OPTIONS.find(f => f.value === item.field)?.label}: <span className="text-[var(--accent)] font-mono">{item.value}</span>
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add Rule Dialog */}
      <AnimatePresence>
        {isAddDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card w-full max-w-lg overflow-hidden shadow-2xl border-[var(--accent)]/20"
            >
              <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--accent)]/5">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-[var(--accent)]" />
                  <h3 className="text-lg font-black text-[var(--text-primary)] tracking-tight uppercase">הוספת חוק התראה</h3>
                </div>
                <button 
                  onClick={() => setIsAddDialogOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-all"
                >
                  <X className="w-5 h-5 text-[var(--text-secondary)]" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {errorMessage && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold text-center animate-in fade-in slide-in-from-top-2">
                    {errorMessage}
                  </div>
                )}
                {/* Device Selection */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]">
                    בחר מכשיר
                  </label>
                  <select 
                    className="w-full bg-black/40 border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)]/50 outline-none transition-all text-sm appearance-none cursor-pointer"
                    value={newRule.deviceId || ''}
                    onChange={e => setNewRule({...newRule, deviceId: parseInt(e.target.value)})}
                  >
                    <option value="" disabled>בחר מכשיר...</option>
                    {energyDevices.map(d => (
                      <option key={d.id_user} value={d.id_user}>{d.site_name} (#{d.id_user})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Field Selection */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]">
                      שדה לניטור
                    </label>
                    <select 
                      className="w-full bg-black/40 border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)]/50 outline-none transition-all text-sm appearance-none cursor-pointer"
                      value={newRule.field || ''}
                      onChange={e => setNewRule({...newRule, field: e.target.value as any})}
                    >
                      {FIELD_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Operator Selection */}
                  <div className={cn("space-y-2", newRule.field === 'no-signal' && "opacity-30 pointer-events-none")}>
                    <label className="flex items-center gap-2 text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]">
                      אופרטור
                    </label>
                    <select 
                      className="w-full bg-black/40 border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)]/50 outline-none transition-all text-sm appearance-none cursor-pointer"
                      value={newRule.operator || '>'}
                      onChange={e => setNewRule({...newRule, operator: e.target.value as any})}
                    >
                      <option value=">">גדול מ- (&gt;)</option>
                      <option value="<">קטן מ- (&lt;)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Threshold */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]">
                      ערך סף
                    </label>
                    <input 
                      type="number"
                      className="w-full bg-black/40 border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)]/50 outline-none transition-all font-mono text-sm"
                      value={newRule.threshold ?? ''}
                      onChange={e => setNewRule({...newRule, threshold: parseFloat(e.target.value)})}
                      placeholder="0"
                    />
                  </div>

                  {/* Cooldown */}
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-black text-[var(--text-secondary)] uppercase tracking-[0.2em]">
                      זמן השהייה (דקות)
                    </label>
                    <input 
                      type="number"
                      className="w-full bg-black/40 border border-[var(--border)] rounded-xl px-4 py-3 text-[var(--text-primary)] focus:border-[var(--accent)]/50 outline-none transition-all font-mono text-sm"
                      value={newRule.cooldown ?? 30}
                      onChange={e => setNewRule({...newRule, cooldown: parseInt(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/5">
                  <input 
                    type="checkbox"
                    id="rule-active"
                    className="w-4 h-4 rounded border-[var(--border)] bg-black/40 text-[var(--accent)] focus:ring-[var(--accent)]"
                    checked={newRule.active ?? true}
                    onChange={e => setNewRule({...newRule, active: e.target.checked})}
                  />
                  <label htmlFor="rule-active" className="text-xs font-bold text-[var(--text-primary)] cursor-pointer">
                    חוק פעיל
                  </label>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    onClick={() => setIsAddDialogOpen(false)}
                    className="flex-1 px-6 py-3 bg-white/5 hover:bg-white/10 text-[var(--text-primary)] font-black rounded-xl border border-[var(--border)] transition-all uppercase tracking-widest text-xs"
                  >
                    ביטול
                  </button>
                  <button 
                    onClick={handleAddRule}
                    className="flex-1 px-6 py-3 bg-[var(--accent)] hover:bg-[var(--accent)]/80 text-white font-black rounded-xl transition-all uppercase tracking-widest text-xs shadow-lg shadow-[var(--accent)]/20"
                  >
                    שמור חוק
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <AnimatePresence>
        {ruleToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="glass-card w-full max-w-sm overflow-hidden shadow-2xl border-red-500/20"
            >
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                  <Trash2 className="w-6 h-6 text-red-500" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-[var(--text-primary)]">מחיקת חוק</h3>
                  <p className="text-sm text-[var(--text-secondary)]">האם אתה בטוח שברצונך למחוק את חוק ההתראה? פעולה זו אינה ניתנת לביטול.</p>
                </div>
                <div className="flex gap-3 pt-2">
                  <button 
                    onClick={() => setRuleToDelete(null)}
                    className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 text-[var(--text-primary)] font-bold rounded-xl border border-[var(--border)] transition-all text-xs"
                  >
                    ביטול
                  </button>
                  <button 
                    onClick={() => handleDeleteRule(ruleToDelete)}
                    className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all text-xs shadow-lg shadow-red-500/20"
                  >
                    מחק חוק
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
