import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import sql from "mssql";
import dotenv from "dotenv";
import fs from "fs";
import nodemailer from "nodemailer";
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import logger from './logger';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3001");
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'galoz-energy-monitor-dev-fallback' : null);
if (!JWT_SECRET) {
  console.error("FATAL: JWT_SECRET environment variable is not set. Server cannot start.");
  process.exit(1);
}

app.set('trust proxy', 1);

// Internal Logging
const log = (msg: string) => {
  const line = `${new Date().toISOString()} ${msg}\n`;
  try {
    fs.appendFileSync('app.log', line);
  } catch (err) {
    console.error("Failed to write to log file:", err);
  }
};

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Increased from 100 to 2000 to accommodate dashboard polling
  message: { error: 'יותר מדי בקשות, נסה שוב מאוחר יותר' }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true, // only failed attempts count toward the limit
  message: { error: 'יותר מדי ניסיונות התחברות, נסה שוב בעוד 15 דקות' }
});

// Layer 1: burst protection — max 200 requests per minute per USER
// Max legitimate: ~20 devices × 2 polls/min = 40 req/min — 200 gives 5x headroom
const energyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  keyGenerator: (req: any, res: any) => req.user?.id_user?.toString() || ipKeyGenerator(req, res),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: any, res: any) => {
    logger.warn("Energy burst limit exceeded", { ip: req.ip, user: req.user?.email, user_id: req.user?.id_user });
    res.status(429).json({ error: 'יותר מדי שאילתות, נסה שוב בעוד דקה' });
  }
});

// Layer 2: sustained attack protection — max 3000 requests per hour per USER
// Max legitimate: 200 req/min × 60 min = 12000/hr — 3000 gives safe sustained cap
const energySustainedLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3000,
  keyGenerator: (req: any, res: any) => req.user?.id_user?.toString() || ipKeyGenerator(req, res),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: any, res: any) => {
    logger.warn("Energy sustained limit exceeded", { ip: req.ip, user: req.user?.email, user_id: req.user?.id_user });
    res.status(429).json({ error: 'חריגה ממגבלת שאילתות שעתית, נסה שוב מאוחר יותר' });
  }
});

const adminActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // only 5 attempts per 15 minutes per IP
  message: { error: 'יותר מדי ניסיונות, נסה שוב מאוחר יותר' },
  handler: (req: any, res: any) => {
    logger.warn("Admin action rate limit exceeded", { ip: req.ip, user: req.user?.user_name, path: req.path });
    res.status(429).json({ success: false, message: 'יותר מדי ניסיונות, נסה שוב מאוחר יותר' });
  }
});

app.use(cors());
app.use(express.json());

// Apply general rate limit to all /api/ routes
app.use('/api/', limiter);

// JWT Middleware
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    log(`AUTH FAILED: Invalid token from ${req.ip}`);
    return res.status(403).json({ error: "Forbidden" });
  }
};

const authorizeAdmin = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: "גישת מנהל בלבד" });
  }
  next();
};

const ALERTS_CONFIG_PATH = path.join(process.cwd(), "alerts-config.json");
const ALERTS_HISTORY_PATH = path.join(process.cwd(), "alerts-history.json");

// Default SQL Configuration
let sqlConfig: any = {
  server: process.env.SQL_SERVER || "127.0.0.1",
  port: parseInt(process.env.SQL_PORT || "1433"),
  database: process.env.SQL_DATABASE || "Energy",
  customersDatabase: process.env.SQL_CUSTOMERS_DATABASE || "Galoziot",
  user: process.env.SQL_USER || "",
  password: process.env.SQL_PASSWORD || "",
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  },
  connectionTimeout: 60000, // Increased to 60s
  requestTimeout: 60000,    // Increased to 60s
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    useUTC: false,
    trustedConnection: false
  }
};

// Demo Mode State
let isDemoMode = false; // Default to false as requested by user
let isDebugMode = true; // Default to true for development

// Load config from environment variables
const hasEnvConfig = !!(process.env.SQL_SERVER && process.env.SQL_USER && process.env.SQL_PASSWORD);

if (hasEnvConfig) {
  // If env vars are present, skip Demo Mode
  isDemoMode = false;
  console.log("SQL environment variables detected, skipping Demo Mode.");
} else {
  // Default to Demo Mode if no environment variables (first run in preview)
  isDemoMode = true;
  console.log("No environment variables found, defaulting to Demo Mode");
}

// Alerts Configuration
let alertsConfig = {
  smtp: {
    recipients: ""
  },
  rules: [] as any[]
};

if (fs.existsSync(ALERTS_CONFIG_PATH)) {
  try {
    const content = fs.readFileSync(ALERTS_CONFIG_PATH, "utf-8").trim();
    if (content) {
      alertsConfig = JSON.parse(content);
    }
  } catch (err) {
    console.error("Failed to load alerts config:", err);
  }
}

let alertsHistory: any[] = [];
if (fs.existsSync(ALERTS_HISTORY_PATH)) {
  try {
    const content = fs.readFileSync(ALERTS_HISTORY_PATH, "utf-8").trim();
    if (content) {
      alertsHistory = JSON.parse(content);
    }
  } catch (err) {
    console.error("Failed to load alerts history:", err);
  }
}

// Global connection pool state
let globalPool: sql.ConnectionPool | null = null;
let currentPoolConfig: string = "";
let connectionPromise: Promise<sql.ConnectionPool> | null = null;

// Helper to get SQL connection with retry logic
async function getPool(config = sqlConfig, retries = 5, delay = 3000) {
  if (isDemoMode) {
    throw new Error("Demo Mode is enabled. SQL connection skipped.");
  }

  const configStr = JSON.stringify(config);
  
  // Reuse existing pool if it's connected and config hasn't changed
    if (globalPool && globalPool.connected && configStr === currentPoolConfig) {
    try {
      // Quick ping to verify connection is actually alive
      // Use a shorter timeout for the ping
      await globalPool.request().query('SELECT 1');
      return globalPool;
    } catch (e) {
      logger.warn("SQL reconnecting...");
      try { await globalPool.close(); } catch (closeErr) {}
      globalPool = null;
    }
  }

  // If a connection is already in progress, wait for it
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    // Close old pool if it exists
    if (globalPool) {
      try {
        await globalPool.close();
      } catch (e) {
        console.warn("Error closing old pool:", e);
      }
      globalPool = null;
    }

    let lastError: any = null;
    for (let i = 0; i < retries; i++) {
      try {
        const finalConfig: any = { ...config };
        
        // If user is provided, disable trustedConnection
        if (finalConfig.user && finalConfig.user !== "") {
          finalConfig.options = { ...finalConfig.options, trustedConnection: false };
          console.log(`Using SQL Authentication for user: ${finalConfig.user}`);
        } else {
          finalConfig.options = { ...finalConfig.options, trustedConnection: true };
          console.log("Using Windows Authentication (Trusted Connection)");
        }
        
        // Fallback for localhost
        if (finalConfig.server === 'localhost') {
          finalConfig.server = '127.0.0.1';
          console.log("Replacing 'localhost' with '127.0.0.1' for better compatibility.");
        }

        console.log(`Attempting to connect to SQL Server (Attempt ${i + 1}/${retries}): ${finalConfig.server}:${finalConfig.port}, Database: ${finalConfig.database}`);
        
        const pool = new sql.ConnectionPool(finalConfig);
        
        // Add error listener to the pool to handle unexpected disconnections
        pool.on('error', err => {
          console.error('SQL Pool Error:', err.message);
          if (globalPool === pool) {
            console.log("Global pool encountered an error, clearing it to force reconnect.");
            globalPool = null;
          }
        });

        // Handle pool closure
        pool.on('close', () => {
          console.log('SQL Pool closed');
          if (globalPool === pool) {
            globalPool = null;
          }
        });

        await pool.connect();
        globalPool = pool;
        currentPoolConfig = configStr;
        logger.info("SQL Connected successfully.");
        connectionPromise = null;
        return globalPool;
      } catch (err: any) {
        lastError = err;
        logger.error("SQL connection failed", { error: err.message });
        
        if (i < retries - 1) {
          logger.warn(`Retrying SQL connection in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    connectionPromise = null;
    throw lastError || new Error("Failed to connect to SQL after multiple attempts");
  })();

  // Add a safety timeout to the connection promise to prevent it from hanging indefinitely
  const timeoutPromise = new Promise<never>((_, reject) => 
    setTimeout(() => {
      if (connectionPromise) {
        console.warn("SQL Connection attempt timed out after 60 seconds, clearing promise.");
        connectionPromise = null;
      }
      reject(new Error("SQL Connection attempt timed out after 60 seconds"));
    }, 60000)
  );

  return Promise.race([connectionPromise, timeoutPromise]);
}

// Robust query runner with automatic retry on connection failure
async function runQuery(query: string, inputs: { name: string, type: any, value: any }[] = []) {
  if (isDemoMode) return { recordset: [] };
  
  let pool;
  try {
    pool = await getPool();
    
    // Double check if pool is actually connected
    if (!pool || !pool.connected) {
      console.warn("Pool retrieved but not connected, forcing reconnect...");
      globalPool = null;
      pool = await getPool();
    }

    const request = pool.request();
    inputs.forEach(input => request.input(input.name, input.type, input.value));
    return await request.query(query);
  } catch (err: any) {
    // If it's a connection error, clear the pool and try one more time
    const isConnErr = err.code === 'ECONNRESET' || err.code === 'ETIMEOUT' || 
                      err.message.toLowerCase().includes('connection') || 
                      err.message.toLowerCase().includes('network') ||
                      err.message.toLowerCase().includes('closed');
                      
    if (isConnErr) {
      console.warn("Query failed due to connection issue, retrying once with new pool...");
      if (globalPool) {
        try { await globalPool.close(); } catch (e) {}
        globalPool = null;
      }
      
      try {
        pool = await getPool();
        const request = pool.request();
        inputs.forEach(input => request.input(input.name, input.type, input.value));
        return await request.query(query);
      } catch (retryErr) {
        console.error("Retry query failed:", retryErr);
        throw retryErr;
      }
    }
    
    console.error("SQL Query Error:", err.message);
    throw err;
  }
}

// Helper to get fully qualified table name
function getTableName(table: string, type: 'energy' | 'customers') {
  const dbName = type === 'energy' ? sqlConfig.database : (sqlConfig.customersDatabase || sqlConfig.database);
  
  // Use full path [database].[schema].[table] to support cross-database queries
  const fullName = `[${dbName}].[dbo].[${table}]`;
  
  return fullName;
}

// Alert Checker Logic
async function checkAlerts() {
  if (isDemoMode) return;
  if (!alertsConfig.rules || alertsConfig.rules.length === 0) return;
  if (!process.env.SMTP_FROM || !process.env.SMTP_PASSWORD) return;

  console.log("Checking alerts...");
  
  try {
    const activeRules = alertsConfig.rules.filter((r: any) => r.active);
    
    for (const rule of activeRules) {
      // Check cooldown
      if (rule.lastTriggered) {
        const lastTriggered = new Date(rule.lastTriggered);
        const now = new Date();
        const diffMinutes = (now.getTime() - lastTriggered.getTime()) / 60000;
        if (diffMinutes < (rule.cooldown || 30)) {
          continue;
        }
      }

      let triggered = false;
      let currentValue: any = null;
      let alertMessage = "";

      if (rule.field === 'no-signal') {
        const result = await runQuery(
          `SELECT TOP 1 ts_getway FROM ${getTableName('Energy', 'energy')} WHERE Device_ID = @id ORDER BY ts_getway DESC`,
          [{ name: "id", type: sql.Int, value: rule.deviceId }]
        );
        
        if (result.recordset.length > 0) {
          const lastSeen = new Date(result.recordset[0].ts_getway);
          const now = new Date();
          const diffMinutes = (now.getTime() - lastSeen.getTime()) / 60000;
          if (diffMinutes > rule.threshold) {
            triggered = true;
            currentValue = `Last seen ${diffMinutes.toFixed(0)} mins ago`;
            alertMessage = `מכשיר ${rule.siteName} (#${rule.deviceId}) איבד תקשורת. זמן ללא שידור: ${diffMinutes.toFixed(0)} דקות.`;
          }
        } else {
          triggered = true;
          currentValue = "Never seen";
          alertMessage = `מכשיר ${rule.siteName} (#${rule.deviceId}) מעולם לא שידר נתונים.`;
        }
      } else {
        const allowedFields = ['vl1n', 'vl2n', 'vl3n', 'AL1', 'AL2', 'AL3', 'kwtot', 'rssi'];
        if (!allowedFields.includes(rule.field)) {
          log(`SECURITY ALERT: Invalid alert field attempt: ${rule.field}`);
          continue;
        }
        const result = await runQuery(
          `SELECT TOP 1 ${rule.field} FROM ${getTableName('Energy', 'energy')} WHERE Device_ID = @id ORDER BY ts_getway DESC`,
          [{ name: "id", type: sql.Int, value: rule.deviceId }]
        );
        
        if (result.recordset.length > 0) {
          const val = result.recordset[0][rule.field];
          currentValue = val;
          if (rule.operator === '>') {
            if (val > rule.threshold) triggered = true;
          } else if (rule.operator === '<') {
            if (val < rule.threshold) triggered = true;
          }
          
          if (triggered) {
            alertMessage = `התראה עבור מכשיר ${rule.siteName} (#${rule.deviceId}): שדה ${rule.field} בערך ${val} (סף: ${rule.operator}${rule.threshold})`;
          }
        }
      }

      if (triggered) {
        console.log(`Alert triggered for rule ${rule.id}: ${alertMessage}`);
        const success = await sendAlertEmail(alertMessage);
        
        // Update rule lastTriggered
        rule.lastTriggered = new Date().toISOString();
        fs.writeFileSync(ALERTS_CONFIG_PATH, JSON.stringify(alertsConfig, null, 2));

        // Add to history
        const historyEntry = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          deviceId: rule.deviceId,
          siteName: rule.siteName,
          field: rule.field,
          value: currentValue?.toString() || "N/A",
          status: success ? 'sent' : 'failed'
        };
        alertsHistory.unshift(historyEntry);
        if (alertsHistory.length > 50) alertsHistory = alertsHistory.slice(0, 50);
        fs.writeFileSync(ALERTS_HISTORY_PATH, JSON.stringify(alertsHistory, null, 2));
      }
    }
  } catch (err) {
    console.error("Error in checkAlerts:", err);
  }
}

