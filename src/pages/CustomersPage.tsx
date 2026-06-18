import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Building2, Plus, Pencil, Trash2, X, Check, Loader2, Search, AlertTriangle, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cn } from "../lib/utils";

interface Customer {
  id_user: number;
  user_name: string;
  email: string;
  site_name: string;
  location: string;
  contact_name: string;
  mobile_phone: string;
  date_exp: string;
  Alerts: boolean;
  application: string;
  role: string;
  cast_num: number | null;
  unit: string | null;
  min: number | null;
  max: number | null;
  alert_low: number | null;
  alert_high: number | null;
  widget_type: string | null;
  Display_Graph: boolean;
  device_id: number | null;
  pub_topic: string | null;
  sub_topic: string | null;
  mqtt_client_id: number | null;
}

const EMPTY_FORM: Omit<Customer, 'id_user'> & { id_user: number | ''; password: string } = {
  id_user: '',
  user_name: '',
  email: '',
  site_name: '',
  location: '',
  contact_name: '',
  mobile_phone: '',
  date_exp: '',
  Alerts: false,
  application: 'Energy',
  role: 'user',
  cast_num: null,
  password: '',
  unit: null,
  min: null,
  max: null,
  alert_low: null,
  alert_high: null,
  widget_type: null,
  Display_Graph: false,
  device_id: null,
  pub_topic: null,
  sub_topic: null,
  mqtt_client_id: null,
};

interface CustomersPageProps {
  token: string | null;
}

