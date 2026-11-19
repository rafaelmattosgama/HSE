// Demo data for the other modules (competences, fire equipment, KPI inputs and
// knowledge base). Goes through the app's own services where they exist, so
// the derived states (expiring, overdue, non-conformity...) are computed exactly
// as in normal use. Competences and fire equipment are only created once per
// plant; a re-run leaves them as they are (the demo reset starts from scratch).
import {
  FireChecklistFrequency,
  FireChecklistItemValue,
  FireExtinguishingAgent,
  Prisma,
  SEWOStatus,
  type Plant,
} from "@prisma/client";
import { addDays, startOfMonth, subDays, subMonths } from "date-fns";
import { CompetenceService } from "../../lib/services/competence-service";
import { FireEquipmentService } from "../../lib/services/fire-equipment-service";
import { synchronizeApprovedSewoToIncidentKnowledge } from "../../lib/services/incident-knowledge-sewo-sync-service";
import {
  createFireChecklistExecutionInput,
  createFireEquipmentInput,
  enrollCompetenceWorkersInput,
  registerCompetenceEntryInput,
} from "../../lib/validation/dtos";
import { prisma, stableUuid } from "../seed-helpers";
import { DEMO_WORKERS } from "./people";
import { createRandom, type DemoRandom } from "./random";

type Actors = { n2: string; n3: string; n4: string; n5: string };

const ENROLLED_WORKERS = 20;
const COMPETENCE_TYPES = 3;

async function seedCompetences(plant: Plant, actors: Actors, now: Date, random: DemoRandom) {
  if (await prisma.competenceWorker.count({ where: { plantId: plant.id } })) return { skipped: true };

  const [employees, areas, types] = await Promise.all([
    prisma.employeeDirectory.findMany({
      where: { plantId: plant.id, employeeNo: { in: DEMO_WORKERS.slice(0, ENROLLED_WORKERS).map((w) => w.employeeNo) } },
      orderBy: { employeeNo: "asc" },
      select: { id: true },
    }),
    prisma.area.findMany({ where: { plantId: plant.id }, orderBy: { code: "asc" }, select: { id: true } }),
    prisma.competenceType.findMany({
      where: { plantId: plant.id, isActive: true },
      orderBy: { displayOrder: "asc" },
      take: COMPETENCE_TYPES,
      select: { id: true },
    }),
  ]);

  const workers = await CompetenceService.enroll(
    plant.id,
    enrollCompetenceWorkersInput.parse({
      workers: employees.map((employee) => ({ employeeDirectoryId: employee.id, areaId: random.pick(areas).id })),
    }),
    actors.n3,
  );

  const counts = { valid: 0, expiring: 0, expired: 0, none: 0 };
  const grantedIds: string[] = [];
  for (const worker of workers) {
    for (const type of types) {
      const roll = random.next();
      let validFrom: Date;
      if (roll < 0.7) {
        validFrom = subDays(now, random.int(10, 300)); // expires in 2-11 months
        counts.valid += 1;
      } else if (roll < 0.85) {
        validFrom = addDays(subMonths(now, 12), random.int(3, 25)); // expires in the next 3-25 days
        counts.expiring += 1;
      } else if (roll < 0.95) {
        validFrom = subDays(subMonths(now, 12), random.int(5, 60)); // already expired
        counts.expired += 1;
      } else {
        counts.none += 1; // not trained yet
        continue;
      }
      const result = await CompetenceService.registerCompetenceEntry(
        plant.id,
        registerCompetenceEntryInput.parse({
          competenceWorkerId: worker.id,
          competenceTypeId: type.id,
          training: {
            provider: "Centro de Formação Demo",
            trainerName: "Formador Demo",
            completedAt: subDays(validFrom, 7),
            durationHours: random.pick([4, 8, 16]),
            result: "PASSED",
          },
          assessment: {
            assessedAt: subDays(validFrom, 2),
            assessorName: "Avaliador Externo Demo",
            method: "PRACTICAL_TEST",
            result: "COMPETENT",
            score: random.int(75, 100),
          },
          authorization: { validFrom },
        }),
        actors.n3,
      );
      if (result.authorizationId && validFrom > subMonths(now, 11)) grantedIds.push(result.authorizationId);
    }
  }

  if (grantedIds.length) {
    await CompetenceService.suspendAuthorization(
      plant.id,
      random.pick(grantedIds),
      "Comportamento inseguro observado durante a operação (exemplo de demonstração).",
      actors.n3,
    );
  }
  return counts;
}