async function sendAlertEmail(message: string, subject = "Energy Monitor Alert") {
  if (!process.env.SMTP_FROM || !process.env.SMTP_PASSWORD || !alertsConfig.smtp.recipients) {
    console.error("SMTP configuration incomplete");
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_FROM,
      pass: process.env.SMTP_PASSWORD
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    }
  });

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: alertsConfig.smtp.recipients,
      subject: subject,
      text: message,
      html: `<div dir="rtl">${message}</div>`
    });
    console.log("Alert email sent successfully");
    return true;
  } catch (err) {
    console.error("Failed to send alert email:", err);
    return false;
  }
}

// Run alert checker every 5 minutes
setInterval(checkAlerts, 5 * 60 * 1000);

app.get("/api/customers/emails", authenticateToken, async (req, res) => {
  if (isDemoMode) {
    const emails = Array.from(new Set(DEMO_DEVICES.map(d => d.email)));
    return res.json(emails);
  }
  try {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT DISTINCT CAST(email AS VARCHAR(255)) AS email 
      FROM ${getTableName('Custumer', 'customers')} 
      WHERE application = 'energy' AND email IS NOT NULL AND email != ''
    `);
    res.json(result.recordset.map(r => r.email));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch customer emails" });
  }
});

// API Endpoints for Configuration
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await runQuery(
      `SELECT TOP 1 id_user, CAST(user_name AS NVARCHAR(MAX)) AS user_name, CAST(email AS VARCHAR(255)) AS email, password, RTRIM(role) AS role
       FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @login OR CAST(email AS VARCHAR(255)) = @login`,
      [{ name: 'login', type: sql.NVarChar, value: email }]
    );

    const user = result.recordset[0];

    const pwdMatch = user && user.password ? bcrypt.compareSync(password, user.password) : false;
    if (user && user.password && pwdMatch) {
      logger.info("Login successful", { user_name: user.user_name, ip: req.ip });
      const tokenPayload = { id_user: user.id_user, user_name: user.user_name, email: user.email, role: user.role };
      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });
      res.json({ success: true, user: tokenPayload, token });
    } else {
      logger.warn("Login failed", { email, ip: req.ip, user_found: !!user, pwd_in_db: !!(user?.password), pwd_len_submitted: password?.length ?? 0, pwd_match: pwdMatch });
      res.status(401).json({ success: false, message: "שגיאת התחברות" });
    }
  } catch (err: any) {
    logger.error("Login error", { error: err.message, ip: req.ip });
    res.status(500).json({ success: false, message: "שגיאת שרת" });
  }
});

app.post("/api/auth/logout", authenticateToken, (req: any, res) => {
  logger.info("Logout", { user_name: req.user?.user_name, ip: req.ip });
  res.json({ success: true });
});

app.get("/api/alerts/config", authenticateToken, (req, res) => {
  res.json(alertsConfig);
});

app.post("/api/alerts/config", authenticateToken, authorizeAdmin, (req, res) => {
  const { smtp, rules } = req.body;
  // Strip sensitive info before saving
  const { from, password, ...safeSmtp } = smtp || {};
  alertsConfig = { smtp: safeSmtp, rules: rules || [] };
  fs.writeFileSync(ALERTS_CONFIG_PATH, JSON.stringify(alertsConfig, null, 2));
  res.json({ success: true });
});

app.get("/api/alerts/history", authenticateToken, (req, res) => {
  res.json(alertsHistory);
});

app.post("/api/alerts/test", authenticateToken, async (req, res) => {
  const { from, password, recipients } = req.body;
  
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.office365.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: from,
      pass: password
    },
    tls: {
      ciphers: 'SSLv3',
      rejectUnauthorized: false
    }
  });

  try {
    await transporter.sendMail({
      from: from,
      to: recipients,
      subject: "Test Email from Energy Monitor",
      text: "This is a test email to verify your SMTP settings.",
      html: '<div dir="rtl">זוהי הודעת בדיקה ממערכת ניטור האנרגיה.</div>'
    });
    res.json({ success: true, message: "הודעת בדיקה נשלחה בהצלחה!" });
  } catch (err: any) {
    console.error("Test email failed:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Demo Data based on real values provided
let DEMO_DEVICES = [
  { id_user: 15, site_name: "ראשי - פאנל 15", location: "קומה 1", contact_name: "משה", mobile_phone: "050-1234567", email: "moshe@example.com", user_name: "moshe", date_exp: "2026-01-01", Alerts: true },
  { id_user: 13, site_name: "מזגן מרכזי", location: "גג", contact_name: "דוד", mobile_phone: "052-7654321", email: "david@example.com", user_name: "david", date_exp: "2026-01-01", Alerts: true },
  { id_user: 12, site_name: "תאורת חוץ", location: "חצר", contact_name: "יוסי", mobile_phone: "054-1112223", email: "yossi@example.com", user_name: "yossi", date_exp: "2026-01-01", Alerts: false },
  { id_user: 11, site_name: "מכונת ייצור א'", location: "אולם א'", contact_name: "שרה", mobile_phone: "053-4445556", email: "sarah@example.com", user_name: "sarah", date_exp: "2026-01-01", Alerts: true },
  { id_user: 10, site_name: "משרדים", location: "קומה 2", contact_name: "רחל", mobile_phone: "058-9998887", email: "rachel@example.com", user_name: "rachel", date_exp: "2026-01-01", Alerts: false },
  { id_user: 555, site_name: "מכשיר בדיקה", location: "מעבדה", contact_name: "בדיקה", mobile_phone: "000-0000000", email: "test@example.com", user_name: "test", date_exp: "2026-01-01", Alerts: true },
  { id_user: 2, site_name: "מכשיר גיבוי", location: "מחסן", contact_name: "גיבוי", mobile_phone: "111-1111111", email: "backup@example.com", user_name: "backup", date_exp: "2026-01-01", Alerts: false }
];

const DEMO_RECORDS = [
  { Device_ID: 15, type: 331, fv: 623, rssi: -57, vl1n: 232.1, vl2n: 231.1, vl3n: 232.6, AL1: 83.6, AL2: 92.4, AL3: 84.1, kwtot: 112713.1, kt30d: 18644, kt60d: 37272, ts_getway: "2025-08-21T05:16:20.000Z", ts_em: "2025-08-21T05:14:25.000Z", kw_t1: 94070, kw_t2: 0, kw_t3: 18642 },
  { Device_ID: 13, type: 41, fv: 623, rssi: -13, vl1n: 233.9, vl2n: 234.4, vl3n: 230.6, AL1: 0.1, AL2: 0.8, AL3: 4.4, kwtot: 5527.8, kt30d: 9081, kt60d: 17767, ts_getway: "2025-08-21T05:16:58.000Z", ts_em: "2025-08-21T05:15:40.000Z", kw_t1: 4601, kw_t2: 0, kw_t3: 926 },
  { Device_ID: 12, type: 41, fv: 623, rssi: -4, vl1n: 234.1, vl2n: 234.3, vl3n: 230.8, AL1: 5.4, AL2: 0, AL3: 0.2, kwtot: 5408.2, kt30d: 10558, kt60d: 20492, ts_getway: "2025-08-21T05:17:03.000Z", ts_em: "2025-08-21T05:17:33.000Z", kw_t1: 4573, kw_t2: 0, kw_t3: 834 },
  { Device_ID: 10, type: 41, fv: 623, rssi: -5, vl1n: 234.4, vl2n: 230.5, vl3n: 234.4, AL1: 0.3, AL2: 0.5, AL3: 0.1, kwtot: 997.5, kt30d: 1006, kt60d: 1006, ts_getway: "2025-08-21T05:17:11.000Z", ts_em: "2025-08-21T05:18:16.000Z", kw_t1: 834, kw_t2: 0, kw_t3: 162 },
  { Device_ID: 11, type: 41, fv: 623, rssi: -12, vl1n: 229.9, vl2n: 234.8, vl3n: 234.7, AL1: 6.9, AL2: 2.7, AL3: 1, kwtot: 8650.1, kt30d: 20711, kt60d: 37688, ts_getway: "2025-08-21T05:18:14.000Z", ts_em: "2025-08-21T05:17:17.000Z", kw_t1: 6895, kw_t2: 0, kw_t3: 1754 },
  { Device_ID: 555, type: 341, fv: 624, rssi: -79, vl1n: 226.8, vl2n: 226.9, vl3n: 226.8, AL1: 0, AL2: 0, AL3: 0, kwtot: 0.2, kt30d: 0, kt60d: 0, ts_getway: "2025-08-21T05:18:21.000Z", ts_em: "2025-08-22T17:11:23.000Z", kw_t1: 0, kw_t2: 0, kw_t3: 0 },
  { Device_ID: 2, type: 341, fv: 624, rssi: -80, vl1n: 0, vl2n: 226.2, vl3n: 0, AL1: 0, AL2: 0, AL3: 0, kwtot: 0, kt30d: 0, kt60d: 0, ts_getway: "2025-08-21T05:21:35.000Z", ts_em: "2025-08-21T05:21:29.000Z", kw_t1: 0, kw_t2: 0, kw_t3: 0 }
];

// API Endpoints (READ ONLY)

// GET /api/devices -> SELECT * FROM dbo.Custumer
app.get("/api/devices", authenticateToken, async (req: any, res) => {
  const { role, user_name } = req.user;
  console.log(`Fetching devices for role: ${role}, user_name: ${user_name}`);

  if (isDemoMode) {
    let filtered = [...DEMO_DEVICES];
    if (role === 'user' && user_name) {
      filtered = filtered.filter(d => d.user_name === user_name);
    }
    return res.json(filtered);
  }

  try {
    const fields = [
      "CAST(user_name AS VARCHAR(255)) AS user_name",
      "id_user",
      "CAST(email AS VARCHAR(255)) AS email",
      "CAST(site_name AS VARCHAR(255)) AS site_name",
      "CAST(location AS VARCHAR(255)) AS location",
      "CAST(contact_name AS VARCHAR(255)) AS contact_name",
      "CAST(mobile_phone AS VARCHAR(50)) AS mobile_phone",
      "date_exp",
      "DATEDIFF(day, GETDATE(), date_exp) AS days_remaining",
      "installation_date",
      "Alerts"
    ].join(", ");
    let query = `SELECT ${fields} FROM ${getTableName('Custumer', 'customers')} WHERE application = 'energy'`;
    
    let devices = [];
    if (role !== 'admin' && user_name) {
      const result = await runQuery(`${query} AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`, [{ name: 'user_name', type: sql.NVarChar, value: user_name as string }]);
      devices = result.recordset;
    } else {
      const result = await runQuery(query);
      devices = result.recordset;
    }
    logger.info("Devices fetched", { count: devices.length, user: req.user?.user_name });
    res.json(devices);
  } catch (err: any) {
    logger.error("Failed to fetch devices", { error: err.message, route: "GET /api/devices" });
    res.status(500).json({ error: err.message });
  }
});

// ── Customer input validation ──────────────────────────────────────────────────
const VALID_APPLICATIONS = ['Energy', 'Weighing', 'Level', 'Level_PsKs', 'Temperature', 'Custom', 'Ocio', 'OffJer'];
const VALID_ROLES = ['user', 'admin'];

function validateCustomerInput(body: any, isCreate: boolean): string[] {
  const errs: string[] = [];
  const t = (v: any) => (typeof v === 'string' ? v.trim() : v);

  const name = t(body.user_name);
  if (!name) errs.push('user_name is required');
  else if (name.length < 2) errs.push('user_name must be at least 2 characters');
  else if (name.length > 100) errs.push('user_name too long (max 100)');

  if (isCreate) {
    if (!body.password) errs.push('password is required');
    else if (body.password.length < 6) errs.push('password must be at least 6 characters');
    else if (body.password.length > 200) errs.push('password too long (max 200)');
  } else if (body.password) {
    if (body.password.length < 6) errs.push('password must be at least 6 characters');
    if (body.password.length > 200) errs.push('password too long (max 200)');
  }

  if (body.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t(body.email))) errs.push('invalid email format');
    else if (body.email.length > 200) errs.push('email too long (max 200)');
  }

  if (body.application && !VALID_APPLICATIONS.includes(t(body.application)))
    errs.push(`invalid application "${body.application}" — allowed: ${VALID_APPLICATIONS.join(', ')}`);

  if (body.role && !VALID_ROLES.includes(t(body.role)))
    errs.push(`invalid role "${body.role}" — allowed: ${VALID_ROLES.join(', ')}`);

  if (body.site_name    && t(body.site_name).length    > 200) errs.push('site_name too long (max 200)');
  if (body.location     && t(body.location).length     > 200) errs.push('location too long (max 200)');
  if (body.contact_name && t(body.contact_name).length > 100) errs.push('contact_name too long (max 100)');
  if (body.mobile_phone && t(body.mobile_phone).length  > 20) errs.push('mobile_phone too long (max 20)');

  if (body.cast_num !== null && body.cast_num !== undefined && body.cast_num !== '') {
    const n = Number(body.cast_num);
    if (!Number.isInteger(n) || n < 0) errs.push('cast_num must be a non-negative integer');
  }

  return errs;
}

// Admin API Endpoints (CRUD for dbo.Custumer)

// GET /api/customers/all — admin only, returns all customers across all applications
app.get("/api/customers/all", authenticateToken, authorizeAdmin, async (req: any, res) => {
  if (isDemoMode) {
    return res.json(DEMO_DEVICES.map(({ ...d }) => d));
  }
  try {
    const fields = [
      "id_user", "CAST(user_name AS VARCHAR(255)) AS user_name",
      "CAST(email AS VARCHAR(255)) AS email",
      "CAST(site_name AS VARCHAR(255)) AS site_name",
      "CAST(location AS VARCHAR(255)) AS location",
      "CAST(contact_name AS VARCHAR(255)) AS contact_name",
      "CAST(mobile_phone AS VARCHAR(50)) AS mobile_phone",
      "date_exp", "installation_date", "Alerts",
      "CAST(application AS VARCHAR(50)) AS application",
      "CAST(role AS VARCHAR(50)) AS role",
      "cast_num",
      "CAST(unit AS VARCHAR(20)) AS unit",
      "min", "max", "alert_low", "alert_high",
      "CAST(widget_type AS VARCHAR(20)) AS widget_type",
      "CAST(CAST(Display_Graph AS TINYINT) AS BIT) AS Display_Graph",
      "device_id",
      "CAST(pub_topic AS NVARCHAR(200)) AS pub_topic",
      "CAST(sub_topic AS NVARCHAR(200)) AS sub_topic",
      "mqtt_client_id"
    ].join(", ");
    const result = await runQuery(`SELECT DISTINCT ${fields} FROM ${getTableName('Custumer', 'customers')} ORDER BY id_user`, []);
    logger.info("Customers list fetched", { count: result.recordset.length, admin: req.user?.user_name });
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch customers", { error: err.message, route: "GET /api/customers/all" });
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

// POST /api/customers
app.post("/api/customers", authenticateToken, authorizeAdmin, async (req: any, res) => {
  const customer = req.body;
  const validationErrors = validateCustomerInput(customer, true);
  if (validationErrors.length > 0) {
    logger.warn("Customer create rejected: validation failed", { errors: validationErrors, admin: req.user?.user_name });
    return res.status(400).json({ error: validationErrors.join('; ') });
  }
  if (isDemoMode) {
    const newId = Math.max(...DEMO_DEVICES.map(d => d.id_user), 0) + 1;
    const newCustomer = { ...customer, id_user: newId };
    DEMO_DEVICES.push(newCustomer);
    logger.info("Customer created (demo)", { user_name: customer.user_name, admin: req.user?.user_name });
    return res.json(newCustomer);
  }
  try {
    const hashedPassword = customer.password ? await bcrypt.hash(customer.password, 10) : null;

    let nextId: number;
    const requestedId = customer.id_user ? parseInt(customer.id_user) : NaN;

    if (!isNaN(requestedId) && requestedId > 0) {
      // Caller supplied an explicit id_user — verify it is not already taken
      const dup = await runQuery(
        `SELECT id_user FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @id_user`,
        [{ name: "id_user", type: sql.Int, value: requestedId }]
      );
      if (dup.recordset.length > 0) {
        logger.warn("Customer create rejected: duplicate id_user", { requestedId, admin: req.user?.user_name });
        return res.status(400).json({ error: `מזהה ${requestedId} כבר קיים במערכת — בחר מזהה אחר` });
      }
      nextId = requestedId;
      logger.info("Using caller-supplied id_user for new customer", { nextId, admin: req.user?.user_name });
    } else {
      // Auto-generate id_user since the column is not an IDENTITY
      const idResult = await runQuery(
        `SELECT ISNULL(MAX(id_user), 0) + 1 AS next_id FROM ${getTableName('Custumer', 'customers')}`, []
      );
      nextId = idResult.recordset[0]?.next_id ?? null;
      if (!nextId || typeof nextId !== 'number' || nextId <= 0 || !Number.isFinite(nextId)) {
        logger.error("Failed to generate id_user for new customer", { raw_next_id: nextId, admin: req.user?.user_name });
        return res.status(500).json({ error: "Failed to generate customer ID — cannot insert without a valid id_user" });
      }
      logger.info("Auto-generated id_user for new customer", { nextId, admin: req.user?.user_name });
    }
    await runQuery(`
        INSERT INTO ${getTableName('Custumer', 'customers')}
          (id_user, user_name, site_name, location, contact_name, mobile_phone, email, date_exp, installation_date, Alerts, application, password, role, cast_num, device_id, unit, min, max, alert_low, alert_high, widget_type, Display_Graph, pub_topic, sub_topic, mqtt_client_id)
        VALUES
          (@id_user, @user_name, @site_name, @location, @contact_name, @mobile_phone, @email, @date_exp, @installation_date, @Alerts, @application, @password, @role, @cast_num, @device_id, @unit, @min, @max, @alert_low, @alert_high, @widget_type, @Display_Graph, @pub_topic, @sub_topic, @mqtt_client_id)
      `, [
      { name: "id_user",        type: sql.Int,      value: nextId },
      { name: "user_name",      type: sql.NVarChar, value: customer.user_name },
      { name: "site_name",      type: sql.NVarChar, value: customer.site_name },
      { name: "location",       type: sql.NVarChar, value: customer.location },
      { name: "contact_name",   type: sql.NVarChar, value: customer.contact_name },
      { name: "mobile_phone",   type: sql.NVarChar, value: customer.mobile_phone },
      { name: "email",          type: sql.NVarChar, value: customer.email },
      { name: "date_exp",          type: sql.Date,     value: customer.date_exp || null },
      { name: "installation_date", type: sql.Date,     value: customer.installation_date || null },
      { name: "Alerts",            type: sql.Bit,      value: customer.Alerts ? 1 : 0 },
      { name: "application",    type: sql.NVarChar, value: customer.application || 'Energy' },
      { name: "password",       type: sql.NVarChar, value: hashedPassword },
      { name: "role",           type: sql.NVarChar, value: customer.role || 'user' },
      { name: "cast_num",       type: sql.Int,      value: customer.cast_num || null },
      { name: "device_id",      type: sql.Int,      value: customer.device_id != null ? parseInt(customer.device_id) : null },
      { name: "unit",           type: sql.NVarChar, value: customer.unit || null },
      { name: "min",            type: sql.Float,    value: customer.min ?? null },
      { name: "max",            type: sql.Float,    value: customer.max ?? null },
      { name: "alert_low",      type: sql.Float,    value: customer.alert_low ?? null },
      { name: "alert_high",     type: sql.Float,    value: customer.alert_high ?? null },
      { name: "widget_type",    type: sql.NVarChar, value: customer.widget_type || null },
      { name: "Display_Graph",  type: sql.Bit,      value: customer.Display_Graph ? 1 : 0 },
      { name: "pub_topic",      type: sql.NVarChar, value: customer.pub_topic || null },
      { name: "sub_topic",      type: sql.NVarChar, value: customer.sub_topic || null },
      { name: "mqtt_client_id", type: sql.Int,      value: customer.mqtt_client_id != null ? parseInt(customer.mqtt_client_id) : null }
    ]);
    logger.info("Customer created", { id_user: nextId, user_name: customer.user_name, email: customer.email, admin: req.user?.user_name, ip: req.ip });
    res.json({ success: true, id_user: nextId });
  } catch (err: any) {
    logger.error("Failed to create customer", { error: err.message, route: "POST /api/customers" });
    res.status(500).json({ error: "Failed to create customer" });
  }
});

// PUT /api/customers/:id
app.put("/api/customers/:id", authenticateToken, authorizeAdmin, async (req: any, res) => {
  const { id } = req.params;
  const numericIdPut = parseInt(id);
  if (isNaN(numericIdPut)) {
    return res.status(400).json({ error: `Invalid customer ID: "${id}"` });
  }
  const customer = req.body;
  const validationErrors = validateCustomerInput(customer, false);
  if (validationErrors.length > 0) {
    logger.warn("Customer update rejected: validation failed", { id, errors: validationErrors, admin: req.user?.user_name });
    return res.status(400).json({ error: validationErrors.join('; ') });
  }
  if (isDemoMode) {
    const idx = DEMO_DEVICES.findIndex(d => d.id_user === parseInt(id));
    if (idx !== -1) {
      DEMO_DEVICES[idx] = { ...DEMO_DEVICES[idx], ...customer };
      logger.info("Customer updated (demo)", { id, admin: req.user?.user_name });
      return res.json(DEMO_DEVICES[idx]);
    }
    return res.status(404).json({ error: "Customer not found" });
  }
  try {
    // Resolve new id_user — may differ from numericIdPut if the user changed it
    const newIdUser = customer.id_user ? parseInt(customer.id_user) : numericIdPut;
    logger.info("PUT customers — id_user resolution", { orig_id: numericIdPut, body_id_user: customer.id_user, resolved_new_id: newIdUser, mqtt_client_id: customer.mqtt_client_id, device_id: customer.device_id });
    if (isNaN(newIdUser) || newIdUser <= 0) {
      return res.status(400).json({ error: 'id_user must be a positive integer' });
    }

    // Check if new id_user is already taken by a different row
    if (newIdUser !== numericIdPut) {
      const dup = await runQuery(
        `SELECT 1 FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @new_id`,
        [{ name: 'new_id', type: sql.Int, value: newIdUser }]
      );
      if (dup.recordset.length > 0) {
        return res.status(400).json({ error: `מזהה ${newIdUser} כבר קיים — בחר מזהה אחר` });
      }
    }

    const params: any[] = [
      { name: "orig_id",      type: sql.Int,     value: numericIdPut },
      { name: "new_id_user",  type: sql.Int,     value: newIdUser },
      { name: "user_name",    type: sql.NVarChar, value: customer.user_name },
      { name: "site_name",    type: sql.NVarChar, value: customer.site_name },
      { name: "location",     type: sql.NVarChar, value: customer.location },
      { name: "contact_name", type: sql.NVarChar, value: customer.contact_name },
      { name: "mobile_phone", type: sql.NVarChar, value: customer.mobile_phone },
      { name: "email",        type: sql.NVarChar, value: customer.email },
      { name: "date_exp",          type: sql.Date,     value: customer.date_exp || null },
      { name: "installation_date", type: sql.Date,     value: customer.installation_date || null },
      { name: "Alerts",            type: sql.Bit,      value: customer.Alerts ? 1 : 0 },
      { name: "application",  type: sql.NVarChar, value: customer.application },
      { name: "role",         type: sql.NVarChar, value: customer.role },
      { name: "cast_num",     type: sql.Int,      value: customer.cast_num || null },
      { name: "unit",         type: sql.NVarChar, value: customer.unit || null },
      { name: "min",          type: sql.Float,    value: customer.min ?? null },
      { name: "max",          type: sql.Float,    value: customer.max ?? null },
      { name: "alert_low",    type: sql.Float,    value: customer.alert_low ?? null },
      { name: "alert_high",    type: sql.Float,    value: customer.alert_high ?? null },
      { name: "widget_type",   type: sql.NVarChar, value: customer.widget_type || null },
      { name: "Display_Graph", type: sql.Bit,      value: customer.Display_Graph ? 1 : 0 },
      { name: "device_id",    type: sql.Int,      value: customer.device_id != null ? parseInt(customer.device_id) : null },
      { name: "pub_topic",      type: sql.NVarChar, value: customer.pub_topic || null },
      { name: "sub_topic",      type: sql.NVarChar, value: customer.sub_topic || null },
      { name: "mqtt_client_id", type: sql.Int,      value: customer.mqtt_client_id != null ? parseInt(customer.mqtt_client_id) : null },
    ];

    let passwordClause = '';
    if (customer.password) {
      const hashedPassword = await bcrypt.hash(customer.password, 10);
      params.push({ name: "password", type: sql.NVarChar, value: hashedPassword });
      passwordClause = ', password = @password';
    }

    await runQuery(`
        UPDATE ${getTableName('Custumer', 'customers')}
        SET id_user       = @new_id_user,
            user_name     = @user_name,
            site_name     = @site_name,
            location      = @location,
            contact_name  = @contact_name,
            mobile_phone  = @mobile_phone,
            email         = @email,
            date_exp           = @date_exp,
            installation_date  = @installation_date,
            Alerts             = @Alerts,
            application   = @application,
            role          = @role,
            cast_num      = @cast_num,
            unit          = @unit,
            min           = @min,
            max           = @max,
            alert_low     = @alert_low,
            alert_high    = @alert_high,
            widget_type   = @widget_type,
            Display_Graph = @Display_Graph,
            device_id     = @device_id,
            pub_topic     = @pub_topic,
            sub_topic     = @sub_topic,
            mqtt_client_id = @mqtt_client_id
            ${passwordClause}
        WHERE id_user = @orig_id
      `, params);
    logger.info("Customer updated", { orig_id: numericIdPut, new_id: newIdUser, user_name: customer.user_name, admin: req.user?.user_name, ip: req.ip });
    res.json({ success: true, id_user: newIdUser });
  } catch (err: any) {
    logger.error("Failed to update customer", { error: err.message, route: `PUT /api/customers/${id}` });
    res.status(500).json({ error: "Failed to update customer" });
  }
});

// DELETE /api/customers/:id
app.delete("/api/customers/:id", authenticateToken, authorizeAdmin, async (req: any, res) => {
  const { id } = req.params;
  if (isDemoMode) {
    DEMO_DEVICES = DEMO_DEVICES.filter(d => d.id_user !== parseInt(id));
    logger.warn("Customer deleted (demo)", { id, admin: req.user?.user_name });
    return res.json({ success: true });
  }
  const numericId = parseInt(id);
  if (isNaN(numericId)) {
    logger.warn("Delete rejected: invalid customer ID", { raw_id: id, admin: req.user?.user_name });
    return res.status(400).json({ error: `Invalid customer ID: "${id}" — this record has no id_user in the database` });
  }
  // Prevent admin from deleting their own account
  if (numericId === req.user.id_user) {
    logger.warn("Delete rejected: admin tried to delete own account", { admin: req.user?.user_name });
    return res.status(403).json({ error: "אינך יכול למחוק את החשבון שלך" });
  }
  try {
    // Fetch name before deleting for the log
    const existing = await runQuery(
      `SELECT CAST(user_name AS VARCHAR(255)) AS user_name, CAST(email AS VARCHAR(255)) AS email FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @id_user`,
      [{ name: "id_user", type: sql.Int, value: numericId }]
    );
    await runQuery(`DELETE FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @id_user`, [
      { name: "id_user", type: sql.Int, value: numericId }
    ]);
    const deleted = existing.recordset[0];
    logger.warn("Customer deleted", { id: numericId, user_name: deleted?.user_name, email: deleted?.email, admin: req.user?.user_name, ip: req.ip });
    res.json({ success: true });
  } catch (err: any) {
    logger.error("Failed to delete customer", { error: err.message, route: `DELETE /api/customers/${id}` });
    res.status(500).json({ error: err.message || "Failed to delete customer" });
  }
});

// GET /api/users - list unique users (admin only)
app.get("/api/users", authenticateToken, authorizeAdmin, async (req: any, res) => {
  try {
    const result = await runQuery(
      `SELECT CAST(user_name AS NVARCHAR(MAX)) AS user_name,
              CAST(email AS VARCHAR(255)) AS email,
              RTRIM(role) AS role,
              MIN(cast_num) AS cast_num,
              MIN(CONVERT(VARCHAR(10), date_exp, 23)) AS date_exp
       FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) IS NOT NULL
       GROUP BY CAST(user_name AS NVARCHAR(MAX)), CAST(email AS VARCHAR(255)), RTRIM(role)`
    );
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch users", { error: err.message });
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// PUT /api/users/reset-password - reset a user's password (admin only)
app.put("/api/users/reset-password", authenticateToken, authorizeAdmin, adminActionLimiter, async (req: any, res) => {
  const { user_name, new_password, admin_password } = req.body;
  if (!user_name || !new_password || !admin_password) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ success: false, message: "סיסמה חדשה חייבת להכיל לפחות 6 תווים" });
  }

  try {
    // Verify admin password
    const adminUser = req.user.user_name;
    const adminResult = await runQuery(
      `SELECT TOP 1 password FROM ${getTableName('Custumer', 'customers')} WHERE CAST(user_name AS NVARCHAR(MAX)) = @admin_user`,
      [{ name: 'admin_user', type: sql.NVarChar, value: adminUser }]
    );

    const adminData = adminResult.recordset[0];
    if (!adminData || !adminData.password || !bcrypt.compareSync(admin_password, adminData.password)) {
      return res.status(401).json({ success: false, message: "סיסמת מנהל שגויה" });
    }

    const hashed = bcrypt.hashSync(new_password, 10);
    await runQuery(
      `UPDATE ${getTableName('Custumer', 'customers')} SET password = @password WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name`,
      [
        { name: 'password', type: sql.NVarChar, value: hashed },
        { name: 'user_name', type: sql.NVarChar, value: user_name }
      ]
    );
    logger.info("Password reset by admin", { target_user: user_name, by: req.user?.user_name });
    res.json({ success: true });
  } catch (err: any) {
    logger.error("Password reset failed", { error: err.message });
    res.status(500).json({ success: false, message: "שגיאה באיפוס סיסמה" });
  }
});

// PUT /api/users/role - change a user's role (admin only)
app.put("/api/users/role", authenticateToken, authorizeAdmin, adminActionLimiter, async (req: any, res) => {
  const { user_name, role, admin_password } = req.body;
  if (!user_name || !role || !admin_password || !['admin', 'user'].includes(role)) {
    return res.status(400).json({ success: false, message: "Invalid request data" });
  }

  try {
    // Verify admin password
    const adminUser = req.user.user_name;
    const adminResult = await runQuery(
      `SELECT TOP 1 password FROM ${getTableName('Custumer', 'customers')} WHERE CAST(user_name AS NVARCHAR(MAX)) = @admin_user`,
      [{ name: 'admin_user', type: sql.NVarChar, value: adminUser }]
    );

    const adminData = adminResult.recordset[0];
    if (!adminData || !adminData.password || !bcrypt.compareSync(admin_password, adminData.password)) {
      return res.status(401).json({ success: false, message: "סיסמת מנהל שגויה" });
    }

    await runQuery(
      `UPDATE ${getTableName('Custumer', 'customers')} SET role = @role WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name`,
      [
        { name: 'role', type: sql.NVarChar, value: role },
        { name: 'user_name', type: sql.NVarChar, value: user_name }
      ]
    );
    logger.info("Role changed by admin", { target_user: user_name, new_role: role, by: req.user?.user_name });
    res.json({ success: true });
  } catch (err: any) {
    logger.error("Role change failed", { error: err.message });
    res.status(500).json({ success: false, message: "שגיאה בשינוי הרשאה" });
  }
});

// GET /api/users/me - fetch current user profile info
app.get("/api/users/me", authenticateToken, async (req: any, res) => {
  try {
    const result = await runQuery(
      `SELECT TOP 1
        CAST(user_name AS NVARCHAR(MAX)) AS user_name,
        CAST(email AS VARCHAR(255)) AS email,
        CAST(contact_name AS VARCHAR(255)) AS contact_name,
        CAST(mobile_phone AS VARCHAR(50)) AS mobile_phone,
        CAST(site_name AS VARCHAR(255)) AS site_name,
        CAST(application AS VARCHAR(50)) AS application,
        cast_num,
        CONVERT(VARCHAR(10), date_exp, 23) AS date_exp,
        CONVERT(VARCHAR(10), installation_date, 23) AS installation_date,
        CAST(unit AS VARCHAR(20)) AS unit,
        min, max, alert_low, alert_high,
        CAST(widget_type AS VARCHAR(20)) AS widget_type,
        CAST(CAST(Display_Graph AS TINYINT) AS BIT) AS Display_Graph
       FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name`,
      [{ name: 'user_name', type: sql.NVarChar, value: req.user.user_name }]
    );
    if (result.recordset.length > 0) {
      res.json(result.recordset[0]);
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (err: any) {
    logger.error("Failed to fetch user profile", { error: err.message });
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

// ── Admin Overview endpoints ──────────────────────────────────────────────────

// GET /api/admin/overview — all customers with last-seen timestamp and online status
app.get("/api/admin/overview", authenticateToken, authorizeAdmin, async (req: any, res) => {
  try {
    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const energyDb    = sqlConfig.database || "Energy";

    const custResult = await runQuery(
      `SELECT id_user,
              CAST(user_name  AS NVARCHAR(255)) AS user_name,
              CAST(site_name  AS NVARCHAR(255)) AS site_name,
              CAST(location   AS NVARCHAR(255)) AS location,
              CAST(application AS NVARCHAR(100)) AS application,
              cast_num,
              ISNULL(device_id, id_user) AS hw_id
       FROM ${getTableName('Custumer', 'customers')}
       WHERE role <> 'admin' OR role IS NULL
       ORDER BY application, site_name`,
      []
    );
    const customers = custResult.recordset;

    type LastSeenEntry = { last_seen_str: string; age_sec: number };

    // --- energy devices WITHOUT cast_num: query the central Energy table ---
    const energyLastSeen: Record<number, LastSeenEntry> = {};
    const energyTableCustomers = customers.filter(
      (c: any) => c.application?.toLowerCase() === 'energy' && c.cast_num == null
    );
    if (energyTableCustomers.length > 0) {
      const hwIds = energyTableCustomers.map((c: any) => Number(c.hw_id)).join(',');
      const r = await runQuery(
        `SELECT Device_ID,
                CONVERT(VARCHAR(23), CAST(MAX(ts_getway) AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS DATETIME), 126) + 'Z' AS last_seen_str,
                DATEDIFF(SECOND, CAST(MAX(ts_getway) AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS DATETIME), GETUTCDATE()) AS age_sec
         FROM [${energyDb}].[dbo].[Energy]
         WHERE Device_ID IN (${hwIds})
         GROUP BY Device_ID`,
        []
      );
      r.recordset.forEach((row: any) => {
        energyLastSeen[row.Device_ID] = { last_seen_str: row.last_seen_str, age_sec: Number(row.age_sec) };
      });
    }

    // --- cast table devices: all customers that have a cast_num (any application) ---
    // Energy devices with cast_num store data in their cast table, not the central Energy table.
    // Timestamp column and device filter vary by application:
    //   Energy   → ts_getway (UTC),          Device_ID (capital)
    //   Level    → ts (UTC),                 device_id (lowercase)
    //   Weighing → ts (Israel-local),        Device_ID (capital)
    //   Ocio     → ts (UTC),                 no device filter
    //   Custom   → [timestamp] (UTC),        no device filter
    const castCustomers = customers.filter((c: any) => c.cast_num != null);
    const castLastSeen: Record<string, LastSeenEntry> = {};

    for (const cust of castCustomers) {
      const app     = (cust.application || '').toLowerCase();
      const castNum = Number(cust.cast_num);
      const hwId    = Number(cust.hw_id);
      const key     = `${castNum}_${hwId}`;
      if (castLastSeen[key]) continue; // already fetched for this device

      const tableName = `[${customersDb}].[dbo].[cast_${castNum}]`;

      // Device filter clause — application-aware
      let whereClause = '';
      if (app === 'energy' || app === 'weighing') {
        whereClause = `WHERE Device_ID = ${hwId}`;
      } else if (app === 'level') {
        whereClause = `WHERE device_id = ${hwId}`;
      }
      // Ocio / Custom: no WHERE — single device per cast table

      // Timestamp column — application-aware
      let tsCol: string;
      if (app === 'energy')       tsCol = 'ts_getway';
      else if (app === 'custom')  tsCol = '[timestamp]';
      else                        tsCol = 'ts';

      // Weighing, OffJer, and Energy store ts/ts_getway as Israel-local; Level, Ocio, Custom store UTC.
      const isIsraelLocal = (app === 'weighing' || app === 'offjer' || app === 'energy');
      const lastSeenExpr = isIsraelLocal
        ? `CONVERT(VARCHAR(23), CAST(${tsCol} AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS DATETIME), 126) + 'Z'`
        : `CONVERT(VARCHAR(23), ${tsCol}, 126) + 'Z'`;
      const ageSecExpr = isIsraelLocal
        ? `DATEDIFF(SECOND, CAST(${tsCol} AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS DATETIME), GETUTCDATE())`
        : `DATEDIFF(SECOND, ${tsCol}, GETUTCDATE())`;

      try {
        const r = await runQuery(
          `SELECT TOP 1
             ${lastSeenExpr} AS last_seen_str,
             ${ageSecExpr} AS age_sec
           FROM ${tableName}
           ${whereClause}
           ORDER BY ${tsCol} DESC`,
          []
        );
        if (r.recordset.length > 0) {
          castLastSeen[key] = {
            last_seen_str: r.recordset[0].last_seen_str,
            age_sec: Number(r.recordset[0].age_sec),
          };
        }
      } catch (err: any) {
        logger.warn(`Admin overview: cast_${castNum} app=${app} hw=${hwId} — ${err.message}`);
      }
    }

    const ONLINE_SEC = 30 * 60;

    const result = customers.map((c: any) => {
      let entry: LastSeenEntry | undefined;
      if (c.cast_num != null) {
        // cast table is the source of truth when cast_num is set (any application)
        entry = castLastSeen[`${c.cast_num}_${c.hw_id}`];
      } else if (c.application?.toLowerCase() === 'energy') {
        // Energy devices without cast_num use the central Energy table
        entry = energyLastSeen[c.hw_id];
      }
      return {
        id_user:     c.id_user,
        user_name:   c.user_name,
        site_name:   c.site_name,
        location:    c.location,
        application: c.application,
        last_seen:   entry?.last_seen_str ?? null,
        is_online:   entry != null ? entry.age_sec < ONLINE_SEC : false,
      };
    });

    res.json(result);
  } catch (err: any) {
    logger.error("Failed to fetch admin overview", { error: err.message });
    res.status(500).json({ error: "Failed to fetch admin overview" });
  }
});

// GET /api/admin/recent-logins — successful logins in the last 48 h, parsed from log files
app.get("/api/admin/recent-logins", authenticateToken, authorizeAdmin, async (req: any, res) => {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    const cutoff  = Date.now() - 48 * 60 * 60 * 1000;
    const logins: any[] = [];

    // Scan ALL log files — Winston keeps the same file for the entire server lifetime,
    // so the active log may be named after the startup date, not today.
    const allFiles = fs.existsSync(logsDir)
      ? fs.readdirSync(logsDir).filter(f => f.startsWith('app-') && f.endsWith('.log'))
      : [];

    for (const fileName of allFiles) {
      const filePath = path.join(logsDir, fileName);
      const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/);
      for (const line of lines) {
        if (!line.includes('Login successful')) continue;
        const tsMatch   = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
        const metaMatch = line.match(/\{.*\}$/);
        if (!tsMatch || !metaMatch) continue;
        const ts = new Date(tsMatch[1].replace(' ', 'T'));
        if (isNaN(ts.getTime()) || ts.getTime() < cutoff) continue;
        try {
          const meta = JSON.parse(metaMatch[0]);
          logins.push({ user_name: meta.user_name, ip: meta.ip, timestamp: ts.toISOString() });
        } catch { /* malformed JSON in log line */ }
      }
    }

    logins.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    res.json(logins);
  } catch (err: any) {
    logger.error("Failed to fetch recent logins", { error: err.message });
    res.status(500).json({ error: "Failed to fetch recent logins" });
  }
});

// GET /api/weighing/devices — returns all weighing devices for the logged-in user
app.get("/api/weighing/devices", authenticateToken, async (req: any, res) => {
  try {
    const { user_name, role } = req.user;
    let query = `SELECT id_user, device_id,
                        CAST(site_name AS VARCHAR(255)) AS site_name,
                        CAST(location AS NVARCHAR(255)) AS location,
                        CAST(unit AS VARCHAR(20)) AS unit,
                        min, max, alert_low, alert_high,
                        CAST(widget_type AS VARCHAR(20)) AS widget_type,
                        CAST(CAST(Display_Graph AS TINYINT) AS BIT) AS Display_Graph,
                        cast_num
                 FROM ${getTableName('Custumer', 'customers')}
                 WHERE application = 'Weighing'`;
    const params: any[] = [];
    if (role === 'user') {
      query += ` AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`;
      params.push({ name: 'user_name', type: sql.NVarChar, value: user_name });
    }
    const result = await runQuery(query, params);
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch weighing devices", { error: err.message });
    res.status(500).json({ error: "Failed to fetch weighing devices" });
  }
});

// GET /api/weighing/data — returns readings from the user's cast table, filtered by device
app.get("/api/weighing/data", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const device_id = parseInt(req.query.device_id as string);
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const userResult = await runQuery(
      `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND id_user = @device_id`,
      [
        { name: 'user_name', type: sql.NVarChar, value: user_name },
        { name: 'device_id', type: sql.Int,      value: device_id },
      ]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    const hw_id   = userResult.recordset[0]?.hw_id ?? device_id;
    if (!cast_num) return res.status(404).json({ error: 'No cast table configured for this device' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const days  = parseInt(req.query.days  as string) || 0;
    const start = req.query.start as string | undefined;
    const end   = req.query.end   as string | undefined;
    const SELECT = `ts AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS timestamp,
                    gross_weight, net_weight, input_status, fill_start, fill_stop, fill_total`;
    let dataResult;
    if (start && end) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      dataResult = await runQuery(
        `SELECT ${SELECT} FROM ${tableName}
         WHERE fill_total = 0 AND Device_ID = @hw_id AND ts >= @start AND ts <= @end
         ORDER BY ts ASC`,
        [
          { name: 'hw_id', type: sql.Int,      value: hw_id },
          { name: 'start', type: sql.DateTime, value: new Date(start) },
          { name: 'end',   type: sql.DateTime, value: endDate },
        ]
      );
    } else if (days > 0) {
      dataResult = await runQuery(
        `SELECT ${SELECT} FROM ${tableName}
         WHERE fill_total = 0 AND Device_ID = @hw_id AND ts >= DATEADD(day, -@days, GETDATE())
         ORDER BY ts ASC`,
        [
          { name: 'hw_id', type: sql.Int, value: hw_id },
          { name: 'days',  type: sql.Int, value: days },
        ]
      );
    } else {
      dataResult = await runQuery(
        `SELECT TOP 50 ${SELECT} FROM ${tableName}
         WHERE fill_total = 0 AND Device_ID = @hw_id
         ORDER BY ts DESC`,
        [
          { name: 'hw_id', type: sql.Int, value: hw_id },
        ]
      );
      dataResult.recordset.reverse();
    }
    logger.info("Weighing data query", { device_id, hw_id, rows: dataResult.recordset.length, days: days || null, start: start || null, end: end || null, user: req.user?.user_name });
    res.json(dataResult.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch weighing data", { error: err.message });
    res.status(500).json({ error: "Failed to fetch weighing data" });
  }
});

// GET /api/weighing/fillings — returns filling events (fill_total > 0) for a device
app.get("/api/weighing/fillings", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const device_id = parseInt(req.query.device_id as string);
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const userResult = await runQuery(
      `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND id_user = @device_id`,
      [
        { name: 'user_name', type: sql.NVarChar, value: user_name },
        { name: 'device_id', type: sql.Int,      value: device_id },
      ]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    const hw_id   = userResult.recordset[0]?.hw_id ?? device_id;
    if (!cast_num) return res.status(404).json({ error: 'No cast table configured for this device' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const days = parseInt(req.query.days as string) || 30;

    const result = await runQuery(
      `SELECT TOP 200
         ts AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS timestamp,
         Device_ID, fill_start, fill_stop, fill_total
       FROM ${tableName}
       WHERE fill_total > 0 AND Device_ID = @hw_id AND ts >= DATEADD(day, -@days, GETDATE())
       ORDER BY ts DESC`,
      [
        { name: 'hw_id', type: sql.Int, value: hw_id },
        { name: 'days',  type: sql.Int, value: days },
      ]
    );
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch weighing fillings", { error: err.message });
    res.status(500).json({ error: "Failed to fetch weighing fillings" });
  }
});

// GET /api/weighing/daily-consumption — daily kg consumed (weight drops only, no fillings)
app.get("/api/weighing/daily-consumption", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const device_id = parseInt(req.query.device_id as string);
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const userResult = await runQuery(
      `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND id_user = @device_id`,
      [
        { name: 'user_name', type: sql.NVarChar, value: user_name },
        { name: 'device_id', type: sql.Int,      value: device_id },
      ]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    const hw_id   = userResult.recordset[0]?.hw_id ?? device_id;
    if (!cast_num) return res.status(404).json({ error: 'No cast table configured for this device' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;

    const result = await runQuery(
      `WITH lag_data AS (
         SELECT
           CAST(ts AS DATE) AS day,
           net_weight,
           LAG(net_weight) OVER (ORDER BY ts) AS prev_weight
         FROM ${tableName}
         WHERE Device_ID = @hw_id AND fill_total = 0
           AND ts >= DATEADD(day, -30, GETDATE())
       )
       SELECT
         CONVERT(VARCHAR(10), day, 120) AS day,
         SUM(CASE WHEN prev_weight > net_weight THEN prev_weight - net_weight ELSE 0 END) AS consumption
       FROM lag_data
       WHERE prev_weight IS NOT NULL
       GROUP BY day
       ORDER BY day ASC`,
      [
        { name: 'hw_id', type: sql.Int, value: hw_id },
      ]
    );
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch weighing daily consumption", { error: err.message });
    res.status(500).json({ error: "Failed to fetch weighing daily consumption" });
  }
});

// ── Ocio endpoints ─────────────────────────────────────────────────────────────

// GET /api/ocio/devices — returns all Ocio devices for the logged-in user
app.get("/api/ocio/devices", authenticateToken, async (req: any, res) => {
  try {
    const { role, user_name } = req.user;
    let query = `SELECT id_user,
                        CAST(site_name AS NVARCHAR(255)) AS site_name,
                        CAST(location AS NVARCHAR(255)) AS location,
                        CAST(unit AS VARCHAR(20)) AS unit,
                        min, max, alert_low, alert_high,
                        CAST(widget_type AS VARCHAR(20)) AS widget_type,
                        CAST(CAST(Display_Graph AS TINYINT) AS BIT) AS Display_Graph,
                        cast_num
                 FROM ${getTableName('Custumer', 'customers')}
                 WHERE application = 'Ocio'`;
    const params: any[] = [];
    if (role === 'user') {
      query += ` AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`;
      params.push({ name: 'user_name', type: sql.NVarChar, value: user_name });
    }
    const result = await runQuery(query, params);
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch ocio devices", { error: err.message });
    res.status(500).json({ error: "Failed to fetch ocio devices" });
  }
});

// GET /api/ocio/data — returns readings (vol + lv) from the user's cast table
app.get("/api/ocio/data", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const device_id = parseInt(req.query.device_id as string);
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const userResult = await runQuery(
      `SELECT TOP 1 cast_num FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND id_user = @device_id`,
      [
        { name: 'user_name', type: sql.NVarChar, value: user_name },
        { name: 'device_id', type: sql.Int,      value: device_id },
      ]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    if (!cast_num) return res.status(404).json({ error: 'No cast table configured for this device' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const days  = parseInt(req.query.days  as string) || 0;
    const start = req.query.start as string | undefined;
    const end   = req.query.end   as string | undefined;

    let dataResult;
    if (start && end) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      dataResult = await runQuery(
        `SELECT ts AT TIME ZONE 'UTC' AS timestamp, vol, lv FROM ${tableName}
         WHERE ts >= @start AND ts <= @end
         ORDER BY ts ASC`,
        [
          { name: 'start', type: sql.DateTime, value: new Date(start) },
          { name: 'end',   type: sql.DateTime, value: endDate },
        ]
      );
    } else if (days > 0) {
      dataResult = await runQuery(
        `SELECT ts AT TIME ZONE 'UTC' AS timestamp, vol, lv FROM ${tableName}
         WHERE ts >= DATEADD(day, -@days, GETDATE())
         ORDER BY ts ASC`,
        [
          { name: 'days', type: sql.Int, value: days },
        ]
      );
    } else {
      dataResult = await runQuery(
        `SELECT TOP 50 ts AT TIME ZONE 'UTC' AS timestamp, vol, lv FROM ${tableName}
         ORDER BY ts DESC`,
        []
      );
      dataResult.recordset.reverse();
    }
    logger.info("Ocio data query", { device_id, rows: dataResult.recordset.length, days: days || null, start: start || null, end: end || null, user: req.user?.user_name });
    res.json(dataResult.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch ocio data", { error: err.message });
    res.status(500).json({ error: "Failed to fetch ocio data" });
  }
});

// ── Level endpoints ────────────────────────────────────────────────────────────

// GET /api/level/devices — returns all Level devices for the logged-in user
app.get("/api/level/devices", authenticateToken, async (req: any, res) => {
  try {
    const { role, user_name } = req.user;
    let query = `SELECT id_user,
                        CAST(site_name AS NVARCHAR(255)) AS site_name,
                        CAST(location AS NVARCHAR(255)) AS location,
                        CAST(unit AS VARCHAR(20)) AS unit,
                        min, max, alert_low, alert_high,
                        CAST(widget_type AS VARCHAR(20)) AS widget_type,
                        CAST(CAST(Display_Graph AS TINYINT) AS BIT) AS Display_Graph,
                        cast_num
                 FROM ${getTableName('Custumer', 'customers')}
                 WHERE application = 'Level'`;
    const params: any[] = [];
    if (role === 'user') {
      query += ` AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`;
      params.push({ name: 'user_name', type: sql.NVarChar, value: user_name });
    }
    const result = await runQuery(query, params);
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch level devices", { error: err.message });
    res.status(500).json({ error: "Failed to fetch level devices" });
  }
});

// GET /api/level/data — returns readings (vol + lv) from the user's cast table, filtered by device
app.get("/api/level/data", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const device_id = parseInt(req.query.device_id as string);
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const userResult = await runQuery(
      `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND id_user = @device_id`,
      [
        { name: 'user_name', type: sql.NVarChar, value: user_name },
        { name: 'device_id', type: sql.Int,      value: device_id },
      ]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    const hw_id   = userResult.recordset[0]?.hw_id ?? device_id;
    if (!cast_num) return res.status(404).json({ error: 'No cast table configured for this device' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const days  = parseInt(req.query.days  as string) || 0;
    const start = req.query.start as string | undefined;
    const end   = req.query.end   as string | undefined;

    let dataResult;
    if (start && end) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      dataResult = await runQuery(
        `SELECT ts AT TIME ZONE 'UTC' AS timestamp, vol, lv FROM ${tableName}
         WHERE device_id = @hw_id AND ts >= @start AND ts <= @end
         ORDER BY ts ASC`,
        [
          { name: 'hw_id', type: sql.Int,      value: hw_id },
          { name: 'start', type: sql.DateTime,  value: new Date(start) },
          { name: 'end',   type: sql.DateTime,  value: endDate },
        ]
      );
    } else if (days > 0) {
      dataResult = await runQuery(
        `SELECT ts AT TIME ZONE 'UTC' AS timestamp, vol, lv FROM ${tableName}
         WHERE device_id = @hw_id AND ts >= DATEADD(day, -@days, GETDATE())
         ORDER BY ts ASC`,
        [
          { name: 'hw_id', type: sql.Int, value: hw_id },
          { name: 'days',  type: sql.Int, value: days },
        ]
      );
    } else {
      dataResult = await runQuery(
        `SELECT TOP 50 ts AT TIME ZONE 'UTC' AS timestamp, vol, lv FROM ${tableName}
         WHERE device_id = @hw_id
         ORDER BY ts DESC`,
        [
          { name: 'hw_id', type: sql.Int, value: hw_id },
        ]
      );
      dataResult.recordset.reverse();
    }
    logger.info("Level data query", { device_id, hw_id, rows: dataResult.recordset.length, days: days || null, start: start || null, end: end || null, user: req.user?.user_name });
    res.json(dataResult.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch level data", { error: err.message });
    res.status(500).json({ error: "Failed to fetch level data" });
  }
});

// ── PS-KS (Level_PsKs) endpoints ───────────────────────────────────────────────

// GET /api/psks/devices — returns all Level_PsKs devices for the logged-in user
app.get("/api/psks/devices", authenticateToken, async (req: any, res) => {
  try {
    const { role, user_name } = req.user;
    let query = `SELECT id_user,
                        CAST(site_name AS NVARCHAR(255)) AS site_name,
                        CAST(location AS NVARCHAR(255)) AS location,
                        CAST(unit AS VARCHAR(20)) AS unit,
                        min, max, alert_low, alert_high,
                        CAST(widget_type AS VARCHAR(20)) AS widget_type,
                        CAST(CAST(Display_Graph AS TINYINT) AS BIT) AS Display_Graph,
                        cast_num
                 FROM ${getTableName('Custumer', 'customers')}
                 WHERE application = 'Level_PsKs'`;
    const params: any[] = [];
    if (role === 'user') {
      query += ` AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`;
      params.push({ name: 'user_name', type: sql.NVarChar, value: user_name });
    }
    const result = await runQuery(query, params);
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch psks devices", { error: err.message });
    res.status(500).json({ error: "Failed to fetch psks devices" });
  }
});

// GET /api/psks/data — returns readings (level, battery, signal, interrupt) from cast table
app.get("/api/psks/data", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const device_id = parseInt(req.query.device_id as string);
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const userResult = await runQuery(
      `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND id_user = @device_id`,
      [
        { name: 'user_name', type: sql.NVarChar, value: user_name },
        { name: 'device_id', type: sql.Int,      value: device_id },
      ]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    const hw_id   = userResult.recordset[0]?.hw_id ?? device_id;
    if (!cast_num) return res.status(404).json({ error: 'No cast table configured for this device' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const days  = parseInt(req.query.days  as string) || 0;
    const start = req.query.start as string | undefined;
    const end   = req.query.end   as string | undefined;

    // ts is stored as Israel local time (+3h) — convert to UTC for consistent frontend handling
    const tsExpr = `ts AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS timestamp`;

    let dataResult;
    if (start && end) {
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      dataResult = await runQuery(
        `SELECT ${tsExpr}, level, battery, signal, interrupt FROM ${tableName}
         WHERE Device_ID = @hw_id AND ts >= @start AND ts <= @end
         ORDER BY ts ASC`,
        [
          { name: 'hw_id', type: sql.Int,      value: hw_id },
          { name: 'start', type: sql.DateTime,  value: new Date(start) },
          { name: 'end',   type: sql.DateTime,  value: endDate },
        ]
      );
    } else if (days > 0) {
      dataResult = await runQuery(
        `SELECT ${tsExpr}, level, battery, signal, interrupt FROM ${tableName}
         WHERE Device_ID = @hw_id AND ts >= DATEADD(day, -@days, GETDATE())
         ORDER BY ts ASC`,
        [
          { name: 'hw_id', type: sql.Int, value: hw_id },
          { name: 'days',  type: sql.Int, value: days },
        ]
      );
    } else {
      dataResult = await runQuery(
        `SELECT TOP 50 ${tsExpr}, level, battery, signal, interrupt FROM ${tableName}
         WHERE Device_ID = @hw_id
         ORDER BY ts DESC`,
        [{ name: 'hw_id', type: sql.Int, value: hw_id }]
      );
      dataResult.recordset.reverse();
    }
    logger.info("PsKs data query", { device_id, hw_id, rows: dataResult.recordset.length, user: req.user?.user_name });
    res.json(dataResult.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch psks data", { error: err.message });
    res.status(500).json({ error: "Failed to fetch psks data" });
  }
});

// GET /api/psks/daily-consumption — daily level drop (consumption) per day, last 30 days
app.get("/api/psks/daily-consumption", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const device_id = parseInt(req.query.device_id as string);
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const userResult = await runQuery(
      `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND id_user = @device_id`,
      [
        { name: 'user_name', type: sql.NVarChar, value: user_name },
        { name: 'device_id', type: sql.Int,      value: device_id },
      ]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    const hw_id   = userResult.recordset[0]?.hw_id ?? device_id;
    if (!cast_num) return res.status(404).json({ error: 'No cast table configured for this device' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;

    const result = await runQuery(
      `WITH lag_data AS (
         SELECT
           CAST(ts AS DATE) AS day,
           level,
           LAG(level) OVER (PARTITION BY Device_ID ORDER BY ts) AS prev_level
         FROM ${tableName}
         WHERE Device_ID = @hw_id
           AND ts >= DATEADD(day, -30, GETDATE())
       )
       SELECT
         CONVERT(VARCHAR(10), day, 120) AS day,
         SUM(CASE WHEN prev_level > level THEN prev_level - level ELSE 0 END) AS consumption
       FROM lag_data
       WHERE prev_level IS NOT NULL
       GROUP BY day
       ORDER BY day ASC`,
      [{ name: 'hw_id', type: sql.Int, value: hw_id }]
    );
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch psks daily consumption", { error: err.message });
    res.status(500).json({ error: "Failed to fetch psks daily consumption" });
  }
});

// GET /api/psks/fillings — returns fill events (fill_total > 0) for a device
app.get("/api/psks/fillings", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const device_id = parseInt(req.query.device_id as string);
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const userResult = await runQuery(
      `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND id_user = @device_id`,
      [
        { name: 'user_name', type: sql.NVarChar, value: user_name },
        { name: 'device_id', type: sql.Int,      value: device_id },
      ]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    const hw_id   = userResult.recordset[0]?.hw_id ?? device_id;
    if (!cast_num) return res.status(404).json({ error: 'No cast table configured for this device' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const days = parseInt(req.query.days as string) || 30;

    const result = await runQuery(
      `SELECT TOP 200
         ts AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS timestamp,
         Device_ID, fill_start, fill_stop, fill_total
       FROM ${tableName}
       WHERE fill_total > 0 AND Device_ID = @hw_id AND ts >= DATEADD(day, -@days, GETDATE())
       ORDER BY ts DESC`,
      [
        { name: 'hw_id', type: sql.Int, value: hw_id },
        { name: 'days',  type: sql.Int, value: days },
      ]
    );
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch psks fillings", { error: err.message });
    res.status(500).json({ error: "Failed to fetch psks fillings" });
  }
});

// ── OffJer endpoints ────────────────────────────────────────────────────────────

// GET /api/ofjer/devices — returns all OffJer devices for the logged-in user
app.get("/api/ofjer/devices", authenticateToken, async (req: any, res) => {
  try {
    const { role, user_name } = req.user;
    let query = `SELECT id_user,
                        CAST(site_name AS NVARCHAR(255)) AS site_name,
                        CAST(location AS NVARCHAR(255)) AS location,
                        cast_num
                 FROM ${getTableName('Custumer', 'customers')}
                 WHERE application = 'OffJer'`;
    const params: any[] = [];
    if (role === 'user') {
      query += ` AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`;
      params.push({ name: 'user_name', type: sql.NVarChar, value: user_name });
    }
    const result = await runQuery(query, params);
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch ofjer devices", { error: err.message });
    res.status(500).json({ error: "Failed to fetch ofjer devices" });
  }
});

// GET /api/ofjer/data — returns latest 50 counter readings from the user's cast table
app.get("/api/ofjer/data", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const device_id = parseInt(req.query.device_id as string);
    if (!device_id) return res.status(400).json({ error: 'device_id is required' });

    const userResult = await runQuery(
      `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND id_user = @device_id`,
      [
        { name: 'user_name', type: sql.NVarChar, value: user_name },
        { name: 'device_id', type: sql.Int,      value: device_id },
      ]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    const hw_id   = userResult.recordset[0]?.hw_id ?? device_id;
    if (!cast_num) return res.status(404).json({ error: 'No cast table configured for this device' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const dataResult = await runQuery(
      `SELECT TOP 50 ts AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS timestamp,
              counter1, counter2, counter3, counter4,
              counter5, counter6, counter7, counter8
       FROM ${tableName}
       WHERE device_id = @hw_id
       ORDER BY ts DESC`,
      [{ name: 'hw_id', type: sql.Int, value: hw_id }]
    );
    dataResult.recordset.reverse();
    logger.info("OffJer data query", { device_id, rows: dataResult.recordset.length, user: req.user?.user_name });
    res.json(dataResult.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch ofjer data", { error: err.message });
    res.status(500).json({ error: "Failed to fetch ofjer data" });
  }
});

// GET /api/ofjer/history — returns counter readings for a date range (for chart)
app.get("/api/ofjer/history", authenticateToken, async (req: any, res) => {
  try {
    const { role, user_name } = req.user;
    const device_id = parseInt(req.query.device_id as string);
    const from = req.query.from as string;
    const to   = req.query.to   as string;
    if (!device_id || !from || !to) return res.status(400).json({ error: 'device_id, from, to required' });

    let accessQuery = `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')}
       WHERE id_user = @device_id AND application = 'OffJer'`;
    const accessParams: any[] = [{ name: 'device_id', type: sql.Int, value: device_id }];
    if (role === 'user') {
      accessQuery += ` AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`;
      accessParams.push({ name: 'user_name', type: sql.NVarChar, value: user_name });
    }
    const accessResult = await runQuery(accessQuery, accessParams);
    const cast_num = accessResult.recordset[0]?.cast_num;
    const hw_id   = accessResult.recordset[0]?.hw_id ?? device_id;
    if (!cast_num) return res.status(404).json({ error: 'No cast table configured for this device' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const dataResult = await runQuery(
      `SELECT ts AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS timestamp,
              counter1, counter2, counter3, counter4,
              counter5, counter6, counter7, counter8
       FROM ${tableName}
       WHERE device_id = @hw_id
         AND ts >= @from AND ts <= @to
       ORDER BY ts ASC`,
      [
        { name: 'hw_id', type: sql.Int,      value: hw_id },
        { name: 'from',  type: sql.DateTime,  value: new Date(from) },
        { name: 'to',    type: sql.DateTime,  value: new Date(to)   },
      ]
    );
    res.json(dataResult.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch ofjer history", { error: err.message });
    res.status(500).json({ error: "Failed to fetch ofjer history" });
  }
});

// ── Public OffJer snapshot endpoint ─────────────────────────────────────────────

// GET /api/offjer — public (no auth), returns latest counter values for 2 PLCs
app.get("/api/offjer", async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  const buildOfflinePLC = (id: string) => ({
    id,
    status: "offline",
    last_update: null,
    counters: {
      counter_1: null, counter_2: null, counter_3: null, counter_4: null,
      counter_5: null, counter_6: null, counter_7: null, counter_8: null,
    },
  });

  // ts is stored as local Israel time — format it as ISO without any UTC shift
  const fmtLocalTs = (v: any): string => {
    const d = v instanceof Date ? v : new Date(v);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T` +
           `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const buildPLC = (id: string, row: any) => ({
    id,
    status: "online",
    last_update: fmtLocalTs(row.timestamp),
    counters: {
      counter_1: row.counter1 !== null && row.counter1 !== undefined ? Number(row.counter1) : null,
      counter_2: row.counter2 !== null && row.counter2 !== undefined ? Number(row.counter2) : null,
      counter_3: row.counter3 !== null && row.counter3 !== undefined ? Number(row.counter3) : null,
      counter_4: row.counter4 !== null && row.counter4 !== undefined ? Number(row.counter4) : null,
      counter_5: row.counter5 !== null && row.counter5 !== undefined ? Number(row.counter5) : null,
      counter_6: row.counter6 !== null && row.counter6 !== undefined ? Number(row.counter6) : null,
      counter_7: row.counter7 !== null && row.counter7 !== undefined ? Number(row.counter7) : null,
      counter_8: row.counter8 !== null && row.counter8 !== undefined ? Number(row.counter8) : null,
    },
  });

  try {
    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;

    // Fetch the first 3 OffJer devices ordered by id_user
    const devicesResult = await runQuery(
      `SELECT TOP 3 id_user, ISNULL(device_id, id_user) AS hw_id, cast_num
       FROM ${getTableName('Custumer', 'customers')}
       WHERE application = 'OffJer'
       ORDER BY id_user ASC`,
      []
    );
    const devices = devicesResult.recordset;

    const getLatest = async (castNum: number, hwId: number) => {
      const tableName = `[${customersDb}].[dbo].[cast_${castNum}]`;
      const r = await runQuery(
        `SELECT TOP 1
           ts AS timestamp,
           counter1, counter2, counter3, counter4,
           counter5, counter6, counter7, counter8
         FROM ${tableName}
         WHERE device_id = @hw_id
         ORDER BY ts DESC`,
        [{ name: 'hw_id', type: sql.Int, value: hwId }]
      );
      return r.recordset[0] ?? null;
    };

    const [row1, row2, row3] = await Promise.allSettled([
      devices[0] ? getLatest(devices[0].cast_num, devices[0].hw_id) : Promise.resolve(null),
      devices[1] ? getLatest(devices[1].cast_num, devices[1].hw_id) : Promise.resolve(null),
      devices[2] ? getLatest(devices[2].cast_num, devices[2].hw_id) : Promise.resolve(null),
    ]);

    const plc1 = row1.status === 'fulfilled' && row1.value
      ? buildPLC("plc_01", row1.value)
      : buildOfflinePLC("plc_01");

    const plc2 = row2.status === 'fulfilled' && row2.value
      ? buildPLC("plc_02", row2.value)
      : buildOfflinePLC("plc_02");

    const plc3 = row3.status === 'fulfilled' && row3.value
      ? buildPLC("plc_03", row3.value)
      : buildOfflinePLC("plc_03");

    res.json({
      device: "monitor it -by Galoz ",
      timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }).replace(' ', 'T'),
      plc_1: plc1,
      plc_2: plc2,
      plc_3: plc3,
    });
  } catch (err: any) {
    logger.error("Failed to fetch offjer public snapshot", { error: err.message });
    res.json({
      device: "monitor it -by Galoz ",
      timestamp: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }).replace(' ', 'T'),
      plc_1: buildOfflinePLC("plc_01"),
      plc_2: buildOfflinePLC("plc_02"),
      plc_3: buildOfflinePLC("plc_03"),
    });
  }
});

// ── Haifa endpoints ─────────────────────────────────────────────────────────────

// GET /api/haifa/latest — returns the latest multi-sensor row from the user's cast table (no device_id)
app.get("/api/haifa/latest", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const userResult = await runQuery(
      `SELECT TOP 1 cast_num FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND application = 'Custom'`,
      [{ name: 'user_name', type: sql.NVarChar, value: user_name }]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    if (!cast_num) return res.status(404).json({ error: 'No Haifa cast table configured for this user' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const result = await runQuery(
      `SELECT TOP 1
         CONVERT(VARCHAR(23), [timestamp], 126) + 'Z' AS [timestamp],
         Sensor11_O2_mgL, Sensor11_temperature, Sensor11_O2_percent,
         Sensor21_pH, Sensor21_temperature, Sensor21_ORP,
         Sensor12_O2_mgL, Sensor12_temperature, Sensor12_O2_percent,
         Sensor23_pH, Sensor23_temperature, Sensor23_ORP,
         Sensor24_pH, Sensor24_temperature, Sensor24_ORP,
         Sensor25_pH, Sensor25_temperature, Sensor25_ORP,
         VL1_N, VL2_N, VL3_N,
         AL1, AL2, AL3,
         KWL1, KWL2, KWL3, KWTOT,
         (SELECT COUNT(*) FROM ${tableName} WHERE [timestamp] >= DATEADD(HOUR, -1, (SELECT MAX([timestamp]) FROM ${tableName}))) AS msgs_last_hour
       FROM ${tableName}
       ORDER BY [timestamp] DESC`,
      []
    );
    if (result.recordset.length === 0) return res.status(404).json({ error: 'No data found' });
    logger.info("Haifa latest query OK", { table: tableName, msgs_last_hour: result.recordset[0]?.msgs_last_hour, user: req.user?.user_name });
    res.json(result.recordset[0]);
  } catch (err: any) {
    logger.error("Failed to fetch haifa data", { error: err.message });
    res.status(500).json({ error: "Failed to fetch haifa data" });
  }
});

// GET /api/haifa/history — historical rows for the user's cast table
// mode=chart  → hourly AVG aggregation, returns array (small, for charts)
// mode=table  → server-side paginated raw rows, returns { data, total } (for tables)
// mode=export → all raw rows up to 5000, returns array (for CSV/PDF export)
app.get("/api/haifa/history", authenticateToken, async (req: any, res) => {
  try {
    const { user_name } = req.user;
    const { from, to, mode, page, size } = req.query as Record<string, string>;
    if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

    const userResult = await runQuery(
      `SELECT TOP 1 cast_num FROM ${getTableName('Custumer', 'customers')}
       WHERE CAST(user_name AS NVARCHAR(MAX)) = @user_name AND application = 'Custom'`,
      [{ name: 'user_name', type: sql.NVarChar, value: user_name }]
    );
    const cast_num = userResult.recordset[0]?.cast_num;
    if (!cast_num) return res.status(404).json({ error: 'No Haifa cast table configured' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const dateParams = [
      { name: 'from', type: sql.DateTime, value: new Date(from) },
      { name: 'to',   type: sql.DateTime, value: new Date(to)   },
    ];

    const SENSOR_COLS = `
         Sensor11_O2_mgL, Sensor11_temperature, Sensor11_O2_percent,
         Sensor21_pH, Sensor21_temperature, Sensor21_ORP,
         Sensor12_O2_mgL, Sensor12_temperature, Sensor12_O2_percent,
         Sensor23_pH, Sensor23_temperature, Sensor23_ORP,
         Sensor24_pH, Sensor24_temperature, Sensor24_ORP,
         Sensor25_pH, Sensor25_temperature, Sensor25_ORP,
         VL1_N, VL2_N, VL3_N,
         AL1, AL2, AL3,
         KWL1, KWL2, KWL3, KWTOT`;

    // ── chart mode: hourly AVG aggregation ─────────────────────────────────
    if (mode === 'chart') {
      const result = await runQuery(
        `SELECT
           DATEADD(MINUTE, (DATEDIFF(MINUTE, 0, [timestamp]) / 30) * 30, 0) AS [timestamp],
           AVG(CAST(Sensor11_O2_mgL        AS FLOAT)) AS Sensor11_O2_mgL,
           AVG(CAST(Sensor11_temperature   AS FLOAT)) AS Sensor11_temperature,
           AVG(CAST(Sensor11_O2_percent    AS FLOAT)) AS Sensor11_O2_percent,
           AVG(CAST(Sensor21_pH            AS FLOAT)) AS Sensor21_pH,
           AVG(CAST(Sensor21_temperature   AS FLOAT)) AS Sensor21_temperature,
           AVG(CAST(Sensor21_ORP           AS FLOAT)) AS Sensor21_ORP,
           AVG(CAST(Sensor12_O2_mgL        AS FLOAT)) AS Sensor12_O2_mgL,
           AVG(CAST(Sensor12_temperature   AS FLOAT)) AS Sensor12_temperature,
           AVG(CAST(Sensor12_O2_percent    AS FLOAT)) AS Sensor12_O2_percent,
           AVG(CAST(Sensor23_pH            AS FLOAT)) AS Sensor23_pH,
           AVG(CAST(Sensor23_temperature   AS FLOAT)) AS Sensor23_temperature,
           AVG(CAST(Sensor23_ORP           AS FLOAT)) AS Sensor23_ORP,
           AVG(CAST(Sensor24_pH            AS FLOAT)) AS Sensor24_pH,
           AVG(CAST(Sensor24_temperature   AS FLOAT)) AS Sensor24_temperature,
           AVG(CAST(Sensor24_ORP           AS FLOAT)) AS Sensor24_ORP,
           AVG(CAST(Sensor25_pH            AS FLOAT)) AS Sensor25_pH,
           AVG(CAST(Sensor25_temperature   AS FLOAT)) AS Sensor25_temperature,
           AVG(CAST(Sensor25_ORP           AS FLOAT)) AS Sensor25_ORP,
           AVG(CAST(VL1_N  AS FLOAT)) AS VL1_N,
           AVG(CAST(VL2_N  AS FLOAT)) AS VL2_N,
           AVG(CAST(VL3_N  AS FLOAT)) AS VL3_N,
           AVG(CAST(AL1    AS FLOAT)) AS AL1,
           AVG(CAST(AL2    AS FLOAT)) AS AL2,
           AVG(CAST(AL3    AS FLOAT)) AS AL3,
           AVG(CAST(KWL1   AS FLOAT)) AS KWL1,
           AVG(CAST(KWL2   AS FLOAT)) AS KWL2,
           AVG(CAST(KWL3   AS FLOAT)) AS KWL3,
           AVG(CAST(KWTOT  AS FLOAT)) AS KWTOT
         FROM ${tableName}
         WHERE [timestamp] >= @from AND [timestamp] <= @to
         GROUP BY DATEADD(MINUTE, (DATEDIFF(MINUTE, 0, [timestamp]) / 30) * 30, 0)
         ORDER BY [timestamp] ASC`,
        dateParams
      );
      logger.info("Haifa chart query OK", { table: tableName, rows: result.recordset.length, user: user_name });
      return res.json(result.recordset);
    }

    // ── table mode: server-side paginated raw rows ──────────────────────────
    if (mode === 'table') {
      const pageNum  = Math.max(0, parseInt(page  || '0',  10));
      const pageSize = Math.min(200, Math.max(1, parseInt(size || '50', 10)));
      const offset   = pageNum * pageSize;

      const [countResult, dataResult] = await Promise.all([
        runQuery(
          `SELECT COUNT(*) AS total FROM ${tableName}
           WHERE [timestamp] >= @from AND [timestamp] <= @to`,
          dateParams
        ),
        runQuery(
          `SELECT [timestamp], ${SENSOR_COLS}
           FROM ${tableName}
           WHERE [timestamp] >= @from AND [timestamp] <= @to
           ORDER BY [timestamp] DESC
           OFFSET @offset ROWS FETCH NEXT @size ROWS ONLY`,
          [
            ...dateParams,
            { name: 'offset', type: sql.Int, value: offset   },
            { name: 'size',   type: sql.Int, value: pageSize },
          ]
        ),
      ]);

      const total = countResult.recordset[0]?.total ?? 0;
      logger.info("Haifa table query OK", { table: tableName, page: pageNum, rows: dataResult.recordset.length, total, user: user_name });
      return res.json({
        data:  dataResult.recordset,
        total,
      });
    }

    // ── export mode (or no mode): all raw rows up to 5000 ──────────────────
    const result = await runQuery(
      `SELECT TOP 5000 [timestamp], ${SENSOR_COLS}
       FROM ${tableName}
       WHERE [timestamp] >= @from AND [timestamp] <= @to
       ORDER BY [timestamp] ASC`,
      dateParams
    );
    logger.info("Haifa export query OK", { table: tableName, rows: result.recordset.length, user: user_name });
    res.json(result.recordset);

  } catch (err: any) {
    logger.error("Failed to fetch haifa history", { error: err.message, mode: req.query.mode, user: req.user?.user_name });
    res.status(500).json({ error: "Failed to fetch haifa history" });
  }
});

// ── Energy schema helpers ────────────────────────────────────────────────────
// cast tables come in two schemas:
//   old: ts_getway, kw_t1/t2/t3, fv, rssi, type, kt30d, kt60d
//   new: ts, t1/t2/t3, meter_type  (cast_15+)
// We detect once per cast_num and cache the result.
interface CastSchema { ts: 'new' | 'old'; hz: boolean; }
const castSchemaCache = new Map<number, CastSchema>();

async function detectCastSchema(castNum: number, customersDb: string): Promise<CastSchema> {
  if (castSchemaCache.has(castNum)) return castSchemaCache.get(castNum)!;
  const r = await runQuery(
    `SELECT
       SUM(CASE WHEN COLUMN_NAME = 'ts' THEN 1 ELSE 0 END) AS has_ts,
       SUM(CASE WHEN COLUMN_NAME = 'hz' THEN 1 ELSE 0 END) AS has_hz
     FROM [${customersDb}].INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tbl`,
    [{ name: 'tbl', type: sql.NVarChar, value: `cast_${castNum}` }]
  );
  const schema: CastSchema = {
    ts: r.recordset[0].has_ts > 0 ? 'new' : 'old',
    hz: r.recordset[0].has_hz > 0,
  };
  castSchemaCache.set(castNum, schema);
  return schema;
}

function getEnergyFields(schema: CastSchema): string {
  const hzField = schema.hz ? ", hz" : ", NULL AS hz";
  return schema.ts === 'new'
    ? [
        "Device_ID", "meter_type",
        "vl1n", "vl2n", "vl3n", "AL1", "AL2", "AL3", "kwtot",
        "ts    AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS ts",
        "ts_em AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS ts_em",
        "t1", "t2", "t3"
      ].join(", ") + hzField
    : [
        "Device_ID", "NULL AS meter_type",
        "vl1n", "vl2n", "vl3n", "AL1", "AL2", "AL3", "kwtot",
        "ts_getway AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS ts",
        "ts_em     AT TIME ZONE 'Israel Standard Time' AT TIME ZONE 'UTC' AS ts_em",
        "kw_t1 AS t1", "kw_t2 AS t2", "kw_t3 AS t3"
      ].join(", ") + hzField;
}

function getTsCol(schema: CastSchema) { return schema.ts === 'new' ? 'ts' : 'ts_getway'; }
// ────────────────────────────────────────────────────────────────────────────

// GET /api/energy/latest/all — returns latest record for every device the caller can see (single DB round-trip)
app.get("/api/energy/latest/all", authenticateToken, energyLimiter, energySustainedLimiter, async (req: any, res) => {
  const { role, user_name } = req.user;

  if (isDemoMode) {
    let devices = [...DEMO_DEVICES];
    if (role === 'user' && user_name) {
      devices = devices.filter(d => d.user_name === user_name);
    }
    const result: Record<number, any> = {};
    devices.forEach(d => {
      const record = DEMO_RECORDS.find(r => r.Device_ID === d.id_user);
      if (record) {
        result[d.id_user] = {
          ...record,
          ts_getway: new Date().toISOString(),
          kwtot: record.kwtot + (Math.random() * 2 - 1),
          AL1: record.AL1 + (Math.random() * 0.5 - 0.25),
          AL2: record.AL2 + (Math.random() * 0.5 - 0.25),
          AL3: record.AL3 + (Math.random() * 0.5 - 0.25),
        };
      }
    });
    return res.json(result);
  }

  try {
    // Step 1: get device IDs + cast_num + hw_id this user may access
    let deviceQuery = `SELECT id_user, cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')} WHERE application = 'Energy'`;
    const deviceParams: any[] = [];
    if (role === 'user' && user_name) {
      deviceQuery += ` AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`;
      deviceParams.push({ name: 'user_name', type: sql.NVarChar, value: user_name as string });
    }
    const deviceResult = await runQuery(deviceQuery, deviceParams);
    if (deviceResult.recordset.length === 0) return res.json({});

    // Step 2: group devices by cast_num using hw_id; keep hw_id→id_user map for result keying
    const byCast: Record<number, number[]> = {};
    const hwToIdUser: Record<number, number> = {};
    deviceResult.recordset.forEach((r: any) => {
      if (!r.cast_num) return;
      if (!byCast[r.cast_num]) byCast[r.cast_num] = [];
      byCast[r.cast_num].push(r.hw_id);
      hwToIdUser[r.hw_id] = r.id_user;
    });

    // Step 3: query each cast table and merge results, keyed by id_user (what the frontend expects)
    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const result: Record<number, any> = {};
    for (const [castNum, hwIds] of Object.entries(byCast)) {
      const schema = await detectCastSchema(Number(castNum), customersDb);
      const fields = getEnergyFields(schema);
      const tsCol  = getTsCol(schema);
      const tableName = `[${customersDb}].[dbo].[cast_${castNum}]`;
      const idList = hwIds.join(',');
      const rows = await runQuery(
        `SELECT * FROM (
          SELECT ${fields}, ROW_NUMBER() OVER (PARTITION BY Device_ID ORDER BY ${tsCol} DESC) AS rn
          FROM ${tableName}
          WHERE Device_ID IN (${idList}) AND (vl1n > 0 OR kwtot > 0)
        ) t WHERE rn = 1`,
        []
      );
      const cntRows = await runQuery(
        `SELECT Device_ID, COUNT(*) AS cnt FROM ${tableName}
         WHERE Device_ID IN (${idList}) AND ${tsCol} >= DATEADD(hour, -1, GETDATE())
         GROUP BY Device_ID`,
        []
      );
      const cntByHwId: Record<number, number> = {};
      cntRows.recordset.forEach((r: any) => { cntByHwId[r.Device_ID] = r.cnt; });
      rows.recordset.forEach((row: any) => {
        const idUser = hwToIdUser[row.Device_ID];
        if (idUser != null) result[idUser] = { ...row, msgsLastHour: cntByHwId[row.Device_ID] ?? 0 };
      });
    }
    logger.info("Bulk latest energy OK", { devices: Object.keys(result).length, user: user_name, role });
    res.json(result);
  } catch (err: any) {
    logger.error("Failed to fetch bulk latest energy", { error: err.message, user: req.user?.user_name, route: "GET /api/energy/latest/all" });
    res.status(500).json({ error: "Failed to fetch bulk latest energy data" });
  }
});

