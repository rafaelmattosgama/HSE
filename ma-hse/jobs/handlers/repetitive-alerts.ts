import { subDays } from "date-fns";
import { CommunicationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";

export async function handleRepetitiveAlerts(data: { plantId: string }) {
  const rules = await prisma.alertRule.findMany({
    where: {
      plantId: data.plantId,
      isActive: true,
    },
    include: {
      repetitionRule: true,
    },
  });

  for (const rule of rules) {
    const cfg = rule.repetitionRule;
    if (!cfg) continue;

    const since = subDays(new Date(), cfg.windowDays);

    const candidates = await prisma.communication.findMany({
      where: {
        plantId: data.plantId,
        status: {
          in: [CommunicationStatus.VALID_OPEN, CommunicationStatus.ONGOING, CommunicationStatus.CLOSED],
        },
        eventDatetime: { gte: since },
      },
      orderBy: { eventDatetime: "desc" },
      take: 200,
    });

    if (candidates.length < cfg.thresholdCount) continue;

    await prisma.alertEvent.create({
      data: {
        alertRuleId: rule.id,
        payloadJson: {
          count: candidates.length,
          since,
          triggerType: cfg.triggerType,
        },
      },
    });

    const n3Users = await prisma.userPlantRole.findMany({
      where: {
        plantId: data.plantId,
        role: {
          code: {
            in: ["N1_CORPORATE", "N3_SAFETY"],
          },
        },
      },
      select: { userId: true },
    });

    await NotificationService.notify({
      plantId: data.plantId,
      userIds: n3Users.map((entry) => entry.userId),
      title: `Repetitive alert: ${rule.name}`,
      body: `Detected ${candidates.length} repetitive events in ${cfg.windowDays} days.`,
    });
  }
}