const EQUIPMENT_PLAN: ReadonlyArray<{ typeCode: string; prefix: string; count: number }> = [
  { typeCode: "EXTINGUISHER", prefix: "EXT", count: 10 },
  { typeCode: "HOSE_REEL", prefix: "CAR", count: 3 },
  { typeCode: "EMERGENCY_LIGHT", prefix: "BLE", count: 2 },
];

async function seedFireEquipment(plant: Plant, actors: Actors, now: Date, random: DemoRandom) {
  if (await prisma.fireEquipment.count({ where: { plantId: plant.id } })) return { skipped: true };

  const [types, workstations] = await Promise.all([
    prisma.fireEquipmentType.findMany({ where: { plantId: plant.id, isActive: true }, select: { id: true, code: true } }),
    prisma.workstation.findMany({ where: { plantId: plant.id }, orderBy: { code: "asc" }, select: { id: true } }),
  ]);
  const typeIdByCode = new Map(types.map((type) => [type.code, type.id]));

  const equipment: Array<{ id: string; typeId: string }> = [];
  for (const plan of EQUIPMENT_PLAN) {
    const typeId = typeIdByCode.get(plan.typeCode);
    if (!typeId) throw new Error(`demo-seed: tipo SCIE em falta (${plan.typeCode}).`);
    for (let n = 1; n <= plan.count; n += 1) {
      const created = await FireEquipmentService.create(
        { id: plant.id, code: plant.code },
        createFireEquipmentInput.parse({
          fireEquipmentTypeId: typeId,
          internalCode: `${plan.prefix}-${String(n).padStart(3, "0")}`,
          workstationId: random.pick(workstations).id,
          locationDescription: random.pick(["Junto à saída de emergência", "Parede norte do pavilhão", "Entrada do armazém", "Corredor central", "Zona de cargas"]),
          extinguishingAgent: plan.typeCode === "EXTINGUISHER" ? random.pick(Object.values(FireExtinguishingAgent)) : null,
          installedAt: subMonths(now, random.int(18, 60)),
        }),
        actors.n3,
      );
      equipment.push({ id: created.id, typeId });
    }
  }

  const recordChecklist = async (input: {
    equipmentId: string;
    typeId: string;
    frequency: FireChecklistFrequency;
    performedAt: Date;
    failCriticalItem?: boolean;
  }) => {
    const template = await prisma.fireChecklistTemplate.findFirstOrThrow({
      where: { plantId: plant.id, fireEquipmentTypeId: input.typeId, frequency: input.frequency, isActive: true },
      include: { items: { where: { isActive: true }, orderBy: { displayOrder: "asc" } } },
    });
    // A NOK on a critical item is what opens a non-conformity (a non-critical NOK is only an observation).
    const failedItem = input.failCriticalItem ? template.items.find((templateItem) => templateItem.isCritical) : undefined;
    await FireEquipmentService.recordExecution(
      { id: plant.id },
      createFireChecklistExecutionInput.parse({
        fireEquipmentId: input.equipmentId,
        frequency: input.frequency,
        performedAt: input.performedAt,
        observations: failedItem ? "Peso abaixo do mínimo; extintor retirado e substituição pedida." : null,
        itemResponses: template.items.map((templateItem) => ({
          itemId: templateItem.id,
          value: templateItem.id === failedItem?.id ? FireChecklistItemValue.NOK : FireChecklistItemValue.OK,
          numericValue: templateItem.responseType === "NUMERIC" ? random.int(5, 7) : null,
        })),
      }),
      actors.n3,
    );
    return Boolean(failedItem);
  };

  // 12 of 15 inspected: 9 up to date, 3 more than a quarter ago (overdue); the last 3 never inspected.
  // The up-to-date ones also have their annual inspection; the first (an extinguisher) fails a
  // critical annual item, which opens a non-conformity.
  const inspected = equipment.slice(0, 12);
  let nonConformities = 0;
  for (const [index, item] of inspected.entries()) {
    const overdue = index >= 9;
    await recordChecklist({
      equipmentId: item.id,
      typeId: item.typeId,
      frequency: FireChecklistFrequency.QUARTERLY,
      performedAt: overdue ? subDays(now, random.int(100, 140)) : subDays(now, random.int(3, 60)),
    });
    if (overdue) continue;
    const failed = await recordChecklist({
      equipmentId: item.id,
      typeId: item.typeId,
      frequency: FireChecklistFrequency.ANNUAL,
      performedAt: index === 0 ? subDays(now, random.int(2, 10)) : subDays(now, random.int(30, 300)),
      failCriticalItem: index === 0,
    });
    if (failed) nonConformities += 1;
  }
  return { equipment: equipment.length, inspected: inspected.length, nonConformities };
}

