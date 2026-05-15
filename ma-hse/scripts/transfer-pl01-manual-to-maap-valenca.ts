import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE_PLANT_CODE = "pl01";
const TARGET_PLANT_CODE = "maap";
const APPLY = process.argv.includes("--apply");
const SEED_TAG_PATTERN = "[SEED-MVP]%";

type PlantRef = {
  id: string;
  code: string;
  name: string;
};

type MasterRow = {
  id: string;
  plantId: string;
  code: string;
  name: string;
  isActive: boolean;
};

type EmployeeRow = {
  id: string;
  plantId: string;
  employeeNo: string;
  name: string;
  dept: string | null;
  shiftId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type CommunicationRow = {
  id: string;
  areaId: string | null;
  lineId: string | null;
  workstationId: string | null;
  equipmentId: string | null;
  riskThemeId: string;
  unsafeActTypeId: string | null;
  unsafeConditionTypeId: string | null;
  nearMissTypeId: string | null;
  bodyPartId: string | null;
  injuryTypeId: string | null;
  shiftId: string | null;
  targetEmployeeId: string | null;
};

type MonthlyInputRow = Record<string, unknown> & {
  id: string;
  year: number;
  month: number;
  workerCount: number | null;
  hoursWorked: Prisma.Decimal | null;
  standardHours: Prisma.Decimal | null;
};

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const masterTables = new Set([
  "Area",
  "Line",
  "Workstation",
  "Equipment",
  "Shift",
  "RiskTheme",
  "UnsafeActType",
  "UnsafeConditionType",
  "NearMissType",
  "BodyPart",
  "InjuryType",
]);

const monthlyColumns = [
  "workerCount",
  "hoursWorked",
  "standardHours",
  "spillsNumber",
  "energyConsumedMwh",
  "electricityFromGridMwh",
  "selfProducedEnergyMwh",
  "heatingM3",
  "waterConsumedNetworkM3",
  "waterConsumedCapturedM3",
  "compressedAirConsumedM3",
  "compressedAirConsumedMwh",
  "nonHazardousWasteTons",
  "ewc150101PaperCardboardPackagingTons",
  "ewc150102PlasticPackagingTons",
  "ewc150103WoodTons",
  "ewc160117FerrousMetalsTons",
  "ewc160118NonFerrousMetalsCopperTons",
  "ewc170117ConstructionWasteTons",
  "ewc200111Tons",
  "ewc200136ElectricalElectronicEquipmentTons",
  "ewc200139PlasticTons",
  "ewc200301UnsortedUrbanWasteTons",
  "hazardousWasteTons",
  "recycledWasteTons",
] as const;

function assertMasterTable(tableName: string) {
  if (!masterTables.has(tableName)) {
    throw new Error(`Unsupported master table ${tableName}`);
  }
}

function decimalEquals(value: unknown, expected: number) {
  if (value === null || typeof value === "undefined") return false;
  return Number(value) === expected;
}

function isSimulationMonthlyCoreValue(row: MonthlyInputRow) {
  if (row.year !== 2026 || row.month < 1 || row.month > 4) return false;

  return (
    row.workerCount === 120 + row.month &&
    decimalEquals(row.hoursWorked, 15000 + row.month * 500) &&
    decimalEquals(row.standardHours, 16000 + row.month * 500)
  );
}

function hasAnyMonthlyValue(row: Record<string, unknown>) {
  return monthlyColumns.some((column) => row[column] !== null && typeof row[column] !== "undefined");
}

function toJson(value: unknown) {
  return JSON.stringify(
    value,
    (_key, current) => {
      if (typeof current === "bigint") return current.toString();
      if (current instanceof Prisma.Decimal) return current.toString();
      return current;
    },
    2,
  );
}

async function getPlant(code: string) {
  return prisma.plant.findUniqueOrThrow({
    where: { code },
    select: { id: true, code: true, name: true },
  });
}

async function countRows(plantId: string) {
  const [manualCommunications] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM "Communication"
    WHERE "plantId" = ${plantId}
      AND description NOT ILIKE ${SEED_TAG_PATTERN}
  `;

  const [simulationCommunications] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM "Communication"
    WHERE "plantId" = ${plantId}
      AND description ILIKE '[SEED-MVP] simulation%'
  `;

  const [manualActions] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(*)::bigint AS count
    FROM "Action" a
    WHERE a."plantId" = ${plantId}
      AND a.title NOT ILIKE ${SEED_TAG_PATTERN}
      AND a.description NOT ILIKE ${SEED_TAG_PATTERN}
  `;

  return {
    manualCommunications: Number(manualCommunications?.count ?? 0),
    manualActions: Number(manualActions?.count ?? 0),
    simulationCommunications: Number(simulationCommunications?.count ?? 0),
  };
}

async function writeBackup(source: PlantRef, target: PlantRef) {
  const [
    communications,
    actions,
    monthlyInputs,
    safetyKpiInputs,
    systemParameters,
    notifications,
    auditLogs,
    externalInvitations,
  ] = await Promise.all([
    prisma.$queryRaw`
      SELECT *
      FROM "Communication"
      WHERE "plantId" = ${source.id}
        AND description NOT ILIKE ${SEED_TAG_PATTERN}
      ORDER BY "createdAt", id
    `,
    prisma.$queryRaw`
      SELECT *
      FROM "Action"
      WHERE "plantId" = ${source.id}
        AND title NOT ILIKE ${SEED_TAG_PATTERN}
        AND description NOT ILIKE ${SEED_TAG_PATTERN}
      ORDER BY "createdAt", id
    `,
    prisma.$queryRaw`SELECT * FROM "PlantMonthlyInput" WHERE "plantId" = ${source.id} ORDER BY year, month`,
    prisma.$queryRaw`SELECT * FROM "SafetyKpiMonthlyInput" WHERE "plantId" = ${source.id} ORDER BY year, month`,
    prisma.$queryRaw`
      SELECT *
      FROM "SystemParameter"
      WHERE "plantId" = ${source.id}
        AND key IN ('MONTHLY_INPUTS_LAYOUT', 'MONTHLY_INPUTS_LAYOUT_2026_ROWS')
      ORDER BY key
    `,
    prisma.$queryRaw`
      SELECT *
      FROM "Notification"
      WHERE "plantId" = ${source.id}
        AND title NOT ILIKE ${SEED_TAG_PATTERN}
        AND body NOT ILIKE ${`%[SEED-MVP]%`}
      ORDER BY "createdAt", id
    `,
    prisma.$queryRaw`SELECT * FROM "AuditLog" WHERE "plantId" = ${source.id} ORDER BY "createdAt", id`,
    prisma.$queryRaw`SELECT * FROM "ExternalCompanyInvitation" WHERE "plantId" = ${source.id} ORDER BY "sentAt", id`,
  ]);

  const backup = {
    createdAt: new Date().toISOString(),
    source,
    target,
    communications,
    actions,
    monthlyInputs,
    safetyKpiInputs,
    systemParameters,
    notifications,
    auditLogs,
    externalInvitations,
  };

  const backupPath = path.join(
    process.cwd(),
    `tmp_transfer_pl01_to_maap_valenca_${new Date().toISOString().replaceAll(/[:.]/g, "-")}.json`,
  );
  await fs.writeFile(backupPath, toJson(backup), "utf8");
  return backupPath;
}

async function ensureMasterByCode(tx: Tx, tableName: string, sourceId: string | null, targetPlantId: string) {
  if (!sourceId) return null;
  assertMasterTable(tableName);

  const [sourceRow] = await tx.$queryRawUnsafe<MasterRow[]>(
    `SELECT id, "plantId", code, name, "isActive" FROM "${tableName}" WHERE id = $1 LIMIT 1`,
    sourceId,
  );
  if (!sourceRow) return null;

  const [targetRow] = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM "${tableName}" WHERE "plantId" = $1 AND code = $2 LIMIT 1`,
    targetPlantId,
    sourceRow.code,
  );
  if (targetRow) return targetRow.id;

  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO "${tableName}" (id, "plantId", code, name, "isActive") VALUES ($1, $2, $3, $4, $5)`,
    id,
    targetPlantId,
    sourceRow.code,
    sourceRow.name,
    sourceRow.isActive,
  );
  return id;
}

async function ensureEmployeeByNumber(tx: Tx, sourceId: string | null, targetPlantId: string) {
  if (!sourceId) return null;

  const [sourceRow] = await tx.$queryRaw<EmployeeRow[]>`
    SELECT id, "plantId", "employeeNo", name, dept, "shiftId", "isActive", "createdAt", "updatedAt"
    FROM "EmployeeDirectory"
    WHERE id = ${sourceId}
    LIMIT 1
  `;
  if (!sourceRow) return null;

  const [targetRow] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "EmployeeDirectory"
    WHERE "plantId" = ${targetPlantId}
      AND "employeeNo" = ${sourceRow.employeeNo}
    LIMIT 1
  `;
  if (targetRow) return targetRow.id;

  const targetShiftId = await ensureMasterByCode(tx, "Shift", sourceRow.shiftId, targetPlantId);
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "EmployeeDirectory" (
      id, "plantId", "employeeNo", name, dept, "shiftId", "isActive", "createdAt", "updatedAt"
    )
    VALUES (
      ${id}, ${targetPlantId}, ${sourceRow.employeeNo}, ${sourceRow.name}, ${sourceRow.dept},
      ${targetShiftId}, ${sourceRow.isActive}, ${sourceRow.createdAt}, ${sourceRow.updatedAt}
    )
  `;
  return id;
}

async function moveCommunications(tx: Tx, source: PlantRef, target: PlantRef) {
  const rows = await tx.$queryRaw<CommunicationRow[]>`
    SELECT
      id,
      "areaId",
      "lineId",
      "workstationId",
      "equipmentId",
      "riskThemeId",
      "unsafeActTypeId",
      "unsafeConditionTypeId",
      "nearMissTypeId",
      "bodyPartId",
      "injuryTypeId",
      "shiftId",
      "targetEmployeeId"
    FROM "Communication"
    WHERE "plantId" = ${source.id}
      AND description NOT ILIKE ${SEED_TAG_PATTERN}
    ORDER BY "createdAt", id
  `;

  for (const row of rows) {
    const areaId = await ensureMasterByCode(tx, "Area", row.areaId, target.id);
    const lineId = await ensureMasterByCode(tx, "Line", row.lineId, target.id);
    const workstationId = await ensureMasterByCode(tx, "Workstation", row.workstationId, target.id);
    const equipmentId = await ensureMasterByCode(tx, "Equipment", row.equipmentId, target.id);
    const riskThemeId = await ensureMasterByCode(tx, "RiskTheme", row.riskThemeId, target.id);
    const unsafeActTypeId = await ensureMasterByCode(tx, "UnsafeActType", row.unsafeActTypeId, target.id);
    const unsafeConditionTypeId = await ensureMasterByCode(tx, "UnsafeConditionType", row.unsafeConditionTypeId, target.id);
    const nearMissTypeId = await ensureMasterByCode(tx, "NearMissType", row.nearMissTypeId, target.id);
    const bodyPartId = await ensureMasterByCode(tx, "BodyPart", row.bodyPartId, target.id);
    const injuryTypeId = await ensureMasterByCode(tx, "InjuryType", row.injuryTypeId, target.id);
    const shiftId = await ensureMasterByCode(tx, "Shift", row.shiftId, target.id);
    const targetEmployeeId = await ensureEmployeeByNumber(tx, row.targetEmployeeId, target.id);

    if (!riskThemeId) {
      throw new Error(`Communication ${row.id} has no target risk theme mapping`);
    }

    await tx.$executeRaw`
      UPDATE "Communication"
      SET
        "plantId" = ${target.id},
        "areaId" = ${areaId},
        "lineId" = ${lineId},
        "workstationId" = ${workstationId},
        "equipmentId" = ${equipmentId},
        "riskThemeId" = ${riskThemeId},
        "unsafeActTypeId" = ${unsafeActTypeId},
        "unsafeConditionTypeId" = ${unsafeConditionTypeId},
        "nearMissTypeId" = ${nearMissTypeId},
        "bodyPartId" = ${bodyPartId},
        "injuryTypeId" = ${injuryTypeId},
        "shiftId" = ${shiftId},
        "targetEmployeeId" = ${targetEmployeeId}
      WHERE id = ${row.id}
    `;
  }

  return rows.map((row) => row.id);
}

async function moveActions(tx: Tx, source: PlantRef, target: PlantRef, communicationIds: string[]) {
  const rows = await tx.$queryRaw<Array<{ id: string; sequenceNumber: number | null }>>`
    SELECT id, "sequenceNumber"
    FROM "Action"
    WHERE "plantId" = ${source.id}
      AND (
        "communicationId" = ANY(${communicationIds}::text[])
        OR (
          title NOT ILIKE ${SEED_TAG_PATTERN}
          AND description NOT ILIKE ${SEED_TAG_PATTERN}
        )
      )
    ORDER BY "createdAt", id
  `;

  const [targetMax] = await tx.$queryRaw<Array<{ maxSeq: number | null }>>`
    SELECT max("sequenceNumber") AS "maxSeq"
    FROM "Action"
    WHERE "plantId" = ${target.id}
  `;
  let nextSequenceNumber = (targetMax?.maxSeq ?? 0) + 1;

  for (const row of rows) {
    let sequenceNumber = row.sequenceNumber;

    if (sequenceNumber !== null) {
      const [conflict] = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM "Action"
        WHERE "plantId" = ${target.id}
          AND "sequenceNumber" = ${sequenceNumber}
        LIMIT 1
      `;
      if (conflict) {
        sequenceNumber = nextSequenceNumber;
        nextSequenceNumber += 1;
      }
    }

    await tx.$executeRaw`
      UPDATE "Action"
      SET "plantId" = ${target.id}, "sequenceNumber" = ${sequenceNumber}
      WHERE id = ${row.id}
    `;
  }

  return rows.map((row) => row.id);
}

