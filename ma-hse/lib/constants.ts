export const SYSTEM_PARAMETER_KEYS = {
  SLA: "SLA_CONFIG",
  ALERT: "ALERT_CONFIG",
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