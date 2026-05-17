# Galoz IoT — Database Reference

---

## Create Databases & Tables (MSSQL Template)

Paste this into MSSQL Query window to generate the full database structure from scratch.

```sql
-- ============================================================
--  STEP 1 — Create Databases
-- ============================================================

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'Energy')
    CREATE DATABASE [Energy];
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'Galoziot')
    CREATE DATABASE [Galoziot];
GO


-- ============================================================
--  STEP 2 — Energy readings table
--  Database: Energy
-- ============================================================

USE [Energy];
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Energy'
)
BEGIN
    CREATE TABLE [dbo].[Energy] (
        [id]         INT           IDENTITY(1,1) NOT NULL,
        [Device_ID]  INT           NOT NULL,
        [ts_getway]  DATETIME      NOT NULL DEFAULT GETDATE(),
        [ts_em]      DATETIME      NULL,
        [type]       INT           NULL,
        [fv]         INT           NULL,
        [rssi]       INT           NULL,
        [vl1n]       FLOAT         NULL,
        [vl2n]       FLOAT         NULL,
        [vl3n]       FLOAT         NULL,
        [AL1]        FLOAT         NULL,
        [AL2]        FLOAT         NULL,
        [AL3]        FLOAT         NULL,
        [kwtot]      FLOAT         NULL,
        [kw_t1]      FLOAT         NULL,
        [kw_t2]      FLOAT         NULL,
        [kw_t3]      FLOAT         NULL,
        [kt30d]      FLOAT         NULL,
        [kt60d]      FLOAT         NULL,
        CONSTRAINT [PK_Energy] PRIMARY KEY CLUSTERED ([id] ASC)
    );

    -- Index for fast per-device time-range queries
    CREATE NONCLUSTERED INDEX [IX_Energy_Device_ts]
        ON [dbo].[Energy] ([Device_ID] ASC, [ts_getway] DESC);
END
GO


-- ============================================================
--  STEP 3 — Users / Devices table
--  Database: Galoziot
-- ============================================================

USE [Galoziot];
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Custumer'
)
BEGIN
    CREATE TABLE [dbo].[Custumer] (
        [id_user]       INT            NOT NULL,
        [user_name]     NVARCHAR(100)  NOT NULL,
        [site_name]     NVARCHAR(255)  NULL,
        [location]      NVARCHAR(255)  NULL,
        [contact_name]  NVARCHAR(255)  NULL,
        [mobile_phone]  NVARCHAR(20)   NULL,
        [email]         VARCHAR(255)   NULL,
        [password]      NVARCHAR(255)  NULL,          -- bcrypt hash
        [role]          VARCHAR(50)    NOT NULL DEFAULT 'user',   -- 'admin' | 'user'
        [application]   VARCHAR(50)    NOT NULL DEFAULT 'energy', -- 'energy' | 'Weighing' | 'Ocio'
        [date_exp]      DATE           NULL,
        [Alerts]        BIT            NOT NULL DEFAULT 0,
        [cast_num]      INT            NULL,           -- links to cast_{n} table
        [unit]          VARCHAR(20)    NULL,
        [min]           FLOAT          NULL,
        [max]           FLOAT          NULL,
        [alert_low]     FLOAT          NULL,
        [alert_high]    FLOAT          NULL,
        [widget_type]   VARCHAR(20)    NULL,           -- 'gauge' | 'tank' | 'silo'
        [Display_Graph] TINYINT        NOT NULL DEFAULT 1,
        CONSTRAINT [PK_Custumer] PRIMARY KEY CLUSTERED ([id_user] ASC)
    );
END
GO


-- ============================================================
--  STEP 4 — Cast table template (Weighing / Ocio)
--  Database: Galoziot
--  Replace cast_1 with cast_{n} where n = cast_num from Custumer
-- ============================================================

USE [Galoziot];
GO

-- Change the number (1) in every occurrence below to match your cast_num
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'cast_1'
)
BEGIN
    CREATE TABLE [dbo].[cast_1] (
        [id]        INT       IDENTITY(1,1) NOT NULL,
        [device_id] INT       NOT NULL,
        [ts]        DATETIME  NOT NULL DEFAULT GETDATE(),
        [lv]        INT       NULL,       -- level in mm        (Ocio)
        [vol]       INT       NULL,       -- liters (Ocio) / weight value (Weighing)
        [rssi]      SMALLINT  NULL,
        [st]        TINYINT   NOT NULL DEFAULT 0,   -- 0 = OK, 1 = Alert
        CONSTRAINT [PK_cast_1] PRIMARY KEY CLUSTERED ([id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_cast_1_device_ts]
        ON [dbo].[cast_1] ([device_id] ASC, [ts] DESC);
END
GO


-- ============================================================
--  STEP 5 — Seed: first admin user
--  Replace values below before running
-- ============================================================

USE [Galoziot];
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[Custumer] WHERE id_user = 1)
BEGIN
    INSERT INTO [dbo].[Custumer]
        (id_user, user_name, site_name, email, password, role, application, Alerts, Display_Graph)
    VALUES
        (1, 'admin', 'Main Site', 'admin@yourdomain.com',
         -- Generate bcrypt hash at: https://bcrypt-generator.com (rounds=10)
         '$2b$10$REPLACE_WITH_REAL_BCRYPT_HASH',
         'admin', 'energy', 0, 1);
END
GO
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND                         │
│         React + TypeScript + Tailwind (Vite)        │
│   Dashboard · GraphPage · WeighingPage · OcioPage   │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP + JWT (8h)
┌──────────────────────▼──────────────────────────────┐
│                    BACKEND                          │
│              Express (server.ts)                    │
│         Auth: JWT + bcrypt · Rate limiting          │
└──────────┬───────────────────────────┬──────────────┘
           │                           │
┌──────────▼──────────┐   ┌────────────▼──────────────┐
│   DB: Energy        │   │   DB: Galoziot            │
│   (SQL_DATABASE)    │   │   (SQL_CUSTOMERS_DATABASE) │
│                     │   │                           │
│  [Energy].[dbo]     │   │  [Galoziot].[dbo]         │
│  .[Energy]          │   │  .[Custumer]              │
│                     │   │  .[cast_{n}]              │
└─────────────────────┘   └───────────────────────────┘
```

