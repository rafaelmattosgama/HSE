// Demo data for the local demo (npm run demo / npm run demo:seed). Only runs with
// DEMO_MODE=true against the local ehs_demo database. Everything here is fictitious.
// Idempotent: ids are derived from stable keys, so a re-run updates in place.
import { hash } from "bcryptjs";
import { addDays, differenceInCalendarDays } from "date-fns";
import {
  ActionSourceType,
  ActionStatus,
  CommunicationSource,
  CommunicationType,
  RoleCode,
  SEWOStatus,
  SeverityPotential,
  type Plant,
  type Prisma,
} from "@prisma/client";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, DEMO_PLANTS, assertDemoModeSafe, isDemoMode } from "../lib/demo-mode";
import {
  gerarCodigoAbreviado,
  gerarCodigoCompleto,
  gerarCodigoSewo,
  getCommunicationRecordType,
  normalizeCodigoFabrica,
  type RecordCodeType,
} from "../lib/record-code";
import {
  calculateLeaveFields,
  prisma,
  stableUuid,
  syncUserRoles,
  upsertAction,
  upsertCommunication,
  upsertCompetenceTypes,
  upsertFireChecklistTemplates,
  upsertFireEquipmentTypes,
  upsertMasterData,
  upsertSEWO,
  upsertSeedUser,
  upsertSewoCauseCatalog,
} from "./seed-helpers";
import { DEMO_WORKERS } from "./demo-data/people";
import { buildDemoHistory, type DemoAction, type DemoCommunication } from "./demo-data/history";
import { createRandom, type DemoRandom } from "./demo-data/random";
import { seedDemoModules } from "./demo-data/modules";

type PlantCode = (typeof DEMO_PLANTS)[number]["code"];
type PlantActors = { n2: string; n3: string; n4: string; n5: string };

const INJURY_TYPES = new Set<CommunicationType>([CommunicationType.FIRST_AID, CommunicationType.ACCIDENT]);

async function roleId(code: RoleCode) {
  return (await prisma.role.findUniqueOrThrow({ where: { code } })).id;
}

async function upsertDemoUser(input: { email: string; name: string; passwordHash: string }) {
  const user = await upsertSeedUser({ email: input.email, name: input.name, language: "pt", roleBindings: [] }, input.passwordHash);
  await prisma.user.update({ where: { id: user.id }, data: { forcePasswordChange: false } });
  return user;
}

async function seedDemoUsers(plants: Plant[]) {
  const passwordHash = await hash(DEMO_PASSWORD, 12);
  const plantByCode = new Map(plants.map((plant) => [plant.code, plant]));
  const n3ByPlant = new Map<string, string>();

  for (const account of DEMO_ACCOUNTS) {
    const user = await upsertDemoUser({ email: account.email, name: account.name, passwordHash });
    const plantId = account.plantCode ? plantByCode.get(account.plantCode)?.id ?? null : null;
    await syncUserRoles(user.id, [{ plantId, roleId: await roleId(RoleCode[account.role]) }]);
    if (account.role === "N3_SAFETY" && account.plantCode) n3ByPlant.set(account.plantCode, user.id);
  }

  // Background actors (owners, validators, approvers) that make the history credible.
  const actorRoles = [
    { key: "n2", role: RoleCode.N2_PLANT_MANAGER, label: "Diretor" },
    { key: "n3", role: RoleCode.N3_SAFETY, label: "Técnico de Segurança" },
    { key: "n4", role: RoleCode.N4_SUPERVISOR, label: "Supervisor" },
    { key: "n5", role: RoleCode.N5_OPERATOR, label: "Operador" },
  ] as const;

  const actorsByPlant = new Map<string, PlantActors>();
  for (const plant of plants) {
    const actors: Partial<PlantActors> = {};
    for (const actor of actorRoles) {
      const existingN3 = actor.key === "n3" ? n3ByPlant.get(plant.code) : undefined;
      if (existingN3) {
        actors.n3 = existingN3;
        continue;
      }
      const user = await upsertDemoUser({
        email: `${actor.key}.${plant.code}@maxsafety.demo`,
        name: `${actor.label} ${plant.name}`,
        passwordHash,
      });
      await syncUserRoles(user.id, [{ plantId: plant.id, roleId: await roleId(actor.role) }]);
      actors[actor.key] = user.id;
    }
    actorsByPlant.set(plant.code, actors as PlantActors);
  }
  return actorsByPlant;
}

