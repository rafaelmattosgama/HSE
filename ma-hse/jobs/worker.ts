import { Worker } from "bullmq";
import { logger } from "@/lib/logger";
import { getQueueConnection, QUEUE_NAMES } from "@/jobs/queues";
import { handleWeeklyDigest } from "@/jobs/handlers/weekly-digest";
import { handleMonthlyReport } from "@/jobs/handlers/monthly-report";
import { handleAnnualReport } from "@/jobs/handlers/annual-report";
import { handleOverdueActions } from "@/jobs/handlers/overdue-actions";
import { handleRepetitiveAlerts } from "@/jobs/handlers/repetitive-alerts";
import { handleSewoApprovedNotification, type SewoApprovedNotificationJob } from "@/jobs/handlers/sewo-approved-notification";
import { handleMasterDataTranslation, type MasterDataTranslationJob } from "@/jobs/handlers/master-data-translation";
import { handleCompetenceExpiry } from "@/jobs/handlers/competence-expiry";
import { handleFireEquipmentDueDates } from "@/jobs/handlers/fire-equipment-due-dates";

const connection = getQueueConnection();
const scheduledReportQueues: ReadonlySet<string> = new Set([
  QUEUE_NAMES.DIGEST_WEEKLY,
  QUEUE_NAMES.REPORT_MONTHLY,
  QUEUE_NAMES.REPORT_ANNUAL,
]);
const skipDueScheduledReportJobsInDev = process.env.NODE_ENV !== "production";

const workerMap: [string, (data: unknown) => Promise<void>, number][] = [
  [QUEUE_NAMES.DIGEST_WEEKLY, () => handleWeeklyDigest(), 1],
  [QUEUE_NAMES.REPORT_MONTHLY, () => handleMonthlyReport(), 1],
  [QUEUE_NAMES.REPORT_ANNUAL, () => handleAnnualReport(), 1],
  [QUEUE_NAMES.ACTIONS_OVERDUE, (data) => handleOverdueActions(data as { plantId?: string }), 4],
  [QUEUE_NAMES.ALERTS_REPETITIVE, (data) => handleRepetitiveAlerts(data as { plantId: string }), 2],
  [QUEUE_NAMES.SEWO_APPROVED_NOTIFICATION, (data) => handleSewoApprovedNotification(data as SewoApprovedNotificationJob), 2],
  [QUEUE_NAMES.MASTER_DATA_TRANSLATION, (data) => handleMasterDataTranslation(data as MasterDataTranslationJob), 3],
  [QUEUE_NAMES.COMPETENCE_EXPIRY, (data) => handleCompetenceExpiry(data as { plantId: string }), 2],
  [QUEUE_NAMES.FIRE_EQUIPMENT_DUE_DATES, (data) => handleFireEquipmentDueDates(data as { plantId: string }), 2],
];

for (const [queueName, handler, concurrency] of workerMap) {
  const worker = new Worker(
    queueName,
    async (job) => {
      const scoped = logger.child({ jobId: job.id, queueName });
      if (skipDueScheduledReportJobsInDev && scheduledReportQueues.has(queueName) && job.id?.startsWith("repeat:")) {
        scoped.info("skipping due scheduled report job in development");
        return;
      }

      scoped.info("processing job");
      await handler(job.data);
      scoped.info("job done");
    },
    {
      connection,
      concurrency,
    },
  );

  worker.on("failed", (job, error) => {
    logger.error({ queueName, jobId: job?.id, err: error }, "job failed");
  });
}

logger.info("BullMQ workers started");