---

## Table 1 — `[Energy].[dbo].[Energy]`

**Database env var:** `SQL_DATABASE` (default: `Energy`)  
**Purpose:** Raw readings from energy meters — one row per transmission

### Columns

| Column | Type | Description |
|--------|------|-------------|
| `Device_ID` | INT | Meter identifier (links to `Custumer.id_user`) |
| `ts_getway` | DATETIME | Timestamp when gateway received the reading |
| `ts_em` | DATETIME | Timestamp on the energy meter itself |
| `kwtot` | FLOAT | Cumulative total kWh (ever-increasing counter) |
| `kw_t1` | FLOAT | Cumulative kWh — Tariff T1 (peak hours) |
| `kw_t2` | FLOAT | Cumulative kWh — Tariff T2 (shoulder) |
| `kw_t3` | FLOAT | Cumulative kWh — Tariff T3 (off-peak) |
| `kt30d` | FLOAT | kWh in last 30 days |
| `kt60d` | FLOAT | kWh in last 60 days |
| `vl1n` | FLOAT | Voltage L1-N (Volts) |
| `vl2n` | FLOAT | Voltage L2-N (Volts) |
| `vl3n` | FLOAT | Voltage L3-N (Volts) |
| `AL1` | FLOAT | Current L1 (Amps) |
| `AL2` | FLOAT | Current L2 (Amps) |
| `AL3` | FLOAT | Current L3 (Amps) |
| `rssi` | INT | WiFi signal strength (dBm) |
| `type` | INT | Device firmware type |
| `fv` | INT | Firmware version |

> **Important:** `kwtot` is a cumulative counter. To get daily consumption, subtract first reading from last reading of the day.

### Quick SQL Queries

```sql
-- Latest reading for a device
SELECT TOP 1
    Device_ID, ts_getway, kwtot, kw_t1, kw_t2, kw_t3,
    vl1n, vl2n, vl3n, AL1, AL2, AL3, rssi
FROM [Energy].[dbo].[Energy]
WHERE Device_ID = 15
ORDER BY ts_getway DESC;

-- All readings in a date range
SELECT Device_ID, ts_getway, kwtot, kw_t1, kw_t2, kw_t3
FROM [Energy].[dbo].[Energy]
WHERE Device_ID = 15
  AND ts_getway >= '2025-04-01'
  AND ts_getway <= '2025-04-30 23:59:59'
ORDER BY ts_getway ASC;

-- Daily consumption (delta per day) for one device
WITH DailyReadings AS (
    SELECT
        CAST(ts_getway AS DATE) AS day,
        kwtot, kw_t1, kw_t2, kw_t3,
        ROW_NUMBER() OVER (PARTITION BY CAST(ts_getway AS DATE) ORDER BY ts_getway ASC)  AS rn_first,
        ROW_NUMBER() OVER (PARTITION BY CAST(ts_getway AS DATE) ORDER BY ts_getway DESC) AS rn_last
    FROM [Energy].[dbo].[Energy]
    WHERE Device_ID = 15
      AND ts_getway >= '2025-04-01'
)
SELECT
    day,
    MAX(CASE WHEN rn_last = 1 THEN kwtot END) -
    MIN(CASE WHEN rn_first = 1 THEN kwtot END) AS kwh_consumed
FROM DailyReadings
GROUP BY day
ORDER BY day;

-- Devices with no signal in last 60 minutes
SELECT DISTINCT Device_ID, MAX(ts_getway) AS last_seen
FROM [Energy].[dbo].[Energy]
GROUP BY Device_ID
HAVING MAX(ts_getway) < DATEADD(MINUTE, -60, GETDATE());
```