// GET /api/energy/latest/:device_id
app.get("/api/energy/latest/:device_id", authenticateToken, energyLimiter, energySustainedLimiter, async (req: any, res) => {
  const { device_id } = req.params;
  if (isDemoMode) {
    const record = DEMO_RECORDS.find(r => r.Device_ID === parseInt(device_id));
    if (!record) return res.json(null);
    
    // Add some random jitter to make it look "live"
    return res.json({
      ...record,
      ts_getway: new Date().toISOString(),
      kwtot: record.kwtot + (Math.random() * 2 - 1),
      AL1: record.AL1 + (Math.random() * 0.5 - 0.25),
      AL2: record.AL2 + (Math.random() * 0.5 - 0.25),
      AL3: record.AL3 + (Math.random() * 0.5 - 0.25)
    });
  }
  try {
    const { role, user_name } = req.user;
    const castLookup = await runQuery(
      role === 'admin'
        ? `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @device_id`
        : `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @device_id AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`,
      role === 'admin'
        ? [{ name: 'device_id', type: sql.Int, value: device_id }]
        : [{ name: 'device_id', type: sql.Int, value: device_id }, { name: 'user_name', type: sql.NVarChar, value: user_name }]
    );
    const cast_num = castLookup.recordset[0]?.cast_num;
    const hw_id = castLookup.recordset[0]?.hw_id;
    if (!cast_num) return res.status(404).json({ error: 'Device not found' });
    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;

    const schema = await detectCastSchema(Number(cast_num), customersDb);
    const fields = getEnergyFields(schema);
    const tsCol  = getTsCol(schema);
    const result = await runQuery(
      `SELECT TOP 1 ${fields} FROM ${tableName} WHERE Device_ID = @hw_id AND (vl1n > 0 OR kwtot > 0) ORDER BY ${tsCol} DESC`,
      [{ name: "hw_id", type: sql.Int, value: hw_id }]
    );

    const record = result.recordset[0] || null;
    logger.info("Latest energy query OK", { device_id, hw_id, found: !!record, user: req.user?.user_name });
    res.json(record);
  } catch (err: any) {
    logger.error("Failed to fetch latest energy data", { device_id, error: err.message, user: req.user?.user_name, route: "GET /api/energy/latest/:device_id" });
    res.status(500).json({ error: "Failed to fetch latest energy data" });
  }
});

