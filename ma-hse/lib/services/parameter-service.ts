import { ActionPriority, Prisma } from "@prisma/client";
import {
  DEFAULT_ALERT_CONFIG,
  DEFAULT_REPEATABILITY_ALERT_CONFIG,
  DEFAULT_SLA_DAYS,
  SYSTEM_PARAMETER_KEYS,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export type SlaConfig = Record<ActionPriority, number>;
export type RepeatabilityAlertConfig = {
  workerWeeklyLevel1Enabled: boolean;
  workerWeeklyLevel1Threshold: number;
  workerWeeklyLevel2Enabled: boolean;
  workerWeeklyLevel2Threshold: number;
  workstationNearMissWeeklyEnabled: boolean;
  workstationNearMissWeeklyThreshold: number;
};

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

function normalizeRepeatabilityAlertConfig(value?: Prisma.JsonObject | null): RepeatabilityAlertConfig {
  return {
    workerWeeklyLevel1Enabled: Boolean(value?.workerWeeklyLevel1Enabled ?? DEFAULT_REPEATABILITY_ALERT_CONFIG.workerWeeklyLevel1Enabled),
    workerWeeklyLevel1Threshold: Number(value?.workerWeeklyLevel1Threshold ?? DEFAULT_REPEATABILITY_ALERT_CONFIG.workerWeeklyLevel1Threshold),
    workerWeeklyLevel2Enabled: Boolean(value?.workerWeeklyLevel2Enabled ?? DEFAULT_REPEATABILITY_ALERT_CONFIG.workerWeeklyLevel2Enabled),
    workerWeeklyLevel2Threshold: Number(value?.workerWeeklyLevel2Threshold ?? DEFAULT_REPEATABILITY_ALERT_CONFIG.workerWeeklyLevel2Threshold),
    workstationNearMissWeeklyEnabled: Boolean(
      value?.workstationNearMissWeeklyEnabled ?? DEFAULT_REPEATABILITY_ALERT_CONFIG.workstationNearMissWeeklyEnabled,
    ),
    workstationNearMissWeeklyThreshold: Number(
      value?.workstationNearMissWeeklyThreshold ?? DEFAULT_REPEATABILITY_ALERT_CONFIG.workstationNearMissWeeklyThreshold,
    ),
  };
}

export async function getGlobalRepeatabilityAlertConfig(): Promise<RepeatabilityAlertConfig> {
  const parameter = await prisma.systemParameter.findFirst({
    where: {
      plantId: null,
      key: SYSTEM_PARAMETER_KEYS.GLOBAL_REPEATABILITY_ALERT,
    },
  });

  return normalizeRepeatabilityAlertConfig((parameter?.valueJson as Prisma.JsonObject | null) ?? null);
}

export async function setGlobalRepeatabilityAlertConfig(config: RepeatabilityAlertConfig) {
  const existing = await prisma.systemParameter.findFirst({
    where: {
      plantId: null,
      key: SYSTEM_PARAMETER_KEYS.GLOBAL_REPEATABILITY_ALERT,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.systemParameter.update({
      where: { id: existing.id },
      data: {
        valueJson: config,
      },
    });
  }

  return prisma.systemParameter.create({
    data: {
      plantId: null,
      key: SYSTEM_PARAMETER_KEYS.GLOBAL_REPEATABILITY_ALERT,
      valueJson: config,
    },
  });
}

export async function getPlantRepeatabilityAlertConfig(plantId: string): Promise<RepeatabilityAlertConfig> {
  const [globalConfig, parameter] = await Promise.all([
    getGlobalRepeatabilityAlertConfig(),
    prisma.systemParameter.findUnique({
      where: {
        plantId_key: {
          plantId,
          key: SYSTEM_PARAMETER_KEYS.REPEATABILITY_ALERT,
        },
      },
    }),
  ]);

  return {
    ...globalConfig,
    ...normalizeRepeatabilityAlertConfig((parameter?.valueJson as Prisma.JsonObject | null) ?? null),
  };
}

export async function setPlantRepeatabilityAlertConfig(plantId: string, config: RepeatabilityAlertConfig) {
  return prisma.systemParameter.upsert({
    where: {
      plantId_key: {
        plantId,
        key: SYSTEM_PARAMETER_KEYS.REPEATABILITY_ALERT,
      },
    },
    create: {
      plantId,
      key: SYSTEM_PARAMETER_KEYS.REPEATABILITY_ALERT,
      valueJson: config,
    },
    update: {
      valueJson: config,
    },
  });
}