/** Hours worked for the demo year, plus a fictitious previous year for the year-on-year comparisons. */
async function seedKpiInputs(plant: Plant, now: Date, random: DemoRandom) {
  const currentMonth = startOfMonth(now);
  for (let back = 0; back <= 12; back += 1) {
    const month = subMonths(currentMonth, back);
    const year = month.getFullYear();
    const monthNumber = month.getMonth() + 1;
    const hoursWorked = new Prisma.Decimal(random.int(56000, 64000));
    await prisma.safetyKpiMonthlyInput.upsert({
      where: { plantId_year_month: { plantId: plant.id, year, month: monthNumber } },
      update: { hoursWorked },
      create: { id: stableUuid(`demo:kpi-input:${plant.code}:${year}-${monthNumber}`), plantId: plant.id, year, month: monthNumber, hoursWorked },
    });
  }

  const firstDemoMonth = startOfMonth(subMonths(now, 12));
  for (let back = 1; back <= 12; back += 1) {
    const month = subMonths(firstDemoMonth, back);
    const year = month.getFullYear();
    const monthNumber = month.getMonth() + 1;
    const accidents = random.chance(0.35) ? 1 : 0;
    const data = {
      hoursWorked: new Prisma.Decimal(random.int(55000, 63000)),
      employees: random.int(340, 370),
      accidents,
      lostDays: new Prisma.Decimal(accidents ? random.int(3, 25) : 0),
      seriousInjury: 0,
      minorInjury: accidents,
      firstAids: random.int(1, 4),
      nearMiss: random.int(3, 9),
      unsafeCondition: random.int(8, 16),
      unsafeAct: random.int(8, 16),
    };
    await prisma.safetyKpiHistory.upsert({
      where: { plantId_year_month: { plantId: plant.id, year, month: monthNumber } },
      update: data,
      create: { id: stableUuid(`demo:kpi-history:${plant.code}:${year}-${monthNumber}`), plantId: plant.id, year, month: monthNumber, ...data },
    });
  }
}

/** Promotes a few approved S-EWO to the knowledge base (no embeddings: text search only). */
async function seedKnowledgeBase(plant: Plant, actors: Actors) {
  const sewos = await prisma.sEWO.findMany({
    where: { plantId: plant.id, status: SEWOStatus.APPROVED, deletedAt: null },
    orderBy: { analysisDate: "desc" },
    take: 4,
    select: { id: true },
  });
  let documents = 0;
  for (const sewo of sewos) {
    const result = await synchronizeApprovedSewoToIncidentKnowledge({ sewoId: sewo.id, plantId: plant.id, actorUserId: actors.n2 });
    if (result.documentId) documents += 1;
  }
  return { documents };
}

export async function seedDemoModules(input: { plant: Plant; actors: Actors; now: Date; withKnowledgeBase: boolean }) {
  const { plant, actors, now } = input;
  const random = createRandom(`modules:${plant.code}`);
  const competences = await seedCompetences(plant, actors, now, random);
  const fire = await seedFireEquipment(plant, actors, now, random);
  await seedKpiInputs(plant, now, random);
  const knowledge = input.withKnowledgeBase ? await seedKnowledgeBase(plant, actors) : null;
  return { competences, fire, knowledge };
}