export function CustomersPage({ token }: CustomersPageProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeApp, setActiveApp] = useState('all');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<keyof Customer>('id_user');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (key: keyof Customer) => {
    if (sortKey === key) setSortDir((d: 'asc' | 'desc') => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  // Modal state
  const [modalMode, setModalMode] = useState<'add' | 'edit' | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);


  const fetchCustomers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/customers/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch customers');
      const raw = await res.json();
      // deduplicate by id_user — keep first occurrence
      const seen = new Set();
      const deduped = raw.filter((c: Customer) => {
        if (c.id_user == null || !seen.has(c.id_user)) {
          seen.add(c.id_user);
          return true;
        }
        return false;
      });
      setCustomers(deduped);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, [token]);

  // MQTT next available ID
  const _mqttIds = customers.filter(c => c.mqtt_client_id != null).map(c => c.mqtt_client_id as number);
  const nextMqttId = _mqttIds.length > 0 ? Math.min(..._mqttIds) - 1 : 990;

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const openAdd = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setModalMode('add');
  };

  const openEdit = (c: Customer) => {
    setFormData({
      id_user: c.id_user ?? '',
      user_name: c.user_name || '',
      email: c.email || '',
      site_name: c.site_name || '',
      location: c.location || '',
      contact_name: c.contact_name || '',
      mobile_phone: c.mobile_phone || '',
      date_exp: c.date_exp ? c.date_exp.slice(0, 10) : '',
      Alerts: c.Alerts,
      application: ({
        energy: 'Energy', Energy: 'Energy',
        weighing: 'Weighing', Weighing: 'Weighing', wighing: 'Weighing',
        level: 'Level', Level: 'Level',
        level_psks: 'Level_PsKs', Level_PsKs: 'Level_PsKs',
        temperature: 'Temperature', Temperature: 'Temperature',
        custom: 'Custom', Custom: 'Custom', custum: 'Custom',
        ocio: 'Ocio', Ocio: 'Ocio',
        offjer: 'OffJer', OffJer: 'OffJer', Offjer: 'OffJer',
      } as Record<string, string>)[c.application] ?? 'Energy',
      role: (c.role === 'admin' || c.role === 'מנהל') ? 'admin' : 'user',
      cast_num: c.cast_num,
      password: '',
      unit: c.unit ?? null,
      min: c.min ?? null,
      max: c.max ?? null,
      alert_low: c.alert_low ?? null,
      alert_high: c.alert_high ?? null,
      widget_type: c.widget_type ?? null,
      Display_Graph: c.Display_Graph === true || Number(c.Display_Graph) === 1,
      device_id: c.device_id ?? null,
      pub_topic: c.pub_topic ?? null,
      sub_topic: c.sub_topic ?? null,
      mqtt_client_id: c.mqtt_client_id ?? null,
    });
    setEditingId(c.id_user);
    setModalMode('edit');
  };

  const closeModal = () => { setModalMode(null); setError(null); setFormErrors({}); };

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    // id_user: required in edit mode; optional in add (auto-generated if blank)
    if (formData.id_user !== '') {
      const n = Number(formData.id_user);
      if (!Number.isInteger(n) || n <= 0) errs.id_user = 'מזהה חייב להיות מספר שלם חיובי';
    } else if (modalMode === 'edit') {
      errs.id_user = 'מזהה מכשיר הוא שדה חובה בעריכה';
    }

    const name = formData.user_name.trim();
    if (!name) errs.user_name = 'שדה חובה';
    else if (name.length < 2) errs.user_name = 'לפחות 2 תווים';
    else if (name.length > 100) errs.user_name = 'מקסימום 100 תווים';

    if (modalMode === 'add') {
      if (!formData.password) errs.password = 'סיסמה היא שדה חובה בהוספת לקוח';
      else if (formData.password.length < 6) errs.password = 'לפחות 6 תווים';
      else if (formData.password.length > 128) errs.password = 'מקסימום 128 תווים';
    } else if (formData.password) {
      if (formData.password.length < 6) errs.password = 'לפחות 6 תווים';
      else if (formData.password.length > 128) errs.password = 'מקסימום 128 תווים';
    }

    if (formData.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) errs.email = 'כתובת אימייל לא תקינה';
      else if (formData.email.length > 200) errs.email = 'מקסימום 200 תווים';
    }

    if (formData.mobile_phone && formData.mobile_phone.trim().length > 20)
      errs.mobile_phone = 'מקסימום 20 תווים';

    if (formData.site_name && formData.site_name.trim().length > 200)
      errs.site_name = 'מקסימום 200 תווים';

    if (formData.location && formData.location.trim().length > 200)
      errs.location = 'מקסימום 200 תווים';

    if (formData.contact_name && formData.contact_name.trim().length > 100)
      errs.contact_name = 'מקסימום 100 תווים';

    const validApps = ['Energy', 'Weighing', 'Temperature', 'Custom', 'Ocio', 'Level', 'Level_PsKs', 'OffJer'];
    if (!validApps.includes(formData.application)) errs.application = 'ערך יישום לא חוקי';

    const validRoles = ['user', 'admin'];
    if (!validRoles.includes(formData.role)) errs.role = 'ערך הרשאה לא חוקי';

    if (formData.cast_num !== null && formData.cast_num !== undefined) {
      if (!Number.isInteger(Number(formData.cast_num)) || Number(formData.cast_num) < 0)
        errs.cast_num = 'חייב להיות מספר שלם חיובי';
    }

    return errs;
  };

  const handleSave = async () => {
    if (!token || savingRef.current) return;
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }
    setFormErrors({});
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const url = modalMode === 'add' ? '/api/customers' : `/api/customers/${editingId}`;
      const method = modalMode === 'add' ? 'POST' : 'PUT';
      const body: any = { ...formData };
      if (body.id_user === '') delete body.id_user; // blank on add = server auto-generates
      if (!body.password) delete body.password; // don't send empty password on edit
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      showSuccess(modalMode === 'add' ? 'לקוח נוסף בהצלחה' : 'לקוח עודכן בהצלחה');
      closeModal();
      fetchCustomers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${deleteTarget.id_user}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');
      showSuccess(`לקוח "${deleteTarget.site_name || deleteTarget.user_name}" נמחק`);
      setDeleteTarget(null);
      fetchCustomers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Derive unique app values for filter tabs
  const appValues = ['all', ...Array.from(new Set(customers.map(c => c.application?.trim()).filter(Boolean))).sort()];

  const filtered = customers
    .filter((c: Customer) => {
      const matchesApp = activeApp === 'all' || c.application?.trim() === activeApp;
      const matchesSearch = [c.user_name, c.email, c.site_name, c.contact_name, c.application]
        .some(v => v?.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesApp && matchesSearch;
    })
    .sort((a: Customer, b: Customer) => {
      const k = sortKey as keyof Customer;
      const av = a[k] ?? '';
      const bv = b[k] ?? '';
      const cmp = String(av).localeCompare(String(bv), 'he', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });

  return (
    <div className="p-4 md:p-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="text-primary w-8 h-8" />
            ניהול לקוחות
          </h1>
          <p className="text-muted-foreground">הוספה, עריכה ומחיקה של לקוחות במערכת</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full md:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
            <input
              type="text"
              placeholder="חיפוש לקוח..."
              className="w-full bg-[var(--card)] border border-[var(--border)] rounded-xl py-2 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 transition-all text-sm"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={fetchCustomers}
            disabled={loading}
            title="רענן"
            className="p-2 bg-[var(--card)] border border-[var(--border)] rounded-xl hover:bg-[var(--border)] transition-all"
          >
            <RefreshCw className={cn("w-4 h-4 text-[var(--muted)]", loading && "animate-spin")} />
          </button>
          {lastRefresh && (
            <span className="text-xs text-[var(--muted)] font-mono hidden md:inline">
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-xl hover:opacity-90 transition-all font-medium whitespace-nowrap text-sm"
          >
            <Plus className="w-4 h-4" />
            לקוח חדש
          </button>
        </div>
      </div>

      {/* Application filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {appValues.map(app => (
          <button
            key={app}
            onClick={() => setActiveApp(app)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
              activeApp === app
                ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                : "bg-[var(--card)] border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            )}
          >
            {app === 'all' ? `הכל (${customers.length})` : `${app} (${customers.filter((c: Customer) => c.application?.trim() === app).length})`}
          </button>
        ))}
      </div>

      {/* MQTT next-ID badge */}
      <div className="flex items-center gap-2 text-sm font-mono">
        <span className="text-[var(--muted)]">MQTT Client IDs — הבא:</span>
        <span className="bg-[var(--card)] border border-[var(--border)] text-[var(--primary)] font-bold px-3 py-0.5 rounded-lg">{nextMqttId}</span>
      </div>

      {/* Success */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-status-online/10 border border-status-online text-status-online px-4 py-3 rounded-xl flex items-center gap-2"
          >
            <Check className="w-5 h-5" />{successMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && !modalMode && (
        <div className="bg-status-offline/10 border border-status-offline text-status-offline px-4 py-3 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><X className="w-5 h-5" />{error}</div>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Table */}
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse" style={{fontSize:11}}>
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--background)]">
                {([
                  { key: 'id_user',        label: 'מזהה #',    w: 44 },
                  { key: 'cast_num',       label: 'Cast #',    w: 44 },
                  { key: 'device_id',      label: 'Dev ID',    w: 44 },
                  { key: 'user_name',      label: 'משתמש' },
                  { key: 'site_name',      label: 'אתר' },
                  { key: 'contact_name',   label: 'איש קשר' },
                  { key: 'email',          label: 'אימייל' },
                  { key: 'application',    label: 'יישום' },
                  { key: 'date_exp',       label: 'תפוגה' },
                  { key: 'mqtt_client_id', label: 'MQTT',      w: 50 },
                  { key: 'pub_topic',      label: 'Pub Topic' },
                  { key: 'sub_topic',      label: 'Sub Topic' },
                ] as { key: keyof Customer; label: string; w?: number }[]).map(col => (
                  <th key={col.key} className="px-1.5 py-1 font-semibold whitespace-nowrap" style={col.w ? { width: col.w, minWidth: col.w } : {}}>
                    <button
                      onClick={() => toggleSort(col.key)}
                      className="flex items-center gap-0.5 font-semibold hover:text-[var(--primary)] transition-colors w-full justify-end"
                    >
                      {col.label}
                      {sortKey === col.key
                        ? sortDir === 'asc'
                          ? <ChevronUp className="w-3 h-3 text-[var(--primary)]" />
                          : <ChevronDown className="w-3 h-3 text-[var(--primary)]" />
                        : <ChevronsUpDown className="w-3 h-3 opacity-30" />}
                    </button>
                  </th>
                ))}
                <th className="px-1.5 py-1 font-semibold text-left whitespace-nowrap">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr><td colSpan={13} className="px-4 py-12 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                  <p className="mt-2 text-muted-foreground">טוען לקוחות...</p>
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">לא נמצאו לקוחות</td></tr>
              ) : filtered.map(c => (
                <tr key={c.id_user ?? `null-${c.user_name}`} className="hover:bg-muted/5 transition-colors">
                  <td className="py-1 text-muted-foreground text-center" style={{ width: 44, minWidth: 44 }}>
                    {c.id_user ?? <span className="text-red-400 font-mono">!</span>}
                  </td>
                  <td className="py-1 font-mono text-center" style={{ width: 44, minWidth: 44 }}>
                    {c.cast_num ?? <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-1 font-mono text-center" style={{ width: 44, minWidth: 44 }}>
                    {c.device_id != null ? c.device_id : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-1.5 py-1 font-medium max-w-[80px]"><span className="block truncate" title={c.user_name}>{c.user_name}</span></td>
                  <td className="px-1.5 py-1 max-w-[90px]"><span className="block truncate" title={c.site_name}>{c.site_name}</span></td>
                  <td className="px-1.5 py-1 text-muted-foreground max-w-[70px]"><span className="block truncate" title={c.contact_name ?? ''}>{c.contact_name}</span></td>
                  <td className="px-1.5 py-1 text-muted-foreground max-w-[100px]"><span className="block truncate" title={c.email ?? ''}>{c.email}</span></td>
                  <td className="px-1.5 py-1">
                    <span className={cn(
                      "px-1.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap",
                      c.application === 'Energy'      ? "bg-yellow-500/10 text-yellow-500" :
                      c.application === 'Level'       ? "bg-cyan-500/10 text-cyan-400" :
                      c.application === 'Weighing'    ? "bg-blue-500/10 text-blue-400" :
                      c.application === 'Ocio'        ? "bg-purple-500/10 text-purple-400" :
                      c.application === 'Temperature' ? "bg-red-500/10 text-red-400" :
                      c.application === 'Custom'      ? "bg-green-500/10 text-green-400" :
                      c.application === 'OffJer'      ? "bg-sky-500/10 text-sky-400" :
                      "bg-muted/20 text-muted-foreground"
                    )}>{c.application}</span>
                  </td>
                  <td className="px-1.5 py-1 text-muted-foreground whitespace-nowrap">{c.date_exp ? c.date_exp.slice(0, 10) : '—'}</td>
                  <td className="py-1 font-mono text-center" style={{ width: 50, minWidth: 50 }}>
                    {c.mqtt_client_id != null
                      ? <span className="text-[var(--primary)] font-bold">{c.mqtt_client_id}</span>
                      : <span className="text-muted-foreground opacity-40">—</span>}
                  </td>
                  <td className="px-1.5 py-1 font-mono max-w-[90px]">
                    {c.pub_topic
                      ? <span title={c.pub_topic} className="block truncate text-[var(--muted)]">{c.pub_topic}</span>
                      : <span className="text-muted-foreground opacity-40">—</span>}
                  </td>
                  <td className="px-1.5 py-1 font-mono max-w-[90px]">
                    {c.sub_topic
                      ? <span title={c.sub_topic} className="block truncate text-[var(--muted)]">{c.sub_topic}</span>
                      : <span className="text-muted-foreground opacity-40">—</span>}
                  </td>
                  <td className="px-1.5 py-1">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(c)}
                        disabled={!c.id_user}
                        className={cn("p-1 rounded-lg transition-colors", c.id_user ? "hover:bg-primary/10 text-[var(--primary)]" : "opacity-30 cursor-not-allowed text-[var(--muted)]")}
                        title={c.id_user ? "עריכה" : "לא ניתן לערוך — אין מזהה (id_user=null)"}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => c.id_user && setDeleteTarget(c)}
                        disabled={!c.id_user}
                        className={cn("p-1 rounded-lg transition-colors", c.id_user ? "hover:bg-red-500/10 text-[var(--status-offline)]" : "opacity-30 cursor-not-allowed text-[var(--muted)]")}
                        title={c.id_user ? "מחיקה" : "לא ניתן למחוק — אין מזהה (id_user=null)"}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {modalMode && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
                <h2 className="text-lg font-bold">{modalMode === 'add' ? 'הוספת לקוח חדש' : 'עריכת לקוח'}</h2>
                <button onClick={closeModal} className="p-2 hover:bg-muted/10 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {error && (
                  <div className="bg-status-offline/10 border border-status-offline text-status-offline px-4 py-3 rounded-xl text-sm flex items-center gap-2">
                    <X className="w-4 h-4 shrink-0" />{error}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="cast_num (לקוח #)" error={formErrors.cast_num}>
                    <input
                      type="number"
                      min={0}
                      className={formErrors.cast_num ? inputErrCls : inputCls}
                      value={formData.cast_num ?? ''}
                      onWheel={e => e.currentTarget.blur()}
                      onChange={e => { setFormData(p => ({ ...p, cast_num: e.target.value ? parseInt(e.target.value) : null })); setFormErrors(p => ({ ...p, cast_num: '' })); }}
                    />
                  </Field>
                  <Field label="שם משתמש" required error={formErrors.user_name}>
                    <input
                      className={formErrors.user_name ? inputErrCls : inputCls}
                      value={formData.user_name}
                      maxLength={100}
                      onChange={e => { setFormData(p => ({ ...p, user_name: e.target.value })); setFormErrors(p => ({ ...p, user_name: '' })); }}
                    />
                  </Field>
                  <Field label={modalMode === 'add' ? 'סיסמה' : 'סיסמה חדשה (ריק = ללא שינוי)'} required={modalMode === 'add'} error={formErrors.password}>
                    <input
                      type="password"
                      autoComplete="new-password"
                      className={formErrors.password ? inputErrCls : inputCls}
                      value={formData.password}
                      maxLength={128}
                      onChange={e => { setFormData(p => ({ ...p, password: e.target.value })); setFormErrors(p => ({ ...p, password: '' })); }}
                    />
                  </Field>
                  <Field label="שם אתר" error={formErrors.site_name}>
                    <input
                      className={formErrors.site_name ? inputErrCls : inputCls}
                      value={formData.site_name}
                      maxLength={200}
                      onChange={e => { setFormData(p => ({ ...p, site_name: e.target.value })); setFormErrors(p => ({ ...p, site_name: '' })); }}
                    />
                  </Field>
                  <Field label="מיקום" error={formErrors.location}>
                    <input
                      className={formErrors.location ? inputErrCls : inputCls}
                      value={formData.location}
                      maxLength={200}
                      onChange={e => { setFormData(p => ({ ...p, location: e.target.value })); setFormErrors(p => ({ ...p, location: '' })); }}
                    />
                  </Field>
                  <Field label="איש קשר" error={formErrors.contact_name}>
                    <input
                      className={formErrors.contact_name ? inputErrCls : inputCls}
                      value={formData.contact_name}
                      maxLength={100}
                      onChange={e => { setFormData(p => ({ ...p, contact_name: e.target.value })); setFormErrors(p => ({ ...p, contact_name: '' })); }}
                    />
                  </Field>
                  <Field label="טלפון" error={formErrors.mobile_phone}>
                    <input
                      className={formErrors.mobile_phone ? inputErrCls : inputCls}
                      value={formData.mobile_phone}
                      maxLength={20}
                      onChange={e => { setFormData(p => ({ ...p, mobile_phone: e.target.value })); setFormErrors(p => ({ ...p, mobile_phone: '' })); }}
                    />
                  </Field>
                  <Field label="אימייל" error={formErrors.email}>
                    <input
                      type="email"
                      className={formErrors.email ? inputErrCls : inputCls}
                      value={formData.email}
                      maxLength={200}
                      onChange={e => { setFormData(p => ({ ...p, email: e.target.value })); setFormErrors(p => ({ ...p, email: '' })); }}
                    />
                  </Field>
                  <Field label="תאריך תפוגה" error={formErrors.date_exp}>
                    <input
                      type="date"
                      className={formErrors.date_exp ? inputErrCls : inputCls}
                      value={formData.date_exp}
                      onChange={e => { setFormData(p => ({ ...p, date_exp: e.target.value })); setFormErrors(p => ({ ...p, date_exp: '' })); }}
                    />
                  </Field>
                  <Field label="יישום" error={formErrors.application}>
                    <select
                      className={formErrors.application ? inputErrCls : inputCls}
                      value={formData.application}
                      onChange={e => { setFormData(p => ({ ...p, application: e.target.value })); setFormErrors(p => ({ ...p, application: '' })); }}
                    >
                      <option value="Energy">Energy</option>
                      <option value="Weighing">Weighing</option>
                      <option value="Level">Level</option>
                      <option value="Level_PsKs">Level_PsKs</option>
                      <option value="Temperature">Temperature</option>
                      <option value="Custom">Custom</option>
                      <option value="Ocio">Ocio</option>
                      <option value="OffJer">OffJer</option>
                    </select>
                  </Field>
                  <Field label="הרשאה" error={formErrors.role}>
                    <select
                      className={formErrors.role ? inputErrCls : inputCls}
                      value={formData.role}
                      onChange={e => { setFormData(p => ({ ...p, role: e.target.value })); setFormErrors(p => ({ ...p, role: '' })); }}
                    >
                      <option value="user">משתמש</option>
                      <option value="admin">מנהל</option>
                    </select>
                  </Field>
                  <Field
                    label={modalMode === 'add' ? 'מזהה משתמש (ID) — ריק = אוטומטי' : 'מזהה משתמש (ID)'}
                    required={modalMode === 'edit'}
                    error={formErrors.id_user}
                  >
                    <input
                      type="number"
                      min={1}
                      className={formErrors.id_user ? inputErrCls : inputCls}
                      value={formData.id_user}
                      placeholder={modalMode === 'add' ? 'ייווצר אוטומטית אם ריק' : ''}
                      onWheel={e => e.currentTarget.blur()}
                      onChange={e => { setFormData(p => ({ ...p, id_user: e.target.value ? parseInt(e.target.value) : '' })); setFormErrors(p => ({ ...p, id_user: '' })); }}
                    />
                  </Field>
                  <Field label="מזהה חומרה (Device ID)" error={formErrors.device_id}>
                    <input
                      type="number"
                      min={1}
                      className={inputCls}
                      value={formData.device_id ?? ''}
                      placeholder="ברירת מחדל: מזהה משתמש"
                      onWheel={e => e.currentTarget.blur()}
                      onChange={e => setFormData(p => ({ ...p, device_id: e.target.value ? parseInt(e.target.value) : null }))}
                    />
                  </Field>
                  <Field label="MQTT Client ID">
                    <input
                      type="number"
                      className={inputCls}
                      value={formData.mqtt_client_id ?? ''}
                      placeholder={`הבא: ${nextMqttId}`}
                      onWheel={e => e.currentTarget.blur()}
                      onChange={e => setFormData(p => ({ ...p, mqtt_client_id: e.target.value ? parseInt(e.target.value) : null }))}
                    />
                  </Field>
                  <Field label="Pub Topic (MQTT)">
                    <input
                      className={inputCls}
                      placeholder="galoz/device/pub"
                      value={formData.pub_topic ?? ''}
                      maxLength={200}
                      onChange={e => setFormData(p => ({ ...p, pub_topic: e.target.value || null }))}
                    />
                  </Field>
                  <Field label="Sub Topic (MQTT)">
                    <input
                      className={inputCls}
                      placeholder="galoz/device/sub"
                      value={formData.sub_topic ?? ''}
                      maxLength={200}
                      onChange={e => setFormData(p => ({ ...p, sub_topic: e.target.value || null }))}
                    />
                  </Field>
                  <Field label="התראות">
                    <label className="flex items-center gap-2 cursor-pointer pt-1">
                      <input type="checkbox" checked={formData.Alerts} onChange={e => setFormData(p => ({ ...p, Alerts: e.target.checked }))} className="w-4 h-4 accent-primary" />
                      <span className="text-sm">פעיל</span>
                    </label>
                  </Field>
                </div>

                {/* Energy: max current setting */}
                {formData.application === 'Energy' && (
                  <div className="border-t border-[var(--border)] pt-4">
                    <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-widest mb-3">הגדרות אנרגיה</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Field label="זרם מקסימלי — A (max current)">
                        <input
                          type="number"
                          className={inputCls}
                          placeholder="לדוגמה: 65"
                          value={formData.max ?? ''}
                          onWheel={e => e.currentTarget.blur()}
                          onChange={e => setFormData(p => ({ ...p, max: e.target.value !== '' ? parseFloat(e.target.value) : null }))}
                        />
                      </Field>
                    </div>
                  </div>
                )}

                {/* Sensor config — only for non-energy applications */}
                {formData.application !== 'Energy' && (
                  <>
                    <div className="border-t border-[var(--border)] pt-4">
                      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-widest mb-3">הגדרות חיישן</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="יחידה (unit)">
                          <input
                            className={inputCls}
                            placeholder="kg, %, bar, °C…"
                            value={formData.unit ?? ''}
                            maxLength={20}
                            onChange={e => setFormData(p => ({ ...p, unit: e.target.value || null }))}
                          />
                        </Field>
                        <Field label="סוג ווידג'ט">
                          <select
                            className={inputCls}
                            value={formData.widget_type ?? ''}
                            onChange={e => setFormData(p => ({ ...p, widget_type: e.target.value || null }))}
                          >
                            <option value="">בחר…</option>
                            <option value="gauge">gauge</option>
                            <option value="tank">tank</option>
                            <option value="silo">silo</option>
                          </select>
                        </Field>
                        <Field label="מינימום (min)">
                          <input
                            type="number"
                            className={inputCls}
                            value={formData.min ?? ''}
                            onChange={e => setFormData(p => ({ ...p, min: e.target.value !== '' ? parseFloat(e.target.value) : null }))}
                          />
                        </Field>
                        <Field label="מקסימום (max)">
                          <input
                            type="number"
                            className={inputCls}
                            value={formData.max ?? ''}
                            onChange={e => setFormData(p => ({ ...p, max: e.target.value !== '' ? parseFloat(e.target.value) : null }))}
                          />
                        </Field>
                        <Field label="התראה נמוכה (alert_low)">
                          <input
                            type="number"
                            className={inputCls}
                            value={formData.alert_low ?? ''}
                            onChange={e => setFormData(p => ({ ...p, alert_low: e.target.value !== '' ? parseFloat(e.target.value) : null }))}
                          />
                        </Field>
                        <Field label="התראה גבוהה (alert_high)">
                          <input
                            type="number"
                            className={inputCls}
                            value={formData.alert_high ?? ''}
                            onChange={e => setFormData(p => ({ ...p, alert_high: e.target.value !== '' ? parseFloat(e.target.value) : null }))}
                          />
                        </Field>
                        <Field label="הצג גרף (Display_Graph)">
                          <label className="flex items-center gap-2 cursor-pointer pt-1">
                            <input
                              type="checkbox"
                              checked={formData.Display_Graph}
                              onChange={e => setFormData(p => ({ ...p, Display_Graph: e.target.checked }))}
                              className="w-4 h-4 accent-primary"
                            />
                            <span className="text-sm">פעיל</span>
                          </label>
                        </Field>
                      </div>
                    </div>
                  </>
                )}

              </div>

              <div className="flex justify-end gap-3 p-6 border-t border-[var(--border)]">
                <button onClick={closeModal} className="px-4 py-2 bg-muted/10 text-muted-foreground rounded-xl hover:bg-muted/20 transition-all">
                  ביטול
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || (modalMode === 'add' && !formData.password)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {modalMode === 'add' ? 'הוסף' : 'שמור'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4"
            >
              <div className="flex items-center gap-3 text-status-offline">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <h2 className="text-lg font-bold">מחיקת לקוח</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                האם למחוק את הלקוח <strong>{deleteTarget.site_name || deleteTarget.user_name}</strong>?
                פעולה זו אינה ניתנת לביטול.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 bg-muted/10 text-muted-foreground rounded-xl hover:bg-muted/20 transition-all">
                  ביטול
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex items-center gap-2 px-4 py-2 bg-status-offline text-white rounded-xl hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  מחק
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const inputCls = "w-full bg-[var(--background)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/50 transition-all";
const inputErrCls = "w-full bg-[var(--background)] border border-red-400 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/40 transition-all";

function Field({ label, children, required, error }: { label: string; children: React.ReactNode; required?: boolean; error?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-red-400 mr-1">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}
    </div>
  );
}
