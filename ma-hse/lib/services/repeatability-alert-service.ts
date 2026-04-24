import { CommunicationType, RoleCode } from "@prisma/client";
import { endOfWeek, startOfWeek } from "date-fns";
import { prisma } from "@/lib/prisma";
import { NotificationService } from "@/lib/services/notification-service";
import { getPlantRepeatabilityAlertConfig } from "@/lib/services/parameter-service";

const WORKER_MONITORED_TYPES: CommunicationType[] = [
  CommunicationType.UNSAFE_ACT,
  CommunicationType.NEAR_MISS,
  CommunicationType.FIRST_AID,
];

export const RepeatabilityAlertService = {
  async processCommunication(input: {
    communicationId: string;
    plantId: string;
    eventDatetime: Date;
    targetEmployeeId?: string | null;
    targetEmployeeNo?: string | null;
    workstationId?: string | null;
    type: CommunicationType;
  }) {
    const config = await getPlantRepeatabilityAlertConfig(input.plantId);
    const weekStart = startOfWeek(input.eventDatetime, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(input.eventDatetime, { weekStartsOn: 1 });

    if ((input.targetEmployeeId || input.targetEmployeeNo) && WORKER_MONITORED_TYPES.includes(input.type)) {
      const employee = input.targetEmployeeId
        ? await prisma.employeeDirectory.findUnique({
            where: { id: input.targetEmployeeId },
            select: { id: true, name: true, employeeNo: true },
          })
        : input.targetEmployeeNo
          ? await prisma.employeeDirectory.findUnique({
              where: {
                plantId_employeeNo: {
                  plantId: input.plantId,
                  employeeNo: input.targetEmployeeNo,
                },
              },
              select: { id: true, name: true, employeeNo: true },
            })
          : null;

      const workerFilter = employee?.id
        ? { targetEmployeeId: employee.id }
        : input.targetEmployeeNo
          ? { targetEmployeeNo: input.targetEmployeeNo }
          : null;

      if (workerFilter) {
        const count = await prisma.communication.count({
          where: {
            plantId: input.plantId,
            type: { in: WORKER_MONITORED_TYPES },
            eventDatetime: {
              gte: weekStart,
              lte: weekEnd,
            },
            ...workerFilter,
          },
        });

        if (config.workerWeeklyLevel1Enabled && count === config.workerWeeklyLevel1Threshold + 1) {
          await NotificationService.notifyPlantRoles({
            plantId: input.plantId,
            roles: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
            title: "Worker repeatability alert - level 1",
            body: `${employee?.name ?? input.targetEmployeeNo ?? "Worker"} exceeded ${config.workerWeeklyLevel1Threshold} occurrences in the same week.`,
            channel: "REPEATABILITY_ALERT",
          });
        }

        if (config.workerWeeklyLevel2Enabled && count === config.workerWeeklyLevel2Threshold + 1) {
          await NotificationService.notifyPlantRoles({
            plantId: input.plantId,
            roles: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
            title: "Worker repeatability alert - level 2",
            body: `${employee?.name ?? input.targetEmployeeNo ?? "Worker"} exceeded ${config.workerWeeklyLevel2Threshold} occurrences in the same week.`,
            channel: "REPEATABILITY_ALERT",
          });
        }
      }
    }

    if (
      config.workstationNearMissWeeklyEnabled &&
      input.type === CommunicationType.NEAR_MISS &&
      input.workstationId
    ) {
      const [count, workstation] = await Promise.all([
        prisma.communication.count({
          where: {
            plantId: input.plantId,
            type: CommunicationType.NEAR_MISS,
            workstationId: input.workstationId,
            eventDatetime: {
              gte: weekStart,
              lte: weekEnd,
            },
          },
        }),
        prisma.workstation.findUnique({
          where: { id: input.workstationId },
          select: { name: true },
        }),
      ]);

      if (count === config.workstationNearMissWeeklyThreshold + 1) {
        await NotificationService.notifyPlantRoles({
          plantId: input.plantId,
          roles: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
          title: "Near miss workstation repeatability alert",
          body: `${workstation?.name ?? "Workstation"} exceeded ${config.workstationNearMissWeeklyThreshold} near miss occurrences in the same week.`,
          channel: "REPEATABILITY_ALERT",
        });
      }
    }
  },
};