---

## Table 2 — `[Galoziot].[dbo].[Custumer]`

**Database env var:** `SQL_CUSTOMERS_DATABASE` (default: `Galoziot`)  
**Purpose:** All users and their linked devices/meters

### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id_user` | INT | Primary key — also used as `Device_ID` in Energy table |
| `user_name` | NVARCHAR | Login username |
| `email` | VARCHAR | User email |
| `password` | NVARCHAR | bcrypt hashed password |
| `role` | VARCHAR | `'admin'` or `'user'` |
| `application` | VARCHAR | `'energy'` · `'Weighing'` · `'Ocio'` |
| `site_name` | VARCHAR | Display name for the meter/site |
| `location` | VARCHAR | Physical location description |
| `contact_name` | VARCHAR | Contact person name |
| `mobile_phone` | VARCHAR | Contact phone |
| `date_exp` | DATE | Account expiry date |
| `Alerts` | BIT | Alerts enabled (1/0) |
| `cast_num` | INT | Links to `cast_{n}` table (Weighing & Ocio only) |
| `unit` | VARCHAR | Unit for widget display (e.g. `kg`, `%`, `m³`) |
| `min` | FLOAT | Widget min value |
| `max` | FLOAT | Widget max value |
| `alert_low` | FLOAT | Yellow alert threshold |
| `alert_high` | FLOAT | Red alert threshold |
| `widget_type` | VARCHAR | `'gauge'` · `'tank'` · `'silo'` |
| `Display_Graph` | BIT | Show graph on dashboard (1/0) |

### Quick SQL Queries

```sql
-- All energy meter users
SELECT id_user, user_name, site_name, location, role, Alerts, date_exp
FROM [Galoziot].[dbo].[Custumer]
WHERE application = 'energy'
ORDER BY id_user;

-- All weighing users with their cast table number
SELECT id_user, user_name, site_name, cast_num, unit, min, max, alert_low, alert_high, widget_type
FROM [Galoziot].[dbo].[Custumer]
WHERE application = 'Weighing'
ORDER BY id_user;

-- All Ocio users
SELECT id_user, user_name, site_name, cast_num, unit, min, max, alert_low, alert_high, widget_type
FROM [Galoziot].[dbo].[Custumer]
WHERE application = 'Ocio'
ORDER BY id_user;

-- Find a user by username
SELECT id_user, user_name, email, role, application, cast_num
FROM [Galoziot].[dbo].[Custumer]
WHERE CAST(user_name AS NVARCHAR(MAX)) = 'john';

-- All admin users
SELECT id_user, user_name, email
FROM [Galoziot].[dbo].[Custumer]
WHERE RTRIM(role) = 'admin';

-- Accounts expiring in next 30 days
SELECT id_user, user_name, email, date_exp
FROM [Galoziot].[dbo].[Custumer]
WHERE date_exp BETWEEN GETDATE() AND DATEADD(DAY, 30, GETDATE())
ORDER BY date_exp;
```

---

## Table 3 — `[Galoziot].[dbo].[cast_{n}]`

**Database env var:** `SQL_CUSTOMERS_DATABASE` (default: `Galoziot`)  
**Purpose:** Sensor readings for Weighing and Ocio devices  
**Naming:** `n` = `cast_num` from the `Custumer` table (e.g. `cast_6`, `cast_12`)

### Columns

| Column | Type | Description |
|--------|------|-------------|
| `id` | INT IDENTITY | Auto-increment primary key |
| `device_id` | INT | Device identifier |
| `ts` | DATETIME | Reading timestamp (default: `GETDATE()`) |
| `vol` | INT | **Weighing**: weight value · **Ocio**: volume in liters |
| `lv` | INT | **Ocio only**: level in mm · Weighing: unused |
| `rssi` | SMALLINT | WiFi signal strength (dBm) |
| `st` | TINYINT | Status: `0` = OK · `1` = Alert |

### Quick SQL Queries

