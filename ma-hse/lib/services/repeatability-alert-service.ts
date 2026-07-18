import { CommunicationType, MasterDataEntityType, RoleCode } from "@prisma/client";
import { endOfWeek, startOfWeek } from "date-fns";
import type { AppLocale } from "@/lib/i18n/routing";
import { prisma } from "@/lib/prisma";
import {
  localizeMasterDataRows,
  MASTER_DATA_TRANSLATION_LOCALES,
} from "@/lib/services/master-data-translation-service";
import { NotificationService } from "@/lib/services/notification-service";
import { getPlantRepeatabilityAlertConfig } from "@/lib/services/parameter-service";

const WORKER_MONITORED_TYPES: CommunicationType[] = [
  CommunicationType.UNSAFE_ACT,
  CommunicationType.NEAR_MISS,
  CommunicationType.FIRST_AID,
];

const repeatabilityCopy: Record<AppLocale, {
  workerTitle: (level: number) => string;
  workerBody: (name: string, threshold: number) => string;
  workstationTitle: string;
  workstationBody: (name: string, threshold: number) => string;
}> = {
  en: { workerTitle: (level) => `Worker repeatability alert - level ${level}`, workerBody: (name, threshold) => `${name} exceeded ${threshold} occurrences in the same week.`, workstationTitle: "Near miss workstation repeatability alert", workstationBody: (name, threshold) => `${name} exceeded ${threshold} near miss occurrences in the same week.` },
  pt: { workerTitle: (level) => `Alerta de repetibilidade do trabalhador - nível ${level}`, workerBody: (name, threshold) => `${name} ultrapassou ${threshold} ocorrências na mesma semana.`, workstationTitle: "Alerta de repetibilidade de quase acidentes por posto de trabalho", workstationBody: (name, threshold) => `${name} ultrapassou ${threshold} quase acidentes na mesma semana.` },
  it: { workerTitle: (level) => `Avviso di ripetibilità del lavoratore - livello ${level}`, workerBody: (name, threshold) => `${name} ha superato ${threshold} eventi nella stessa settimana.`, workstationTitle: "Avviso di ripetibilità dei mancati infortuni per postazione", workstationBody: (name, threshold) => `${name} ha superato ${threshold} mancati infortuni nella stessa settimana.` },
  pl: { workerTitle: (level) => `Alert powtarzalności pracownika - poziom ${level}`, workerBody: (name, threshold) => `${name} przekroczył(a) ${threshold} zdarzeń w tym samym tygodniu.`, workstationTitle: "Alert powtarzalności zdarzeń potencjalnie wypadkowych na stanowisku", workstationBody: (name, threshold) => `${name} przekroczył(a) ${threshold} zdarzeń potencjalnie wypadkowych w tym samym tygodniu.` },
  de: { workerTitle: (level) => `Wiederholungswarnung für Mitarbeiter - Stufe ${level}`, workerBody: (name, threshold) => `${name} hat ${threshold} Ereignisse in derselben Woche überschritten.`, workstationTitle: "Wiederholungswarnung für Beinaheunfälle am Arbeitsplatz", workstationBody: (name, threshold) => `${name} hat ${threshold} Beinaheunfälle in derselben Woche überschritten.` },
  ro: { workerTitle: (level) => `Alertă de repetabilitate a lucrătorului - nivel ${level}`, workerBody: (name, threshold) => `${name} a depășit ${threshold} evenimente în aceeași săptămână.`, workstationTitle: "Alertă de repetabilitate a incidentelor evitate la postul de lucru", workstationBody: (name, threshold) => `${name} a depășit ${threshold} incidente evitate în aceeași săptămână.` },
  fr: { workerTitle: (level) => `Alerte de répétitivité du travailleur - niveau ${level}`, workerBody: (name, threshold) => `${name} a dépassé ${threshold} événements au cours de la même semaine.`, workstationTitle: "Alerte de répétitivité des quasi-accidents par poste", workstationBody: (name, threshold) => `${name} a dépassé ${threshold} quasi-accidents au cours de la même semaine.` },
};

function getWorkerLocalizedContent(name: string, threshold: number, level: number) {
  return Object.fromEntries(MASTER_DATA_TRANSLATION_LOCALES.map((locale) => [locale, {
    title: repeatabilityCopy[locale].workerTitle(level),
    body: repeatabilityCopy[locale].workerBody(name, threshold),
  }])) as Record<AppLocale, { title: string; body: string }>;
}

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
          const workerName = employee?.name ?? input.targetEmployeeNo ?? "Worker";
          await NotificationService.notifyPlantRoles({
            plantId: input.plantId,
            roles: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
            title: "Worker repeatability alert - level 1",
            body: `${employee?.name ?? input.targetEmployeeNo ?? "Worker"} exceeded ${config.workerWeeklyLevel1Threshold} occurrences in the same week.`,
            localizedContent: getWorkerLocalizedContent(workerName, config.workerWeeklyLevel1Threshold, 1),
            channel: "REPEATABILITY_ALERT",
          });
        }

        if (config.workerWeeklyLevel2Enabled && count === config.workerWeeklyLevel2Threshold + 1) {
          const workerName = employee?.name ?? input.targetEmployeeNo ?? "Worker";
          await NotificationService.notifyPlantRoles({
            plantId: input.plantId,
            roles: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
            title: "Worker repeatability alert - level 2",
            body: `${employee?.name ?? input.targetEmployeeNo ?? "Worker"} exceeded ${config.workerWeeklyLevel2Threshold} occurrences in the same week.`,
            localizedContent: getWorkerLocalizedContent(workerName, config.workerWeeklyLevel2Threshold, 2),
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
          select: { id: true, name: true, sourceLanguage: true },
        }),
      ]);

      if (count === config.workstationNearMissWeeklyThreshold + 1) {
        const localizedEntries = await Promise.all(
          MASTER_DATA_TRANSLATION_LOCALES.map(async (locale) => {
            const localized = await localizeMasterDataRows(
              MasterDataEntityType.WORKSTATION,
              workstation ? [workstation] : [],
              locale,
            );
            const name = localized[0]?.name ?? workstation?.name ?? repeatabilityCopy[locale].workstationTitle;
            return [locale, {
              title: repeatabilityCopy[locale].workstationTitle,
              body: repeatabilityCopy[locale].workstationBody(name, config.workstationNearMissWeeklyThreshold),
            }] as const;
          }),
        );
        await NotificationService.notifyPlantRoles({
          plantId: input.plantId,
          roles: [RoleCode.N1_CORPORATE, RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY],
          title: "Near miss workstation repeatability alert",
          body: `${workstation?.name ?? "Workstation"} exceeded ${config.workstationNearMissWeeklyThreshold} near miss occurrences in the same week.`,
          localizedContent: Object.fromEntries(localizedEntries),
          channel: "REPEATABILITY_ALERT",
        });
      }
    }
  },
};