async function moveMonthlyInputs(tx: Tx, source: PlantRef, target: PlantRef) {
  const rows = await tx.$queryRaw<MonthlyInputRow[]>`
    SELECT *
    FROM "PlantMonthlyInput"
    WHERE "plantId" = ${source.id}
    ORDER BY year, month
  `;

  let moved = 0;
  let strippedSimulationCore = 0;

  for (const sourceRow of rows) {
    const row: Record<string, unknown> = { ...sourceRow };

    if (isSimulationMonthlyCoreValue(sourceRow)) {
      row.workerCount = null;
      row.hoursWorked = null;
      row.standardHours = null;
      strippedSimulationCore += 1;
    }

    if (!hasAnyMonthlyValue(row)) {
      continue;
    }

    await tx.$executeRaw`
      INSERT INTO "PlantMonthlyInput" (
        id, "plantId", year, month,
        "workerCount", "hoursWorked", "standardHours", "spillsNumber",
        "energyConsumedMwh", "electricityFromGridMwh", "selfProducedEnergyMwh", "heatingM3",
        "waterConsumedNetworkM3", "waterConsumedCapturedM3", "compressedAirConsumedM3", "compressedAirConsumedMwh",
        "nonHazardousWasteTons", "ewc150101PaperCardboardPackagingTons", "ewc150102PlasticPackagingTons",
        "ewc150103WoodTons", "ewc160117FerrousMetalsTons", "ewc160118NonFerrousMetalsCopperTons",
        "ewc170117ConstructionWasteTons", "ewc200111Tons", "ewc200136ElectricalElectronicEquipmentTons",
        "ewc200139PlasticTons", "ewc200301UnsortedUrbanWasteTons", "hazardousWasteTons", "recycledWasteTons",
        "createdAt", "updatedAt"
      )
      VALUES (
        ${randomUUID()}, ${target.id}, ${sourceRow.year}, ${sourceRow.month},
        ${row.workerCount as number | null}, ${row.hoursWorked as Prisma.Decimal | null}, ${row.standardHours as Prisma.Decimal | null},
        ${row.spillsNumber as number | null}, ${row.energyConsumedMwh as Prisma.Decimal | null},
        ${row.electricityFromGridMwh as Prisma.Decimal | null}, ${row.selfProducedEnergyMwh as Prisma.Decimal | null},
        ${row.heatingM3 as Prisma.Decimal | null}, ${row.waterConsumedNetworkM3 as Prisma.Decimal | null},
        ${row.waterConsumedCapturedM3 as Prisma.Decimal | null}, ${row.compressedAirConsumedM3 as Prisma.Decimal | null},
        ${row.compressedAirConsumedMwh as Prisma.Decimal | null}, ${row.nonHazardousWasteTons as Prisma.Decimal | null},
        ${row.ewc150101PaperCardboardPackagingTons as Prisma.Decimal | null},
        ${row.ewc150102PlasticPackagingTons as Prisma.Decimal | null},
        ${row.ewc150103WoodTons as Prisma.Decimal | null}, ${row.ewc160117FerrousMetalsTons as Prisma.Decimal | null},
        ${row.ewc160118NonFerrousMetalsCopperTons as Prisma.Decimal | null},
        ${row.ewc170117ConstructionWasteTons as Prisma.Decimal | null}, ${row.ewc200111Tons as Prisma.Decimal | null},
        ${row.ewc200136ElectricalElectronicEquipmentTons as Prisma.Decimal | null},
        ${row.ewc200139PlasticTons as Prisma.Decimal | null},
        ${row.ewc200301UnsortedUrbanWasteTons as Prisma.Decimal | null},
        ${row.hazardousWasteTons as Prisma.Decimal | null}, ${row.recycledWasteTons as Prisma.Decimal | null},
        ${row.createdAt as Date}, ${row.updatedAt as Date}
      )
      ON CONFLICT ("plantId", year, month) DO UPDATE SET
        "workerCount" = EXCLUDED."workerCount",
        "hoursWorked" = EXCLUDED."hoursWorked",
        "standardHours" = EXCLUDED."standardHours",
        "spillsNumber" = EXCLUDED."spillsNumber",
        "energyConsumedMwh" = EXCLUDED."energyConsumedMwh",
        "electricityFromGridMwh" = EXCLUDED."electricityFromGridMwh",
        "selfProducedEnergyMwh" = EXCLUDED."selfProducedEnergyMwh",
        "heatingM3" = EXCLUDED."heatingM3",
        "waterConsumedNetworkM3" = EXCLUDED."waterConsumedNetworkM3",
        "waterConsumedCapturedM3" = EXCLUDED."waterConsumedCapturedM3",
        "compressedAirConsumedM3" = EXCLUDED."compressedAirConsumedM3",
        "compressedAirConsumedMwh" = EXCLUDED."compressedAirConsumedMwh",
        "nonHazardousWasteTons" = EXCLUDED."nonHazardousWasteTons",
        "ewc150101PaperCardboardPackagingTons" = EXCLUDED."ewc150101PaperCardboardPackagingTons",
        "ewc150102PlasticPackagingTons" = EXCLUDED."ewc150102PlasticPackagingTons",
        "ewc150103WoodTons" = EXCLUDED."ewc150103WoodTons",
        "ewc160117FerrousMetalsTons" = EXCLUDED."ewc160117FerrousMetalsTons",
        "ewc160118NonFerrousMetalsCopperTons" = EXCLUDED."ewc160118NonFerrousMetalsCopperTons",
        "ewc170117ConstructionWasteTons" = EXCLUDED."ewc170117ConstructionWasteTons",
        "ewc200111Tons" = EXCLUDED."ewc200111Tons",
        "ewc200136ElectricalElectronicEquipmentTons" = EXCLUDED."ewc200136ElectricalElectronicEquipmentTons",
        "ewc200139PlasticTons" = EXCLUDED."ewc200139PlasticTons",
        "ewc200301UnsortedUrbanWasteTons" = EXCLUDED."ewc200301UnsortedUrbanWasteTons",
        "hazardousWasteTons" = EXCLUDED."hazardousWasteTons",
        "recycledWasteTons" = EXCLUDED."recycledWasteTons",
        "updatedAt" = EXCLUDED."updatedAt"
    `;

    if (row.hoursWorked !== null && typeof row.hoursWorked !== "undefined") {
      await tx.$executeRaw`
        INSERT INTO "SafetyKpiMonthlyInput" (id, "plantId", year, month, "hoursWorked", "createdAt", "updatedAt")
        VALUES (${randomUUID()}, ${target.id}, ${sourceRow.year}, ${sourceRow.month}, ${row.hoursWorked as Prisma.Decimal}, ${row.createdAt as Date}, ${row.updatedAt as Date})
        ON CONFLICT ("plantId", year, month) DO UPDATE SET
          "hoursWorked" = EXCLUDED."hoursWorked",
          "updatedAt" = EXCLUDED."updatedAt"
      `;
    }

    moved += 1;
  }

  return { moved, strippedSimulationCore };
}