async function loadMasterData(plantId: string) {
  const where = { plantId };
  const orderBy = { code: "asc" as const };
  const [areas, lines, workstations, equipment, shifts, riskThemes, actTypes, conditionTypes, nearMissTypes, bodyParts, injuryTypes] =
    await prisma.$transaction([
      prisma.area.findMany({ where, orderBy, select: { id: true } }),
      prisma.line.findMany({ where, orderBy, select: { id: true } }),
      prisma.workstation.findMany({ where, orderBy, select: { id: true } }),
      prisma.equipment.findMany({ where, orderBy, select: { id: true } }),
      prisma.shift.findMany({ where, orderBy, select: { id: true } }),
      prisma.riskTheme.findMany({ where, orderBy, select: { id: true } }),
      prisma.unsafeActType.findMany({ where, orderBy, select: { id: true } }),
      prisma.unsafeConditionType.findMany({ where, orderBy, select: { id: true } }),
      prisma.nearMissType.findMany({ where, orderBy, select: { id: true } }),
      prisma.bodyPart.findMany({ where, orderBy, select: { id: true } }),
      prisma.injuryType.findMany({ where, orderBy, select: { id: true } }),
    ]);
  const ids = (rows: Array<{ id: string }>, label: string) => {
    if (!rows.length) throw new Error(`demo-seed: master data em falta (${label}).`);
    return rows.map((row) => row.id);
  };
  return {
    areas: ids(areas, "area"),
    lines: ids(lines, "line"),
    workstations: ids(workstations, "workstation"),
    equipment: ids(equipment, "equipment"),
    shifts: ids(shifts, "shift"),
    riskThemes: ids(riskThemes, "riskTheme"),
    actTypes: ids(actTypes, "unsafeActType"),
    conditionTypes: ids(conditionTypes, "unsafeConditionType"),
    nearMissTypes: ids(nearMissTypes, "nearMissType"),
    bodyParts: ids(bodyParts, "bodyPart"),
    injuryTypes: ids(injuryTypes, "injuryType"),
  };
}

type MasterData = Awaited<ReturnType<typeof loadMasterData>>;

/** Assigns record codes in event order, exactly as the app would have when they were reported. */
function createCodeAllocator(plantCode: string) {
  const codigoFabrica = normalizeCodigoFabrica(plantCode);
  const counters = new Map<string, number>();
  const next = (entity: "COMMUNICATION" | "SEWO", tipo: RecordCodeType, ano: number) => {
    const key = `${entity}|${tipo}|${ano}`;
    const value = (counters.get(key) ?? 0) + 1;
    counters.set(key, value);
    return value;
  };
  return {
    codigoFabrica,
    communication(type: CommunicationType, eventDatetime: Date) {
      const tipo = getCommunicationRecordType(type);
      if (!tipo) return {};
      const ano = eventDatetime.getUTCFullYear();
      const numeroSequencial = next("COMMUNICATION", tipo, ano);
      return {
        tipo,
        codigoFabrica,
        ano,
        numeroSequencial,
        codigoCompleto: gerarCodigoCompleto(tipo, codigoFabrica, ano, numeroSequencial),
        codigoAbreviado: gerarCodigoAbreviado(ano, numeroSequencial),
      };
    },
    sewo(type: CommunicationType, analysisDate: Date) {
      const tipo = getCommunicationRecordType(type);
      if (!tipo) return {};
      const ano = analysisDate.getUTCFullYear();
      const numeroSequencial = next("SEWO", tipo, ano);
      return { tipo, codigoFabrica, ano, numeroSequencial, codigoSewo: gerarCodigoSewo(codigoFabrica, tipo, ano, numeroSequencial) };
    },
    /** Keeps the app's sequences ahead of the seeded codes, so new records never collide. */
    async persist() {
      for (const [key, currentValue] of counters) {
        const [entityType, tipo, ano] = key.split("|");
        await prisma.recordCodeSequence.upsert({
          where: { entityType_tipo_codigoFabrica_ano: { entityType, tipo, codigoFabrica, ano: Number(ano) } },
          update: { currentValue },
          create: { entityType, tipo, codigoFabrica, ano: Number(ano), currentValue },
        });
      }
    },
  };
}