// GET /api/energy/history/:device_id?hours=24&start=...&end=...
app.get("/api/energy/history/:device_id", authenticateToken, energyLimiter, energySustainedLimiter, async (req: any, res) => {
  const { device_id } = req.params;
  const hours = parseInt(req.query.hours as string);
  const limit = parseInt(req.query.limit as string) || 1000;
  const startStr = req.query.start as string;
  const endStr = req.query.end as string;

  // Validate time range - max 365 days
  const MAX_DAYS = 365;
  if (startStr && endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_DAYS) {
      return res.status(400).json({ 
        error: `טווח זמן מקסימלי הוא ${MAX_DAYS} ימים. ביקשת ${Math.round(diffDays)} ימים.` 
      });
    }
    if (diffDays < 0) {
      return res.status(400).json({ error: 'תאריך התחלה חייב להיות לפני תאריך סיום' });
    }
  }

  // Cap hours to max 365 days
  const MAX_HOURS = MAX_DAYS * 24;
  if (hours && hours > MAX_HOURS) {
    return res.status(400).json({ 
      error: `טווח זמן מקסימלי הוא ${MAX_DAYS} ימים` 
    });
  }

  // Cap limit to 50000 rows
  const MAX_ROWS = 50000;
  const safeLimitVal = Math.min(limit, MAX_ROWS);

  if (isDemoMode) {
    const record = DEMO_RECORDS.find(r => r.Device_ID === parseInt(device_id));
    if (!record) return res.json([]);
    
    const history = [];
    const now = new Date();
    
    let startTime: Date;
    let endTime: Date;

    if (startStr && endStr) {
      startTime = new Date(startStr);
      endTime = new Date(endStr);
    } else {
      const h = hours || 168;
      endTime = now;
      startTime = new Date(now.getTime() - h * 3600000);
    }

    const count = Math.min(safeLimitVal, 500);
    const duration = endTime.getTime() - startTime.getTime();

    for (let i = 0; i < count; i++) {
      const time = new Date(startTime.getTime() + (i * duration / count));
      history.push({
        ...record,
        ts_getway: time.toISOString(),
        kwtot: record.kwtot - (count - 1 - i) * 2 + (Math.random() * 2),
        kw_t1: record.kw_t1 - (count - 1 - i) * 1,
        kw_t3: record.kw_t3 - (count - 1 - i) * 0.5,
      });
    }
    return res.json(history.reverse()); // Newest first
  }
  try {
    const { role, user_name } = req.user;
    const castLookup = await runQuery(
      role === 'admin'
        ? `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @device_id`
        : `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @device_id AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`,
      role === 'admin'
        ? [{ name: 'device_id', type: sql.Int, value: device_id }]
        : [{ name: 'device_id', type: sql.Int, value: device_id }, { name: 'user_name', type: sql.NVarChar, value: user_name }]
    );
    const cast_num = castLookup.recordset[0]?.cast_num;
    const hw_id = castLookup.recordset[0]?.hw_id;
    if (!cast_num) return res.status(404).json({ error: 'Device not found' });
    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;

    const schema = await detectCastSchema(Number(cast_num), customersDb);
    const fields = getEnergyFields(schema);
    const tsCol  = getTsCol(schema);

    let query = `SELECT TOP (@limit) ${fields} FROM ${tableName} WHERE Device_ID = @hw_id`;
    const params: { name: string, type: any, value: any }[] = [
      { name: "hw_id", type: sql.Int, value: hw_id },
      { name: "limit", type: sql.Int, value: safeLimitVal }
    ];

    if (startStr && endStr) {
      query += ` AND ${tsCol} >= @start AND ${tsCol} <= @end`;
      params.push({ name: "start", type: sql.DateTime, value: new Date(startStr) });
      params.push({ name: "end", type: sql.DateTime, value: new Date(endStr) });
    } else {
      const h = hours || 168;
      query += ` AND ${tsCol} >= DATEADD(hour, -@hours, GETDATE())`;
      params.push({ name: "hours", type: sql.Int, value: h });
    }

    query += ` ORDER BY ${tsCol} DESC`;
    
    const queryStartTime = Date.now();
    const result = await runQuery(query, params);
    const duration = Date.now() - queryStartTime;
    
    if (duration > 3000) {
      logger.warn("Slow query detected", { device_id, duration: duration + "ms", rows: result.recordset.length });
    }
    
    logger.info("Energy history query", { 
      device_id, 
      rows: result.recordset.length, 
      user: req.user?.email 
    });
    
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch energy history", { device_id, error: err.message, route: "GET /api/energy/history/:device_id" });
    res.status(500).json({ error: "Failed to fetch energy history" });
  }
});

