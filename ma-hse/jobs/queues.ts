import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";

const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const QUEUE_NAMES = {
  DIGEST_WEEKLY: "digest-weekly",
  REPORT_MONTHLY: "report-monthly",
  REPORT_ANNUAL: "report-annual",
  ACTIONS_OVERDUE: "actions-overdue",
  ALERTS_REPETITIVE: "alerts-repetitive",
  SEWO_APPROVED_NOTIFICATION: "sewo-approved-notification",
} as const;

export const digestWeeklyQueue = new Queue(QUEUE_NAMES.DIGEST_WEEKLY, { connection });
export const reportMonthlyQueue = new Queue(QUEUE_NAMES.REPORT_MONTHLY, { connection });
export const reportAnnualQueue = new Queue(QUEUE_NAMES.REPORT_ANNUAL, { connection });
export const actionsOverdueQueue = new Queue(QUEUE_NAMES.ACTIONS_OVERDUE, { connection });
export const alertsRepetitiveQueue = new Queue(QUEUE_NAMES.ALERTS_REPETITIVE, { connection });
export const sewoApprovedNotificationQueue = new Queue(QUEUE_NAMES.SEWO_APPROVED_NOTIFICATION, { connection });

export function getQueueConnection() {
  return connection;
}