function communicationData(input: {
  plant: Plant;
  communication: DemoCommunication;
  actors: PlantActors;
  master: MasterData;
  random: DemoRandom;
  now: Date;
}): Prisma.CommunicationUncheckedCreateInput {
  const { plant, communication: c, actors, master, random, now } = input;
  const worker = DEMO_WORKERS[c.workerIndex];
  const validatedAt = c.validatedDaysAfter === null ? null : addDays(c.eventDatetime, c.validatedDaysAfter);
  const data: Prisma.CommunicationUncheckedCreateInput = {
    id: stableUuid(`demo:${c.key}`),
    plantId: plant.id,
    type: c.type,
    status: c.status,
    source: random.pick([CommunicationSource.BACKOFFICE, CommunicationSource.TOKEN_REPORT, CommunicationSource.TOKEN_KIOSK]),
    eventDatetime: c.eventDatetime,
    reportedAt: c.reportedAt,
    reporterName: worker.name,
    reporterEmployeeNo: worker.employeeNo,
    areaId: random.pick(master.areas),
    lineId: random.pick(master.lines),
    workstationId: random.pick(master.workstations),
    equipmentId: random.pick(master.equipment),
    shiftId: random.pick(master.shifts),
    riskThemeId: random.pick(master.riskThemes),
    description: c.description,
    validatedBy: validatedAt ? actors.n3 : null,
    validatedAt,
    validationNotes: validatedAt ? "Validada pela Segurança." : null,
  };

  if (c.type === CommunicationType.UNSAFE_ACT) data.unsafeActTypeId = random.pick(master.actTypes);
  if (c.type === CommunicationType.UNSAFE_CONDITION) data.unsafeConditionTypeId = random.pick(master.conditionTypes);
  if (c.type === CommunicationType.NEAR_MISS) data.nearMissTypeId = random.pick(master.nearMissTypes);
  if (INJURY_TYPES.has(c.type)) {
    const isAccident = c.type === CommunicationType.ACCIDENT;
    const returnCandidate = addDays(c.eventDatetime, random.int(3, 25));
    const returnDate = isAccident && returnCandidate <= now ? returnCandidate : null;
    const leave = calculateLeaveFields(c.eventDatetime, isAccident, returnDate);
    Object.assign(data, {
      severityPotential: isAccident ? SeverityPotential.HIGH : random.pick([SeverityPotential.LOW, SeverityPotential.MED]),
      bodyPartId: random.pick(master.bodyParts),
      injuryTypeId: random.pick(master.injuryTypes),
      hasLeave: isAccident,
      returnDate,
      lostDays: leave.lostDays,
      classification: leave.classification,
    });
  }
  return data;
}

function sewoStatus(communication: DemoCommunication, actions: DemoAction[], now: Date, index: number) {
  if (actions.length && actions.every((action) => action.status === ActionStatus.CLOSED)) return SEWOStatus.CLOSED;
  if (differenceInCalendarDays(now, communication.eventDatetime) > 21) return SEWOStatus.APPROVED;
  return index % 2 === 0 ? SEWOStatus.IN_APPROVAL : SEWOStatus.DRAFT;
}