// GET /api/energy/range-edges/:device_id?start=...&end=...
// Returns only the first and last reading in the date range — used by the calculator.
app.get("/api/energy/range-edges/:device_id", authenticateToken, energyLimiter, async (req: any, res) => {
  const { device_id } = req.params;
  const startStr = req.query.start as string;
  const endStr   = req.query.end   as string;
  if (!startStr || !endStr) return res.status(400).json({ error: 'start and end are required' });

  if (isDemoMode) {
    const record = DEMO_RECORDS.find(r => r.Device_ID === parseInt(device_id));
    if (!record) return res.json({ first: null, last: null });
    const start = new Date(startStr);
    const end   = new Date(endStr);
    return res.json({
      first: { ...record, ts: start.toISOString(), kwtot: record.kwtot - 200, t1: (record.t1 || 0) - 160, t2: 0, t3: (record.t3 || 0) - 40 },
      last:  { ...record, ts: end.toISOString() }
    });
  }

  try {
    const { role, user_name } = req.user;
    const castLookup = await runQuery(
      role === 'admin'
        ? `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @device_id`
        : `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @device_id AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`,
      role === 'admin'
        ? [{ name: 'device_id', type: sql.Int, value: device_id }]
        : [{ name: 'device_id', type: sql.Int, value: device_id }, { name: 'user_name', type: sql.NVarChar, value: user_name }]
    );
    const cast_num = castLookup.recordset[0]?.cast_num;
    const hw_id    = castLookup.recordset[0]?.hw_id;
    if (!cast_num) return res.status(404).json({ error: 'Device not found' });

    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName   = `[${customersDb}].[dbo].[cast_${cast_num}]`;
    const schema    = await detectCastSchema(Number(cast_num), customersDb);
    const tsCol     = getTsCol(schema);
    const fields    = getEnergyFields(schema);
    const baseWhere = `WHERE Device_ID = @hw_id AND ${tsCol} >= @start AND ${tsCol} <= @end`;
    const params = [
      { name: 'hw_id',  type: sql.Int,      value: hw_id },
      { name: 'start',  type: sql.DateTime,  value: new Date(startStr) },
      { name: 'end',    type: sql.DateTime,  value: new Date(endStr) }
    ];

    const [firstRes, lastRes] = await Promise.all([
      runQuery(`SELECT TOP 1 ${fields} FROM ${tableName} ${baseWhere} ORDER BY ${tsCol} ASC`,  params),
      runQuery(`SELECT TOP 1 ${fields} FROM ${tableName} ${baseWhere} ORDER BY ${tsCol} DESC`, params)
    ]);

    res.json({
      first: firstRes.recordset[0] ?? null,
      last:  lastRes.recordset[0]  ?? null
    });
  } catch (err: any) {
    logger.error("Failed to fetch range edges", { device_id, error: err.message });
    res.status(500).json({ error: "Failed to fetch range edges" });
  }
});