async function moveSystemParameters(tx: Tx, source: PlantRef, target: PlantRef) {
  const rows = await tx.$queryRaw<
    Array<{ key: string; valueJson: Prisma.JsonValue; createdAt: Date; updatedAt: Date }>
  >`
    SELECT key, "valueJson", "createdAt", "updatedAt"
    FROM "SystemParameter"
    WHERE "plantId" = ${source.id}
      AND key IN ('MONTHLY_INPUTS_LAYOUT', 'MONTHLY_INPUTS_LAYOUT_2026_ROWS')
  `;

  for (const row of rows) {
    await tx.$executeRaw`
      INSERT INTO "SystemParameter" (id, "plantId", key, "valueJson", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${target.id}, ${row.key}, CAST(${JSON.stringify(row.valueJson)} AS jsonb), ${row.createdAt}, ${row.updatedAt})
      ON CONFLICT ("plantId", key) DO UPDATE SET
        "valueJson" = EXCLUDED."valueJson",
        "updatedAt" = EXCLUDED."updatedAt"
    `;
  }

  return rows.length;
}

async function moveRelatedRows(tx: Tx, source: PlantRef, target: PlantRef, communicationIds: string[], actionIds: string[]) {
  const auditCommunicationResult = await tx.$executeRaw`
    UPDATE "AuditLog"
    SET "plantId" = ${target.id}
    WHERE "plantId" = ${source.id}
      AND "entityType" = 'Communication'
      AND "entityId" = ANY(${communicationIds}::text[])
  `;

  const auditActionResult = await tx.$executeRaw`
    UPDATE "AuditLog"
    SET "plantId" = ${target.id}
    WHERE "plantId" = ${source.id}
      AND "entityType" = 'Action'
      AND "entityId" = ANY(${actionIds}::text[])
  `;

  const notificationResult = await tx.$executeRaw`
    UPDATE "Notification"
    SET "plantId" = ${target.id}
    WHERE "plantId" = ${source.id}
      AND title NOT ILIKE ${SEED_TAG_PATTERN}
      AND body NOT ILIKE ${`%[SEED-MVP]%`}
  `;

  const invitationResult = await tx.$executeRaw`
    UPDATE "ExternalCompanyInvitation"
    SET "plantId" = ${target.id}
    WHERE "plantId" = ${source.id}
  `;

  return {
    auditLogs: Number(auditCommunicationResult) + Number(auditActionResult),
    notifications: Number(notificationResult),
    externalInvitations: Number(invitationResult),
  };
}

