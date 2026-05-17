import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Users, Key, Shield, Check, X, Loader2, Search } from "lucide-react";
import { User } from "../types";
import { cn } from "../lib/utils";

interface UsersPageProps {
  token: string | null;
}

export function UsersPage({ token }: UsersPageProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [resettingPassword, setResettingPassword] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [changingRole, setChangingRole] = useState<{ userName: string, currentRole: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch users");
      const data = await res.json();
      setUsers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleResetPassword = async (userName: string) => {
    if (!newPassword || !adminPassword || !token) return;
    setActionLoading(`password-${userName}`);
    try {
      const res = await fetch("/api/users/reset-password", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          user_name: userName, 
          new_password: newPassword,
          admin_password: adminPassword
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to reset password");
      
      setSuccessMessage(`הסיסמה עבור ${userName} עודכנה בהצלחה`);
      setResettingPassword(null);
      setNewPassword("");
      setAdminPassword("");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
      setAdminPassword(""); // Clear on error too
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleRole = async (userName: string, currentRole: string) => {
    if (!adminPassword || !token) return;
    const newRole = currentRole === "admin" ? "user" : "admin";
    setActionLoading(`role-${userName}`);
    try {
      const res = await fetch("/api/users/role", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          user_name: userName, 
          role: newRole,
          admin_password: adminPassword
        }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to update role");
      
      setUsers(users.map(u => u.user_name === userName ? { ...u, role: newRole as any } : u));
      setSuccessMessage(`ההרשאה עבור ${userName} עודכנה ל-${newRole === 'admin' ? 'מנהל' : 'משתמש'}`);
      setChangingRole(null);
      setAdminPassword("");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.message);
      setAdminPassword("");
    } finally {
      setActionLoading(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-4 md:p-8 space-y-6" dir="rtl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="text-primary w-8 h-8" />
            ניהול משתמשים
          </h1>
          <p className="text-muted-foreground">ניהול סיסמאות והרשאות גישה למערכת</p>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="חיפוש משתמש..."
            className="w-full bg-card border border-border rounded-xl py-2 pr-10 pl-4 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-status-online/10 border border-status-online text-status-online px-4 py-3 rounded-xl flex items-center gap-2"
        >
          <Check className="w-5 h-5" />
          {successMessage}
        </motion.div>
      )}

      {error && (
        <div className="bg-status-offline/10 border border-status-offline text-status-offline px-4 py-3 rounded-xl flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <X className="w-5 h-5" />
            {error}
          </div>
          <button onClick={() => setError(null)} className="hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-muted/5 border-b border-border">
                <th className="px-6 py-4 font-semibold">שם משתמש</th>
                <th className="px-6 py-4 font-semibold">אימייל</th>
                <th className="px-6 py-4 font-semibold text-center">לקוח #</th>
                <th className="px-6 py-4 font-semibold text-center">תפוגה</th>
                <th className="px-6 py-4 font-semibold text-center">הרשאה</th>
                <th className="px-6 py-4 font-semibold text-left">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
                    <p className="mt-2 text-muted-foreground">טוען משתמשים...</p>
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                    לא נמצאו משתמשים
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.user_name} className="hover:bg-muted/5 transition-colors">
                    <td className="px-6 py-4 font-medium">{user.user_name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{user.email || '---'}</td>
                    <td className="px-6 py-4 text-center font-mono text-sm">{user.cast_num ?? '—'}</td>
                    <td className="px-6 py-4 text-center text-sm text-muted-foreground">
                      {user.date_exp ? new Date(user.date_exp).toLocaleDateString('he-IL') : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        {changingRole?.userName === user.user_name ? (
                          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                            <input
                              type="password"
                              placeholder="סיסמת מנהל"
                              className="bg-background border border-border rounded-lg px-3 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary/50 w-28"
                              value={adminPassword}
                              onChange={(e) => setAdminPassword(e.target.value)}
                              autoFocus
                            />
                            <button
                              onClick={() => handleToggleRole(user.user_name, user.role)}
                              disabled={!adminPassword || actionLoading === `role-${user.user_name}`}
                              className="p-1 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                            >
                              {actionLoading === `role-${user.user_name}` ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Check className="w-3 h-3" />
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setChangingRole(null);
                                setAdminPassword("");
                              }}
                              className="p-1 bg-muted/10 text-muted-foreground rounded-lg hover:bg-muted/20"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setChangingRole({ userName: user.user_name, currentRole: user.role })}
                            disabled={actionLoading === `role-${user.user_name}`}
                            className={cn(
                              "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold transition-all",
                              user.role === 'admin' 
                                ? "bg-primary/10 text-primary border border-primary/20" 
                                : "bg-muted/10 text-muted-foreground border border-border",
                              actionLoading === `role-${user.user_name}` && "opacity-50 cursor-not-allowed"
                            )}
                          >
                            {actionLoading === `role-${user.user_name}` ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Shield className="w-3 h-3" />
                            )}
                            {user.role === 'admin' ? 'מנהל' : 'משתמש'}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {resettingPassword === user.user_name ? (
                          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-left-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="password"
                                placeholder="סיסמה חדשה"
                                className="bg-background border border-border rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-32"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoFocus
                              />
                              <input
                                type="password"
                                placeholder="סיסמת מנהל"
                                className="bg-background border border-border rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 w-32"
                                value={adminPassword}
                                onChange={(e) => setAdminPassword(e.target.value)}
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleResetPassword(user.user_name)}
                                disabled={!newPassword || !adminPassword || actionLoading === `password-${user.user_name}`}
                                className="flex items-center gap-2 px-3 py-1 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 text-xs"
                              >
                                {actionLoading === `password-${user.user_name}` ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4" />
                                )}
                                אשר איפוס
                              </button>
                              <button
                                onClick={() => {
                                  setResettingPassword(null);
                                  setNewPassword("");
                                  setAdminPassword("");
                                }}
                                className="p-1.5 bg-muted/10 text-muted-foreground rounded-lg hover:bg-muted/20"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setResettingPassword(user.user_name)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-xl transition-all"
                          >
                            <Key className="w-4 h-4" />
                            איפוס סיסמה
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
