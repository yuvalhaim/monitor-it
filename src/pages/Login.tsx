import React, { useState } from 'react';
import { Radio, AlertCircle, RefreshCw, Zap, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User, token: string) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

export function Login({ onLogin, isDarkMode, toggleTheme }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDark = isDarkMode;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        onLogin(data.user, data.token);
      } else {
        setError(data.message || 'התחברות נכשלה');
      }
    } catch (err) {
      setError('שגיאת תקשורת עם השרת');
    } finally {
      setLoading(false);
    }
  };

  const t = {
    bg:              isDark ? '#0b1628'                          : '#b8d4e8',
    gridColor:       isDark ? 'rgba(0,180,216,0.07)'            : 'rgba(0,130,180,0.1)',
    cardBg:          isDark
      ? 'linear-gradient(155deg, rgba(20,36,62,0.98) 0%, rgba(14,26,48,0.99) 100%)'
      : 'linear-gradient(155deg, rgba(210,230,245,0.97) 0%, rgba(190,218,238,0.98) 100%)',
    cardBorder:      isDark ? 'rgba(0,212,255,0.2)'             : 'rgba(0,160,210,0.3)',
    cardShadow:      isDark
      ? '0 30px 70px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,212,255,0.06), inset 0 1px 0 rgba(0,212,255,0.1)'
      : '0 30px 70px rgba(0,80,160,0.1), 0 0 0 1px rgba(0,160,210,0.1), inset 0 1px 0 rgba(0,160,210,0.15)',
    accentLine:      isDark
      ? 'linear-gradient(90deg, transparent, #00b4d8, transparent)'
      : 'linear-gradient(90deg, transparent, #0096c7, transparent)',
    brandTag:        isDark ? 'rgba(0,212,255,0.7)'             : 'rgba(0,140,185,0.85)',
    title:           isDark ? '#eef9ff'                          : '#0d1e38',
    titleGlow:       isDark ? '0 0 50px rgba(0,180,216,0.25)'   : 'none',
    subtitle:        isDark ? 'rgba(148,163,184,0.7)'           : 'rgba(30,60,100,0.55)',
    dividerLine:     isDark ? 'rgba(0,212,255,0.18)'            : 'rgba(0,150,200,0.2)',
    dividerText:     isDark ? '#64748b'                          : '#7a9ab8',
    labelColor:      isDark ? 'rgba(0,212,255,0.9)'             : 'rgba(0,120,170,0.95)',
    inputBg:         '#ffffff',
    inputBgFocus:    '#ffffff',
    inputBorder:     isDark ? 'rgba(0,212,255,0.22)'            : 'rgba(0,150,200,0.3)',
    inputBorderFocus:isDark ? 'rgba(0,212,255,0.6)'             : 'rgba(0,150,200,0.7)',
    inputColor:      '#0f1e35',
    inputPlaceholder:'rgba(100,130,160,0.55)',
    logoIconColor:   isDark ? '#00d4ff'                          : '#0090c0',
    logoBg:          isDark
      ? 'linear-gradient(135deg, rgba(0,180,216,0.14), rgba(0,100,160,0.08))'
      : 'linear-gradient(135deg, rgba(0,160,210,0.12), rgba(0,100,180,0.06))',
    logoBorder:      isDark ? 'rgba(0,212,255,0.28)'            : 'rgba(0,160,210,0.35)',
    versionText:     isDark ? '#94a3b8'                          : '#6b8aaa',
    toggleBg:        isDark ? 'rgba(255,255,255,0.07)'          : 'rgba(0,80,160,0.08)',
    toggleBorder:    isDark ? 'rgba(255,255,255,0.12)'          : 'rgba(0,120,180,0.2)',
    toggleColor:     isDark ? '#94a3b8'                          : '#4a7090',
    orb1:            isDark ? 'rgba(0,160,200,0.12)'            : 'rgba(0,160,220,0.07)',
    orb1Opacity:     isDark ? [0.5, 0.75, 0.5]  as number[]     : [0.4, 0.6, 0.4] as number[],
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Heebo:wght@400;500;600;700&display=swap');

        .login-root   { font-family: 'Space Grotesk', sans-serif; }
        .login-mono   { font-family: 'JetBrains Mono', monospace; }
        .login-hebrew { font-family: 'Heebo', sans-serif; }

        .login-bg-grid {
          background-image:
            linear-gradient(var(--grid-color) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
          background-size: 48px 48px;
        }

        .login-scanlines {
          background: repeating-linear-gradient(
            0deg, transparent, transparent 3px,
            rgba(0,0,0,0.02) 3px, rgba(0,0,0,0.02) 4px
          );
          pointer-events: none;
        }

        .login-input {
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          color: var(--input-color);
          font-family: 'JetBrains Mono', monospace;
          font-size: 16px;
          border-radius: 4px;
          transition: all 0.25s ease;
          width: 100%;
        }
        .login-input:focus {
          background: var(--input-bg-focus);
          border-color: var(--input-border-focus);
          box-shadow: 0 0 0 3px rgba(0,180,216,0.1);
          outline: none;
        }
        .login-input::placeholder { color: var(--input-placeholder); font-family: 'JetBrains Mono', monospace; }

        .login-btn {
          background: linear-gradient(135deg, #00b4d8 0%, #0077a8 100%);
          font-family: 'Heebo', sans-serif;
          font-size: 17px;
          position: relative; overflow: hidden;
          border-radius: 4px; transition: all 0.3s ease;
          color: #02080f;
        }
        .login-btn::before {
          content: ''; position: absolute; top:0; left:-100%;
          width:100%; height:100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
          transition: left 0.6s ease;
        }
        .login-btn:hover::before { left: 100%; }
        .login-btn:hover {
          background: linear-gradient(135deg, #00d4ff 0%, #008fc8 100%);
          box-shadow: 0 0 28px rgba(0,180,216,0.45), 0 4px 20px rgba(0,0,0,0.3);
          transform: translateY(-1px);
        }
        .login-btn:active  { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .login-theme-toggle {
          background: var(--toggle-bg);
          border: 1px solid var(--toggle-border);
          color: var(--toggle-color);
          border-radius: 8px;
          padding: 6px 8px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex; align-items: center; justify-content: center;
        }
        .login-theme-toggle:hover { opacity: 0.75; }

        @keyframes logoPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(0,180,216,0.4), 0 0 20px rgba(0,180,216,0.15); }
          50%      { box-shadow: 0 0 0 10px rgba(0,180,216,0), 0 0 40px rgba(0,180,216,0.25); }
        }
        .logo-pulse { animation: logoPulse 3.5s ease-in-out infinite; }

        @keyframes statusBlink {
          0%,100% { opacity:1; } 50% { opacity:0.3; }
        }
        .status-blink { animation: statusBlink 2s ease-in-out infinite; }
      `}</style>

      <div
        className="login-root min-h-screen flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-500"
        style={{
          background: t.bg,
          '--grid-color': t.gridColor,
          '--input-bg': t.inputBg,
          '--input-bg-focus': t.inputBgFocus,
          '--input-border': t.inputBorder,
          '--input-border-focus': t.inputBorderFocus,
          '--input-color': t.inputColor,
          '--input-placeholder': t.inputPlaceholder,
          '--toggle-bg': t.toggleBg,
          '--toggle-border': t.toggleBorder,
          '--toggle-color': t.toggleColor,
        } as React.CSSProperties}
        dir="rtl"
      >
        {/* Scanlines */}
        <div className="absolute inset-0 login-scanlines" />

        {/* Glow orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            animate={{ scale: [1, 1.15, 1], opacity: t.orb1Opacity }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', width: 700, height: 700,
              top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              background: `radial-gradient(circle, ${t.orb1} 0%, transparent 68%)`,
              filter: 'blur(40px)'
            }}
          />
          <motion.div
            animate={{ x: [0,25,0], y: [0,-18,0], opacity: [0.12,0.22,0.12] }}
            transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', width: 320, height: 320,
              top: '15%', right: '10%',
              background: `radial-gradient(circle, ${isDark ? 'rgba(0,100,200,0.18)' : 'rgba(0,100,200,0.08)'} 0%, transparent 70%)`,
              filter: 'blur(60px)'
            }}
          />
          <motion.div
            animate={{ x: [0,-18,0], y: [0,25,0], opacity: [0.08,0.18,0.08] }}
            transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
            style={{
              position: 'absolute', width: 260, height: 260,
              bottom: '15%', left: '8%',
              background: `radial-gradient(circle, ${isDark ? 'rgba(0,220,255,0.12)' : 'rgba(0,180,240,0.07)'} 0%, transparent 70%)`,
              filter: 'blur(50px)'
            }}
          />
        </div>

        {/* Top-left: system status */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.5 }}
          className="absolute top-5 left-5 flex items-center gap-2 login-mono"
        >
          <div className="status-blink w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 6px #34d399' }} />
          <span className="text-xs text-emerald-500/80 tracking-[0.25em] uppercase">System Online</span>
        </motion.div>

        {/* Top-right: theme toggle + version */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.3, duration: 0.5 }}
          className="absolute top-5 right-5 flex items-center gap-3"
        >
          <button
            onClick={toggleTheme}
            className="login-theme-toggle"
            title={isDark ? 'מעבר למצב בהיר' : 'מעבר למצב כהה'}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isDark ? (
                <motion.span key="sun" initial={{ rotate: -30, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 30, opacity: 0 }} transition={{ duration: 0.2 }}>
                  <Sun className="w-4 h-4" />
                </motion.span>
              ) : (
                <motion.span key="moon" initial={{ rotate: 30, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -30, opacity: 0 }} transition={{ duration: 0.2 }}>
                  <Moon className="w-4 h-4" />
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <span className="login-mono text-xs tracking-[0.25em] uppercase" style={{ color: t.versionText }}>v2.0.4</span>
        </motion.div>

        {/* Main card */}
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[420px] relative"
        >
          <div
            className="relative"
            style={{
              background: t.cardBg,
              border: `1px solid ${t.cardBorder}`,
              borderRadius: '20px',
              boxShadow: t.cardShadow,
              transition: 'background 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease'
            }}
          >
            {/* Top accent line */}
            <div className="h-px w-full" style={{ background: t.accentLine }} />

            <div className="px-5 pt-7 pb-6 md:px-9 md:pt-9 md:pb-8">

              {/* Logo + brand */}
              <motion.div className="flex flex-col items-center mb-9" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.6 }}>
                <motion.div
                  initial={{ scale: 0.65, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.35, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  className="logo-pulse relative w-16 h-16 flex items-center justify-center mb-5"
                  style={{ background: t.logoBg, border: `1px solid ${t.logoBorder}`, borderRadius: '10px' }}
                >
                  <Radio className="w-7 h-7" style={{ color: t.logoIconColor }} />
                  <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t border-r border-cyan-400/50" style={{ borderRadius: '0 8px 0 0' }} />
                  <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b border-l border-cyan-400/50" style={{ borderRadius: '0 0 0 8px' }} />
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48, duration: 0.5 }} className="text-center">
                  <h1 className="text-[2.6rem] font-bold tracking-tight leading-none" style={{ color: t.title, textShadow: t.titleGlow }}>
                    Monitor It
                  </h1>
                  <div className="login-mono text-sm mt-1.5 tracking-wider" style={{ color: t.subtitle }}>
                    Real-time IoT monitoring dashboard
                  </div>
                </motion.div>
              </motion.div>

              {/* Divider */}
              <motion.div
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.55 }}
                className="flex items-center gap-3 mb-7"
                style={{ transformOrigin: 'center' }}
              >
                <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, transparent, ${t.dividerLine})` }} />
                <span className="login-mono text-xs tracking-[0.35em] uppercase" style={{ color: t.dividerText }}>Access Terminal</span>
                <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${t.dividerLine}, transparent)` }} />
              </motion.div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-5">

                {/* Email */}
                <motion.div initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.68, duration: 0.48 }} className="space-y-1.5">
                  <label className="login-hebrew block text-sm font-semibold tracking-wide pr-0.5" style={{ color: t.labelColor }}>
                    אימייל / שם משתמש
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="login-input px-4 py-3"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="שם משתמש / אימייל"
                  />
                </motion.div>

                {/* Password */}
                <motion.div initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.76, duration: 0.48 }} className="space-y-1.5">
                  <label className="login-hebrew block text-sm font-semibold tracking-wide pr-0.5" style={{ color: t.labelColor }}>
                    סיסמה
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="login-input px-4 py-3"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </motion.div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.98 }}
                      className="flex items-center gap-2 px-3 py-2.5 rounded login-hebrew text-sm"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}
                    >
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{error}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.86, duration: 0.48 }} className="pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="login-btn w-full py-4 font-bold flex items-center justify-center gap-2"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    {loading ? 'מתחבר...' : 'כניסה למערכת'}
                  </button>
                </motion.div>
              </form>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
