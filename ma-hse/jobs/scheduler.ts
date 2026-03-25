import { prisma } from "@/lib/prisma";
import {
  actionsOverdueQueue,
  alertsRepetitiveQueue,
  digestWeeklyQueue,
  reportAnnualQueue,
  reportMonthlyQueue,
} from "@/jobs/queues";

async function upsertPlantJobs() {
  const plants = await prisma.plant.findMany({
    select: { id: true, timezone: true },
  });

  for (const plant of plants) {
    await digestWeeklyQueue.upsertJobScheduler(`weekly-${plant.id}`, {
      pattern: "0 8 * * 1",
      tz: plant.timezone,
    }, {
      name: "weekly-digest",
      data: { plantId: plant.id },
    });

    await reportMonthlyQueue.upsertJobScheduler(`monthly-${plant.id}`, {
      pattern: "0 7 1 * *",
      tz: plant.timezone,
    }, {
      name: "monthly-report",
      data: { plantId: plant.id },
    });

    await reportAnnualQueue.upsertJobScheduler(`annual-${plant.id}`, {
      pattern: "0 7 2 1 *",
      tz: plant.timezone,
    }, {
      name: "annual-report",
      data: { plantId: plant.id },
    });

    await actionsOverdueQueue.upsertJobScheduler(`overdue-${plant.id}`, {
      pattern: "0 8 * * *",
      tz: plant.timezone,
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
