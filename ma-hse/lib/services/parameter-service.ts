import { ActionPriority, Prisma } from "@prisma/client";
import { DEFAULT_ALERT_CONFIG, DEFAULT_SLA_DAYS, SYSTEM_PARAMETER_KEYS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export type SlaConfig = Record<ActionPriority, number>;

const SLA_DEFAULT: SlaConfig = {
  LOW: DEFAULT_SLA_DAYS.LOW,
  MEDIUM: DEFAULT_SLA_DAYS.MEDIUM,
  HIGH: DEFAULT_SLA_DAYS.HIGH,
};

export async function getSlaConfig(plantId: string): Promise<SlaConfig> {
  const parameter = await prisma.systemParameter.findUnique({
    where: {
      plantId_key: {
        plantId,
        key: SYSTEM_PARAMETER_KEYS.SLA,
      },
    },
  });

  if (!parameter) {
    return SLA_DEFAULT;
  }

  const value = parameter.valueJson as Prisma.JsonObject;
  return {
    LOW: Number(value.LOW ?? SLA_DEFAULT.LOW),
    MEDIUM: Number(value.MEDIUM ?? SLA_DEFAULT.MEDIUM),
    HIGH: Number(value.HIGH ?? SLA_DEFAULT.HIGH),
  };
}

export async function setSlaConfig(plantId: string, sla: SlaConfig) {
  return prisma.systemParameter.upsert({
    where: {
      plantId_key: {
        plantId,
        key: SYSTEM_PARAMETER_KEYS.SLA,
      },
    },
    create: {
      plantId,
      key: SYSTEM_PARAMETER_KEYS.SLA,
      valueJson: sla,
    },
    update: {
      valueJson: sla,
    },
  });
}

export async function getAlertConfig(plantId: string) {
  const parameter = await prisma.systemParameter.findUnique({
    where: {
      plantId_key: {
        plantId,
        key: SYSTEM_PARAMETER_KEYS.ALERT,
      },
    },
  });

  if (!parameter) {
    return DEFAULT_ALERT_CONFIG;
  }

  const value = parameter.valueJson as Prisma.JsonObject;
  return {
    windowDays: Number(value.windowDays ?? DEFAULT_ALERT_CONFIG.windowDays),
    nOccurrences: Number(value.nOccurrences ?? DEFAULT_ALERT_CONFIG.nOccurrences),
    consecutiveOccurrences: Number(value.consecutiveOccurrences ?? DEFAULT_ALERT_CONFIG.consecutiveOccurrences),
  };
}

export async function setAlertConfig(plantId: string, config: {
  windowDays: number;
  nOccurrences: number;
  consecutiveOccurrences: number;
}) {
  return prisma.systemParameter.upsert({
    where: {
      plantId_key: {
        plantId,
        key: SYSTEM_PARAMETER_KEYS.ALERT,
      },
    },
    create: {
      plantId,
      key: SYSTEM_PARAMETER_KEYS.ALERT,
      valueJson: config,
    },
    update: {
      valueJson: config,
    },
  });
}