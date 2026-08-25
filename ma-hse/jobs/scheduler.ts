import { prisma } from "@/lib/prisma";
import {
  actionsOverdueQueue,
  alertsRepetitiveQueue,
  competenceExpiryQueue,
  digestWeeklyQueue,
  reportAnnualQueue,
  reportMonthlyQueue,
} from "@/jobs/queues";
import { ACTION_ALERT_TIMEZONE } from "@/lib/services/action-alert-service";

async function upsertPlantJobs() {
  const plants = await prisma.plant.findMany({
    select: { id: true, timezone: true },
  });

  await digestWeeklyQueue.upsertJobScheduler(`weekly-corporate`, {
    pattern: "0 8 * * 1",
    tz: "UTC",
  }, {
    name: "weekly-digest",
    data: { scope: "CORPORATE" },
  });

  await reportMonthlyQueue.upsertJobScheduler(`monthly-corporate`, {
    pattern: "0 7 1 * *",
    tz: "UTC",
  }, {
    name: "monthly-report",
    data: { scope: "CORPORATE" },
  });

  await reportAnnualQueue.upsertJobScheduler(`annual-corporate`, {
    pattern: "0 7 2 1 *",
    tz: "UTC",
  }, {
    name: "annual-report",
    data: { scope: "CORPORATE" },
  });

  for (const plant of plants) {
    await actionsOverdueQueue.upsertJobScheduler(`overdue-${plant.id}`, {
      pattern: "0 8 * * *",
      tz: ACTION_ALERT_TIMEZONE,
    }, {
      name: "actions-overdue",
      data: { plantId: plant.id },
    });

    await alertsRepetitiveQueue.upsertJobScheduler(`alerts-${plant.id}`, {
      pattern: "0 */6 * * *",
      tz: plant.timezone,
    }, {
      name: "alerts-repetitive",
      data: { plantId: plant.id },
    });

    await competenceExpiryQueue.upsertJobScheduler(`competence-expiry-${plant.id}`, {
      pattern: "0 8 * * *",
      tz: ACTION_ALERT_TIMEZONE,
    }, {
      name: "competence-expiry",
      data: { plantId: plant.id },
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
      },
    });
  }
}

upsertPlantJobs()
  .then(() => {
    console.log("Schedulers upserted successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Failed to upsert schedulers", error);
    process.exit(1);
  });