async function main() {
  const source = await getPlant(SOURCE_PLANT_CODE);
  const target = await getPlant(TARGET_PLANT_CODE);
  const beforeSource = await countRows(source.id);
  const beforeTarget = await countRows(target.id);

  console.log(
    toJson({
      mode: APPLY ? "apply" : "dry-run",
      source,
      target,
      before: {
        source: beforeSource,
        target: beforeTarget,
      },
    }),
  );

  if (!APPLY) {
    console.log("Dry-run only. Re-run with --apply to transfer the data.");
    return;
  }

  const backupPath = await writeBackup(source, target);

  const result = await prisma.$transaction(
    async (tx) => {
      const communicationIds = await moveCommunications(tx, source, target);
      const actionIds = await moveActions(tx, source, target, communicationIds);
      const monthly = await moveMonthlyInputs(tx, source, target);
      const systemParameters = await moveSystemParameters(tx, source, target);
      const related = await moveRelatedRows(tx, source, target, communicationIds, actionIds);

      return {
        communications: communicationIds.length,
        actions: actionIds.length,
        monthly,
        systemParameters,
        ...related,
      };
    },
    { timeout: 120_000 },
  );

  const afterSource = await countRows(source.id);
  const afterTarget = await countRows(target.id);

  console.log(
    toJson({
      backupPath,
      moved: result,
      after: {
        source: afterSource,
        target: afterTarget,
      },
    }),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