async function seedPlantHistory(input: { plant: Plant; catalogId: string; actors: PlantActors; now: Date }) {
  const { plant, catalogId, actors, now } = input;
  const history = buildDemoHistory({ plantCode: plant.code, now, months: 12 });
  const master = await loadMasterData(plant.id);
  const random = createRandom(`seed:${plant.code}`);
  const codes = createCodeAllocator(plant.code);
  const causeItems = await prisma.sEWOCauseItem.findMany({
    where: { category: { versionId: catalogId } },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  const actionsByCommunication = new Map<string, DemoAction[]>();
  for (const action of history.actions) {
    const list = actionsByCommunication.get(action.communicationKey) ?? [];
    list.push(action);
    actionsByCommunication.set(action.communicationKey, list);
  }

  const ordered = [...history.communications].sort((a, b) => a.eventDatetime.getTime() - b.eventDatetime.getTime());
  let actionSequence = 0;
  let sewoIndex = 0;

  for (const c of ordered) {
    const communication = await upsertCommunication({
      ...communicationData({ plant, communication: c, actors, master, random, now }),
      ...codes.communication(c.type, c.eventDatetime),
    });

    const actions = actionsByCommunication.get(c.key) ?? [];
    const actionIds: string[] = [];
    for (const a of actions) {
      actionSequence += 1;
      const action = await upsertAction({
        id: stableUuid(`demo:${a.key}`),
        plantId: plant.id,
        sourceType: ActionSourceType.COMMUNICATION,
        communicationId: communication.id,
        category: a.category,
        priority: a.priority,
        title: a.title,
        description: `${a.title}. Origem: ${c.description}.`,
        ownerUserId: a.priority === "HIGH" ? actors.n3 : actors.n4,
        dueDate: a.dueDate,
        status: a.status,
        closedAt: a.closedAt,
        closedBy: a.closedAt ? actors.n4 : null,
        closureComment: a.closedAt ? "Ação concluída e verificada no local." : null,
        sequenceNumber: actionSequence,
      });
      actionIds.push(action.id);
    }

    if (!c.withSewo || c.validatedDaysAfter === null) continue;
    const status = sewoStatus(c, actions, now, sewoIndex);
    sewoIndex += 1;
    const analysisDate = addDays(c.eventDatetime, c.validatedDaysAfter);
    const approved = status === SEWOStatus.APPROVED || status === SEWOStatus.CLOSED;
    const sewo = await upsertSEWO({
      id: stableUuid(`demo:sewo:${c.key}`),
      plantId: plant.id,
      communicationId: communication.id,
      eventClassification: c.type,
      areaId: communication.areaId,
      lineId: communication.lineId,
      shiftId: communication.shiftId,
      analysisDate,
      performedByUserId: actors.n3,
      whatText: c.description,
      whereText: "Zona de produção, junto ao posto indicado na comunicação.",
      whoText: DEMO_WORKERS[c.workerIndex].name,
      usualWorkYesNo: random.chance(0.8),
      whichText: c.type,
      howText: "Condições do posto e método de trabalho analisados com a equipa no local.",
      immediateCorrectiveActionText: "Zona isolada e situação corrigida de imediato.",
      status,
      approvedByUserId: approved ? actors.n2 : null,
      approvedAt: approved ? addDays(analysisDate, 2) : null,
      approvalComment: approved ? "Análise aprovada." : null,
      causeCatalogVersionId: catalogId,
      ...codes.sewo(c.type, c.eventDatetime),
    });

    await prisma.sEWOCauseSelection.deleteMany({ where: { sewoId: sewo.id } });
    const selected = new Set<string>();
    const selectionCount = Math.min(causeItems.length, random.int(2, 3));
    while (selected.size < selectionCount) selected.add(random.pick(causeItems).id);
    for (const [index, causeItemId] of [...selected].entries()) {
      await prisma.sEWOCauseSelection.create({
        data: {
          id: stableUuid(`demo:sewo-cause:${sewo.id}:${causeItemId}`),
          sewoId: sewo.id,
          causeItemId,
          selected: true,
          isRootCause: index === 0,
          comment: index === 0 ? "Causa raiz identificada na análise." : "Fator contributivo.",
        },
      });
    }
    for (const actionId of actionIds) {
      await prisma.sEWOActionLink.upsert({
        where: { sewoId_actionId: { sewoId: sewo.id, actionId } },
        update: {},
        create: { id: stableUuid(`demo:sewo-action-link:${sewo.id}:${actionId}`), sewoId: sewo.id, actionId },
      });
    }
  }

  await codes.persist();
  return { communications: ordered.length, actions: actionSequence, sewos: sewoIndex };
}

export async function seedDemo(now = new Date()) {
  if (!isDemoMode()) throw new Error("demo-seed só corre com DEMO_MODE=true (use npm run demo:seed).");
  assertDemoModeSafe({
    DEMO_MODE: true,
    APP_ENV: process.env.APP_ENV ?? "development",
    DATABASE_URL: process.env.DATABASE_URL ?? "",
  });

  for (const code of Object.values(RoleCode)) {
    await prisma.role.upsert({ where: { code }, update: {}, create: { code } });
  }
  const catalog = await upsertSewoCauseCatalog();

  const plants: Plant[] = [];
  for (const definition of DEMO_PLANTS) {
    const plant = await prisma.plant.upsert({
      where: { code: definition.code },
      update: { ...definition, isActive: true },
      create: { ...definition },
    });
    await upsertMasterData(plant.id);
    await upsertCompetenceTypes(plant.id);
    await upsertFireEquipmentTypes(plant.id);
    await upsertFireChecklistTemplates(plant.id);
    for (const worker of DEMO_WORKERS) {
      await prisma.employeeDirectory.upsert({
        where: { plantId_employeeNo: { plantId: plant.id, employeeNo: worker.employeeNo } },
        update: { name: worker.name, isActive: true },
        create: { plantId: plant.id, employeeNo: worker.employeeNo, name: worker.name, isActive: true },
      });
    }
    plants.push(plant);
  }

  const actorsByPlant = await seedDemoUsers(plants);
  for (const plant of plants) {
    const actors = actorsByPlant.get(plant.code as PlantCode);
    if (!actors) throw new Error(`demo-seed: atores em falta para ${plant.code}.`);
    const counts = await seedPlantHistory({ plant, catalogId: catalog.id, actors, now });
    console.log(`[demo] ${plant.name}: ${counts.communications} comunicações, ${counts.actions} ações, ${counts.sewos} S-EWO.`);
    const modules = await seedDemoModules({ plant, actors, now, withKnowledgeBase: plant.code === DEMO_PLANTS[0].code });
    console.log(`[demo] ${plant.name}: módulos ${JSON.stringify(modules)}`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("prisma/demo-seed.ts")) {
  seedDemo()
    // Explicit exit: the app services used by the modules seed keep their own
    // prisma/redis connections open.
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