```sql
-- Replace cast_6 with the actual table for your device (cast_num from Custumer)

-- Latest 50 readings for a device
SELECT TOP 50 id, device_id, ts, vol, lv, rssi, st
FROM [Galoziot].[dbo].[cast_6]
WHERE device_id = 1
ORDER BY ts DESC;

-- Readings in a date range
SELECT ts, vol, lv, rssi, st
FROM [Galoziot].[dbo].[cast_6]
WHERE device_id = 1
  AND ts >= '2025-04-01'
  AND ts <= '2025-04-30 23:59:59'
ORDER BY ts ASC;

-- Latest reading (current value)
SELECT TOP 1 ts, vol, lv, rssi, st
FROM [Galoziot].[dbo].[cast_6]
WHERE device_id = 1
ORDER BY ts DESC;

-- Devices currently in alert state
SELECT DISTINCT device_id, MAX(ts) AS last_reading
FROM [Galoziot].[dbo].[cast_6]
WHERE st = 1
GROUP BY device_id;

-- Daily average weight/volume per device
SELECT
    device_id,
    CAST(ts AS DATE) AS day,
    AVG(vol) AS avg_vol,
    MIN(vol) AS min_vol,
    MAX(vol) AS max_vol,
    COUNT(*) AS readings
FROM [Galoziot].[dbo].[cast_6]
WHERE ts >= DATEADD(DAY, -30, GETDATE())
GROUP BY device_id, CAST(ts AS DATE)
ORDER BY device_id, day;
```

---

## Cross-Table Joins

```sql
-- Energy device info + latest reading
SELECT
    c.id_user, c.site_name, c.location, c.user_name,
    e.ts_getway AS last_seen,
    e.kwtot, e.kt30d, e.rssi
FROM [Galoziot].[dbo].[Custumer] c
OUTER APPLY (
    SELECT TOP 1 ts_getway, kwtot, kt30d, rssi
    FROM [Energy].[dbo].[Energy]
    WHERE Device_ID = c.id_user
    ORDER BY ts_getway DESC
) e
WHERE c.application = 'energy'
ORDER BY c.id_user;

-- Weighing device info + current weight
SELECT
    c.id_user, c.site_name, c.unit, c.alert_low, c.alert_high,
    w.ts AS last_reading,
    w.vol AS current_value,
    w.st AS alert_status
FROM [Galoziot].[dbo].[Custumer] c
OUTER APPLY (
    SELECT TOP 1 ts, vol, st
    FROM [Galoziot].[dbo].[cast_6]   -- change cast_6 to cast_{cast_num}
    WHERE device_id = c.id_user
    ORDER BY ts DESC
) w
WHERE c.application = 'Weighing'
ORDER BY c.id_user;
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SQL_SERVER` | — | MSSQL server hostname/IP |
| `SQL_PORT` | 1433 | MSSQL port |
| `SQL_DATABASE` | `Energy` | Energy readings database |
| `SQL_CUSTOMERS_DATABASE` | `Galoziot` | Users & cast tables database |
| `SQL_USER` | — | SQL login username |
| `SQL_PASSWORD` | — | SQL login password |
| `JWT_SECRET` | — | Secret for signing JWT tokens (required in production) |
| `SMTP_HOST` | — | Email server for alerts |
| `SMTP_PORT` | — | Email server port |
| `SMTP_FROM` | — | Sender address |
| `SMTP_PASSWORD` | — | Email auth password |
| `SMTP_SECURE` | — | TLS: `true`/`false` |

---

## API Endpoints Quick Reference

| Method | Route | Table(s) | Description |
|--------|-------|----------|-------------|
| `POST` | `/api/auth/login` | Custumer | Login, returns JWT (8h) |
| `POST` | `/api/auth/logout` | — | Invalidates session |
| `GET` | `/api/devices` | Custumer | Energy devices for logged-in user |
| `GET` | `/api/customers` | Custumer | All customers (admin only) |
| `POST` | `/api/customers` | Custumer | Add customer (admin only) |
| `PUT` | `/api/customers/:id` | Custumer | Edit customer (admin only) |
| `DELETE` | `/api/customers/:id` | Custumer | Delete customer (admin only) |
| `GET` | `/api/energy/latest/:device_id` | Energy | Latest single reading |
| `GET` | `/api/energy/history/:device_id` | Energy | Readings by date range |
| `GET` | `/api/energy/daily/:device_id` | Energy | Daily aggregated consumption |
| `GET` | `/api/weighing/devices` | Custumer | Weighing device list |
| `GET` | `/api/weighing/data` | cast_{n} | Weighing/Ocio sensor readings |