// GET /api/energy/daily/:device_id
app.get("/api/energy/daily/:device_id", authenticateToken, energyLimiter, energySustainedLimiter, async (req: any, res) => {
  const { device_id } = req.params;
  if (isDemoMode) {
    // Return some mock daily data
    const data = [];
    const now = new Date();
    for (let i = 30; i > 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      data.push({
        time: date.toISOString(),
        total: 50 + Math.random() * 20,
        t1: 20 + Math.random() * 10,
        t2: 10 + Math.random() * 5,
        t3: 20 + Math.random() * 10
      });
    }
    return res.json(data);
  }
  try {
    const { role, user_name } = req.user;
    const castLookup = await runQuery(
      role === 'admin'
        ? `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @device_id`
        : `SELECT TOP 1 cast_num, ISNULL(device_id, id_user) AS hw_id FROM ${getTableName('Custumer', 'customers')} WHERE id_user = @device_id AND CAST(user_name AS NVARCHAR(MAX)) = @user_name`,
      role === 'admin'
        ? [{ name: 'device_id', type: sql.Int, value: device_id }]
        : [{ name: 'device_id', type: sql.Int, value: device_id }, { name: 'user_name', type: sql.NVarChar, value: user_name }]
    );
    const cast_num = castLookup.recordset[0]?.cast_num;
    const hw_id = castLookup.recordset[0]?.hw_id;
    if (!cast_num) return res.status(404).json({ error: 'Device not found' });
    const customersDb = sqlConfig.customersDatabase || sqlConfig.database;
    const tableName = `[${customersDb}].[dbo].[cast_${cast_num}]`;

    const schema = await detectCastSchema(cast_num, customersDb);
    const tsCol  = getTsCol(schema);
    const t1Col  = schema.ts === 'new' ? 't1'    : 'kw_t1';
    const t2Col  = schema.ts === 'new' ? 't2'    : 'kw_t2';
    const t3Col  = schema.ts === 'new' ? 't3'    : 'kw_t3';

    const query = `
      WITH DailyReadings AS (
          SELECT
              ${tsCol} AS ts_col,
              kwtot,
              ${t1Col} AS t1,
              ${t2Col} AS t2,
              ${t3Col} AS t3,
              ROW_NUMBER() OVER (PARTITION BY CAST(${tsCol} AS DATE)
                                ORDER BY ABS(DATEPART(HOUR, ${tsCol}) - 6)) as rn
          FROM ${tableName}
          WHERE ${tsCol} >= DATEADD(DAY, -32, CAST(CAST(GETDATE() AS DATE) AS DATETIME))
          AND ${tsCol} < DATEADD(DAY, 1, CAST(CAST(GETDATE() AS DATE) AS DATETIME))
          AND Device_ID = @hw_id
      ),
      DailyTotals AS (
          SELECT
              CAST(ts_col AS DATE) AS time,
              kwtot, t1, t2, t3,
              LAG(kwtot) OVER (ORDER BY ts_col) AS prev_kwtot,
              LAG(t1) OVER (ORDER BY ts_col) AS prev_t1,
              LAG(t2) OVER (ORDER BY ts_col) AS prev_t2,
              LAG(t3) OVER (ORDER BY ts_col) AS prev_t3
          FROM DailyReadings
          WHERE rn = 1
      )
      SELECT
          CAST(time AS DATETIME) AS time,
          ROUND(ISNULL(kwtot - prev_kwtot, 0), 1) AS total,
          ROUND(ISNULL(t1 - prev_t1, 0), 1) AS t1,
          ROUND(ISNULL(t2 - prev_t2, 0), 1) AS t2,
          ROUND(ISNULL(t3 - prev_t3, 0), 1) AS t3
      FROM DailyTotals
      WHERE prev_kwtot IS NOT NULL
      ORDER BY time
    `;
    const queryStartTime = Date.now();
    const result = await runQuery(query, [{ name: "hw_id", type: sql.Int, value: hw_id }]);
    const duration = Date.now() - queryStartTime;

    if (duration > 3000) {
      logger.warn("Slow query detected", { device_id, duration: duration + "ms", rows: result.recordset.length });
    }
    
    res.json(result.recordset);
  } catch (err: any) {
    logger.error("Failed to fetch daily energy", { device_id, error: err.message, route: "GET /api/energy/daily/:device_id" });
    res.status(500).json({ error: "Failed to fetch daily energy" });
  }
});

process.on('uncaughtException', (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  logger.error("Unhandled rejection", { error: reason?.message || String(reason) });
});

async function startServer() {
  // Attempt initial SQL connection if not in Demo Mode
  if (!isDemoMode) {
    logger.info("Attempting initial SQL connection...");
    try {
      // Use fewer retries for initial startup check to avoid hanging
      await getPool(sqlConfig, 2, 2000);
      logger.info("Initial SQL connection successful.");
    } catch (err: any) {
      logger.warn("Falling back to Demo Mode", { reason: err.message });
      isDemoMode = true;
    }
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Mode: ${isDemoMode ? 'DEMO' : 'LIVE'}`);
  });

  setInterval(() => {
    const usage = process.memoryUsage();
    const heapMB = Math.round(usage.heapUsed / 1024 / 1024);
    const rssMB = Math.round(usage.rss / 1024 / 1024);
    if (heapMB > 200) {
      logger.warn("High memory usage", { heapMB, rssMB });
    }
    logger.info("Memory check", { heapMB, rssMB });
  }, 5 * 60 * 1000); // every 5 minutes
}

startServer();
