import { RoleCode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SYSTEM_PARAMETER_KEYS } from "@/lib/constants";
import { COMMUNICATION_IN_VALIDATION_STATUSES, LINKABLE_COMMUNICATION_STATUSES } from "@/lib/communication-status";
import { buildMonthBuckets } from "@/lib/dashboard-visualization";
import { buildGroupSafetyPlant, previousSafetyPeriod } from "@/lib/group-safety-dashboard";
import { hasSafetyDashboardAccess } from "@/lib/rbac/dashboard";

type Roles = Parameters<typeof hasSafetyDashboardAccess>[1];

/** Reuse the application's existing global/assigned-plant read scope. Never trust a URL plant id. */
export function groupSafetyPlantWhere(roles: Roles) {
  if (roles.some(entry => entry.role === RoleCode.N0_ADMIN || entry.role === RoleCode.N1_CORPORATE)) return {};
  const codes = roles.flatMap(entry => entry.plantCode && hasSafetyDashboardAccess(entry.plantCode, roles) ? [entry.plantCode] : []);
  return { code: { in: [...new Set(codes)] } };
}

export async function getGroupSafetyDashboard(roles: Roles, period: { from: Date; to: Date }, today = new Date()) {
  const previous = previousSafetyPeriod(period.from, period.to);
  const months = [...buildMonthBuckets(period.from, period.to), ...buildMonthBuckets(previous.from, previous.to)]
    .map(({ year, month }) => ({ year, month }));
  const where = groupSafetyPlantWhere(roles);
  const [plants, history, configs] = await Promise.all([
    prisma.plant.findMany({
      where,
      orderBy: { name: "asc" },
      select: {
        id: true, code: true, name: true, createdAt: true,
        communications: {
          where: { OR: [
            { eventDatetime: { gte: period.from, lte: period.to } },
            { eventDatetime: { gte: previous.from, lte: previous.to } },
            { status: { in: [...COMMUNICATION_IN_VALIDATION_STATUSES] }, reportedAt: { gte: period.from, lte: period.to } },
          ] },
          select: { type: true, status: true, classification: true, eventDatetime: true, reportedAt: true, lostDays: true, updatedAt: true, unsafeActType: { select: { name: true } }, nearMissType: { select: { name: true } } },
        },
        kpiInputs: { where: { OR: months }, select: { year: true, month: true, hoursWorked: true, updatedAt: true } },
        sewoRecords: {
          where: { analysisDate: { gte: period.from, lte: period.to } },
          select: { communication: { select: { type: true } }, templateData: true, updatedAt: true, causeSelections: { select: { selected: true, isRootCause: true, causeItem: { select: { label: true } } } } },
        },
        actions: { where: { status: { in: ["OPEN", "ONGOING"] } }, select: { status: true, priority: true, dueDate: true, updatedAt: true } },
      },
    }),
    prisma.communication.findMany({
      where: { plant: where, type: "ACCIDENT", status: { in: [...LINKABLE_COMMUNICATION_STATUSES] }, eventDatetime: { lte: today } },
      select: { plantId: true, eventDatetime: true },
    }),
    prisma.systemParameter.findMany({
      where: { plant: where, key: SYSTEM_PARAMETER_KEYS.SAFETY_DAYS }, select: { plantId: true, valueJson: true },
    }),
  ]);
  const historyByPlant = new Map<string, Date[]>();
  for (const row of history) { const dates = historyByPlant.get(row.plantId) ?? []; dates.push(row.eventDatetime); historyByPlant.set(row.plantId, dates); }
  const configByPlant = new Map(configs.map(row => [row.plantId, row.valueJson]));
  return {
    loadedAt: today.toISOString(),
    plants: plants.map(plant => buildGroupSafetyPlant(plant, { ...period, today, injuryDates: historyByPlant.get(plant.id) ?? [], safetyConfig: configByPlant.get(plant.id) })),
  };
}
