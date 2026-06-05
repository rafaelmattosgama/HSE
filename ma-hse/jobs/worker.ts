import { Worker } from "bullmq";
import { logger } from "@/lib/logger";
import { getQueueConnection, QUEUE_NAMES } from "@/jobs/queues";
import { handleWeeklyDigest } from "@/jobs/handlers/weekly-digest";
import { handleMonthlyReport } from "@/jobs/handlers/monthly-report";
import { handleAnnualReport } from "@/jobs/handlers/annual-report";
import { handleOverdueActions } from "@/jobs/handlers/overdue-actions";
import { handleRepetitiveAlerts } from "@/jobs/handlers/repetitive-alerts";
import { handleSewoApprovedNotification, type SewoApprovedNotificationJob } from "@/jobs/handlers/sewo-approved-notification";

const connection = getQueueConnection();

const workerMap: [string, (data: unknown) => Promise<void>][] = [
  [QUEUE_NAMES.DIGEST_WEEKLY, () => handleWeeklyDigest()],
  [QUEUE_NAMES.REPORT_MONTHLY, () => handleMonthlyReport()],
  [QUEUE_NAMES.REPORT_ANNUAL, () => handleAnnualReport()],
  [QUEUE_NAMES.ACTIONS_OVERDUE, (data) => handleOverdueActions(data as { plantId?: string })],
  [QUEUE_NAMES.ALERTS_REPETITIVE, (data) => handleRepetitiveAlerts(data as { plantId: string })],
  [QUEUE_NAMES.SEWO_APPROVED_NOTIFICATION, (data) => handleSewoApprovedNotification(data as SewoApprovedNotificationJob)],
];

for (const [queueName, handler] of workerMap) {
  const worker = new Worker(
    queueName,
    async (job) => {
      const scoped = logger.child({ jobId: job.id, queueName });
      scoped.info("processing job");
      await handler(job.data);
      scoped.info("job done");
    },
    {
      connection,
      concurrency: 4,
    },
  );

  worker.on("failed", (job, error) => {
    logger.error({ queueName, jobId: job?.id, err: error }, "job failed");
  });
}

logger.info("BullMQ workers started");
