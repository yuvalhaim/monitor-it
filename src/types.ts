export interface Device {
  user_name: string;
  id_user: number;
  date_exp: string;
  email: string;
  Alerts: boolean;
  site_name: string;
  location: string;
  contact_name: string;
  mobile_phone: string;
  days_remaining?: number;
  installation_date?: string | null;
}

export interface EnergyData {
  Row_Num: number;
  Device_ID: number;
  meter_type: string | null;
  vl1n: number;
  vl2n: number;
  vl3n: number;
  AL1: number;
  AL2: number;
  AL3: number;
  kwtot: number;
  ts: string;
  ts_em: string;
  t1: number;
  t2: number;
  t3: number;
  msgsLastHour?: number;
  hz?: number | null;
}

export interface AlertConfig {
  smtp: {
    from: string;
    password?: string;
    recipients: string;
  };
  rules: AlertRule[];
}

export interface AlertRule {
  id: string;
  deviceId: number;
  siteName: string;
  field: 'vl1n' | 'vl2n' | 'vl3n' | 'AL1' | 'AL2' | 'AL3' | 'kwtot' | 'no-signal';
  operator?: '>' | '<';
  threshold: number;
  cooldown: number; // minutes
  active: boolean;
  lastTriggered?: string;
}

export interface AlertHistory {
  id: string;
  timestamp: string;
  deviceId: number;
  siteName: string;
  field: string;
  value: string;
  status: 'sent' | 'failed';
}

export interface User {
  id_user: number;
  user_name: string;
  email: string;
  role: 'admin' | 'user';
  cast_num?: number | null;
  date_exp?: string | null;
}

export interface WeighingDevice {
  id_user: number;
  device_id?: number | null;
  site_name: string;
  location?: string;
  unit: string;
  min: number;
  max: number;
  alert_low: number;
  alert_high: number;
  widget_type: string | null;
  Display_Graph: boolean;
  cast_num: number;
}

export interface OcioDevice {
  id_user: number;
  site_name: string;
  location?: string;
  unit: string;       // volume unit, e.g. "L"
  min: number;
  max: number;
  alert_low: number;
  alert_high: number;
  widget_type: string | null;
  Display_Graph: boolean;
  cast_num: number;
}

export interface LevelDevice {
  id_user: number;
  site_name: string;
  location?: string;
  unit: string;
  min: number;
  max: number;
  alert_low: number;
  alert_high: number;
  widget_type: string | null;
  Display_Graph: boolean;
  cast_num: number;
}

export interface PsKsDevice {
  id_user: number;
  site_name: string;
  location?: string;
  unit: string;
  min: number;
  max: number;
  alert_low: number;
  alert_high: number;
  widget_type: string | null;
  Display_Graph: boolean;
  cast_num: number;
}

export interface OffJerDevice {
  id_user: number;
  site_name: string;
  location?: string;
  cast_num: number;
}
