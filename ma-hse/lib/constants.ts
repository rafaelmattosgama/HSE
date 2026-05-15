export const SYSTEM_PARAMETER_KEYS = {
  SLA: "SLA_CONFIG",
  ALERT: "ALERT_CONFIG",
  REPEATABILITY_ALERT: "REPEATABILITY_ALERT_CONFIG",
  GLOBAL_REPEATABILITY_ALERT: "GLOBAL_REPEATABILITY_ALERT_CONFIG",
  SAFETY_DAYS: "SAFETY_DAYS_CONFIG",
  MONTHLY_INPUTS_LAYOUT: "MONTHLY_INPUTS_LAYOUT",
} as const;

export const DEFAULT_SLA_DAYS = {
  LOW: 21,
  MEDIUM: 14,
  HIGH: 7,
} as const;

export const DEFAULT_ALERT_CONFIG = {
  windowDays: 30,
  nOccurrences: 3,
  consecutiveOccurrences: 3,
};

export const DEFAULT_REPEATABILITY_ALERT_CONFIG = {
  workerWeeklyLevel1Enabled: true,
  workerWeeklyLevel1Threshold: 2,
  workerWeeklyLevel2Enabled: true,
  workerWeeklyLevel2Threshold: 5,
  workstationNearMissWeeklyEnabled: true,
  workstationNearMissWeeklyThreshold: 1,
} as const;
