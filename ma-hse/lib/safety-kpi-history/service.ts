import { createHash } from "node:crypto";
import { Prisma, SafetyKpiImportBatchStatus, SafetyKpiImportRowAction, SafetyKpiImportRowStatus } from "@prisma/client";
import { buildDiff, writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canImportSafetyKpiHistory, canReplaceSafetyKpiHistory } from "@/lib/rbac/safety-kpi-history";
import { parseSafetyKpiWorkbook } from "@/lib/safety-kpi-history/excel";
import { aggregateSafetyKpiMonths, compareSafetyKpiYears, mergeSafetyKpiSources, type SafetyKpiMonth } from "@/lib/safety-kpi-history/aggregation";
import type { NormalizedSafetyKpiRow } from "@/lib/safety-kpi-history/validation";

type RoleEntry = { role: import("@prisma/client").RoleCode; plantCode: string | null };
type MessageJson = { errors: string[]; warnings: string[]; calculated: { frequencyRate: string; gravityRate: string } };
const json = (value: unknown) => value as Prisma.InputJsonValue;

function rowData(row: NormalizedSafetyKpiRow, plantId: string, batchId: string, userId: string) {
  return {
    plantId, year: row.year, month: row.month, hoursWorked: new Prisma.Decimal(row.hoursWorked), employees: row.employees,
    accidents: row.accidents, lostDays: new Prisma.Decimal(row.lostDays), seriousInjury: row.seriousInjury,
    minorInjury: row.minorInjury, firstAids: row.firstAids, nearMiss: row.nearMiss,
    unsafeCondition: row.unsafeCondition, unsafeAct: row.unsafeAct,
    sourceFrequencyRate: row.sourceFrequencyRate === null ? null : new Prisma.Decimal(row.sourceFrequencyRate),
    sourceGravityRate: row.sourceGravityRate === null ? null : new Prisma.Decimal(row.sourceGravityRate),
    source: row.source, importBatchId: batchId, createdById: userId,
  };
}

export const SafetyKpiHistoryService = {
  async preview(input: { bytes: Uint8Array; fileName: string; userId: string; roles: RoleEntry[] }) {
    const parsed = await parseSafetyKpiWorkbook(input.bytes);
    const codes = [...new Set(parsed.map(row => row.normalized.plantCode).filter(Boolean))];
    const plants = await prisma.plant.findMany({ where: { code: { in: codes, mode: "insensitive" } }, select: { id: true, code: true } });
    const plantByCode = new Map(plants.map(plant => [plant.code.toLowerCase(), plant]));
    const keys = parsed.flatMap(row => {
      const plant = plantByCode.get(row.normalized.plantCode);
      return plant ? [{ plantId: plant.id, year: row.normalized.year, month: row.normalized.month }] : [];
    });
    const existing = keys.length ? await prisma.safetyKpiHistory.findMany({ where: { OR: keys }, select: { plantId: true, year: true, month: true } }) : [];
    const existingKeys = new Set(existing.map(row => `${row.plantId}|${row.year}-${row.month}`));
    const rows = parsed.map(row => {
      const plant = plantByCode.get(row.normalized.plantCode);
      const errors = [...row.errors];
      if (row.normalized.plantCode && !plant) errors.push(`Plant "${row.normalized.plantCode}" does not exist`);
      if (plant && !canImportSafetyKpiHistory(input.roles, plant.code)) errors.push(`No import permission for plant "${plant.code}"`);
      const existsDb = Boolean(plant && existingKeys.has(`${plant.id}|${row.normalized.year}-${row.normalized.month}`));
      const status = errors.length ? SafetyKpiImportRowStatus.INVALID
        : row.duplicateFile ? SafetyKpiImportRowStatus.DUPLICATE_FILE
          : existsDb ? SafetyKpiImportRowStatus.EXISTS_DB : SafetyKpiImportRowStatus.NEW;
      return { ...row, errors, status, plantId: plant?.id ?? null };
    });
    const hash = createHash("sha256").update(input.bytes).digest("hex");
    const newRows = rows.filter(row => row.status === SafetyKpiImportRowStatus.NEW).length;
    const validRows = rows.filter(row => row.status === SafetyKpiImportRowStatus.NEW || row.status === SafetyKpiImportRowStatus.EXISTS_DB).length;
    const uniquePlantIds = [...new Set(rows.flatMap(row => row.plantId ? [row.plantId] : []))];
    const batch = await prisma.safetyKpiImportBatch.create({
      data: {
        originalFileName: input.fileName, fileHash: hash, createdById: input.userId,
        plantId: uniquePlantIds.length === 1 ? uniquePlantIds[0] : null,
        totalRows: rows.length, validRows, errorRows: rows.filter(row => row.status === SafetyKpiImportRowStatus.INVALID).length,
        metadata: json({ sheet: "KPI_Import", warnings: rows.reduce((sum, row) => sum + row.warnings.length, 0) }),
        rows: { create: rows.map(row => ({
          rowNumber: row.rowNumber, recordKey: row.recordKey, status: row.status,
          rawData: json(row.raw), normalizedData: json(row.normalized),
          messages: json({ errors: row.errors, warnings: row.warnings, calculated: row.calculated }),
        })) },
      },
    });
    return {
      batchId: batch.id, fileName: input.fileName, fileHash: hash,
      summary: {
        total: rows.length, validNew: newRows,
        duplicateFile: rows.filter(row => row.status === SafetyKpiImportRowStatus.DUPLICATE_FILE).length,
        existingDb: rows.filter(row => row.status === SafetyKpiImportRowStatus.EXISTS_DB).length,
        invalid: rows.filter(row => row.status === SafetyKpiImportRowStatus.INVALID).length,
        warnings: rows.reduce((sum, row) => sum + row.warnings.length, 0),
      },
      rows: rows.map(row => ({ rowNumber: row.rowNumber, recordKey: row.recordKey, status: row.status, normalized: row.normalized, calculated: row.calculated, errors: row.errors, warnings: row.warnings })),
    };
  },

  async commit(input: { batchId: string; strategy: "SKIP" | "REPLACE"; userId: string; roles: RoleEntry[] }) {
    const batch = await prisma.safetyKpiImportBatch.findUnique({ where: { id: input.batchId }, include: { rows: { orderBy: { rowNumber: "asc" } } } });
    if (!batch) throw new Error("Import batch not found");
    const globalAdmin = input.roles.some(role => role.role === "N0_ADMIN" || role.role === "N1_CORPORATE");
    if (batch.createdById !== input.userId && !globalAdmin) throw new Error("Import batch is not available to this user");
    if (batch.status !== SafetyKpiImportBatchStatus.PREVIEWED) return { batchId: batch.id, status: batch.status, imported: batch.importedRows, skipped: batch.skippedRows, errors: batch.errorRows, idempotent: true };
    const normalizedRows = batch.rows.map(row => ({ ...row, normalized: row.normalizedData as NormalizedSafetyKpiRow | null, messages: row.messages as MessageJson | null }));
    const plants = await prisma.plant.findMany({ where: { code: { in: normalizedRows.flatMap(row => row.normalized?.plantCode ? [row.normalized.plantCode] : []), mode: "insensitive" } }, select: { id: true, code: true } });
    const plantByCode = new Map(plants.map(plant => [plant.code.toLowerCase(), plant]));
    return prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`safety-kpi-batch:${batch.id}`}))`;
      const currentBatch = await tx.safetyKpiImportBatch.findUnique({
        where: { id: batch.id },
        select: { status: true, importedRows: true, skippedRows: true, errorRows: true },
      });
      if (!currentBatch) throw new Error("Import batch not found");
      if (currentBatch.status !== SafetyKpiImportBatchStatus.PREVIEWED) {
        return { batchId: batch.id, status: currentBatch.status, imported: currentBatch.importedRows, skipped: currentBatch.skippedRows, errors: currentBatch.errorRows, idempotent: true };
      }
      let imported = 0, skipped = 0;
      let errors = normalizedRows.filter(row => row.status === SafetyKpiImportRowStatus.INVALID).length;
      for (const row of normalizedRows) {
        if (!row.normalized || row.status === SafetyKpiImportRowStatus.INVALID || row.status === SafetyKpiImportRowStatus.DUPLICATE_FILE) {
          skipped += 1;
          await tx.safetyKpiImportRow.update({ where: { id: row.id }, data: { status: SafetyKpiImportRowStatus.SKIPPED, action: SafetyKpiImportRowAction.SKIP } });
          continue;
        }
        const plant = plantByCode.get(row.normalized.plantCode);
        if (!plant || !canImportSafetyKpiHistory(input.roles, plant.code)) {
          errors += 1;
          await tx.safetyKpiImportRow.update({ where: { id: row.id }, data: { status: SafetyKpiImportRowStatus.ERROR, action: SafetyKpiImportRowAction.ERROR, messages: json({ ...row.messages, errors: [...(row.messages?.errors ?? []), "Plant missing or permission revoked before commit"] }) } });
          continue;
        }
        if (input.strategy === "REPLACE" && !canReplaceSafetyKpiHistory(input.roles, plant.code)) throw new Error(`REPLACE is not allowed for plant ${plant.code}`);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`safety-kpi:${plant.id}:${row.normalized.year}:${row.normalized.month}`}))`;
        const existing = await tx.safetyKpiHistory.findUnique({ where: { plantId_year_month: { plantId: plant.id, year: row.normalized.year, month: row.normalized.month } } });
        if (existing && input.strategy === "SKIP") {
          skipped += 1;
          await tx.safetyKpiImportRow.update({ where: { id: row.id }, data: { status: SafetyKpiImportRowStatus.SKIPPED, action: SafetyKpiImportRowAction.SKIP } });
          continue;
        }
        const data = rowData(row.normalized, plant.id, batch.id, input.userId);
        if (existing) await tx.safetyKpiHistory.update({ where: { id: existing.id }, data });
        else await tx.safetyKpiHistory.create({ data });
        imported += 1;
        await tx.safetyKpiImportRow.update({ where: { id: row.id }, data: { status: SafetyKpiImportRowStatus.IMPORTED, action: existing ? SafetyKpiImportRowAction.REPLACE : SafetyKpiImportRowAction.CREATE } });
      }
      const status = errors || skipped ? SafetyKpiImportBatchStatus.PARTIAL : SafetyKpiImportBatchStatus.IMPORTED;
      await tx.safetyKpiImportBatch.update({ where: { id: batch.id }, data: { status, importedRows: imported, skippedRows: skipped, errorRows: errors, completedAt: new Date() } });
      await writeAuditLog({ entityType: "SafetyKpiImportBatch", entityId: batch.id, action: "COMMITTED", actorUserId: input.userId, plantId: batch.plantId, diff: buildDiff(null, { strategy: input.strategy, imported, skipped, errors }) }, tx);
      return { batchId: batch.id, status, imported, skipped, errors, idempotent: false };
    });
  },

  async getPlantYear(plantId: string, plantCode: string, year: number, compareTo = year - 1) {
    const years = [year, compareTo];
    const [historical, monthlyInputs, communications] = await Promise.all([
      prisma.safetyKpiHistory.findMany({ where: { plantId, year: { in: years } } }),
      prisma.plantMonthlyInput.findMany({ where: { plantId, year: { in: years } }, select: { year: true, month: true, hoursWorked: true, workerCount: true } }),
      prisma.communication.findMany({ where: { plantId, status: { in: ["VALID_OPEN", "ONGOING", "CLOSED"] }, eventDatetime: { gte: new Date(Date.UTC(Math.min(...years), 0, 1)), lt: new Date(Date.UTC(Math.max(...years) + 1, 0, 1)) } }, select: { eventDatetime: true, type: true, classification: true, lostDays: true } }),
    ]);
    const liveMap = new Map<string, SafetyKpiMonth>();
    const liveCoverage = new Map<string, Set<import("@/lib/safety-kpi-history/aggregation").SafetyKpiField>>();
    const cover = (year: number, month: number, ...fields: import("@/lib/safety-kpi-history/aggregation").SafetyKpiField[]) => {
      const key = `${plantId}|${year}-${month}`;
      const fieldsForMonth = liveCoverage.get(key) ?? new Set<import("@/lib/safety-kpi-history/aggregation").SafetyKpiField>();
      fields.forEach(field => fieldsForMonth.add(field));
      liveCoverage.set(key, fieldsForMonth);
    };
    const ensure = (y: number, month: number) => {
      const key = `${y}-${month}`;
      let row = liveMap.get(key);
      if (!row) { row = { plantId, plantCode, year: y, month, source: "LIVE", hoursWorked: "0", employees: 0, accidents: 0, lostDays: "0", seriousInjury: 0, minorInjury: 0, firstAids: 0, nearMiss: 0, unsafeCondition: 0, unsafeAct: 0 }; liveMap.set(key, row); }
      return row;
    };
    for (const input of monthlyInputs) {
      const row = ensure(input.year, input.month);
      if (input.hoursWorked !== null && !input.hoursWorked.isZero()) { row.hoursWorked = input.hoursWorked.toString(); cover(input.year, input.month, "hoursWorked"); }
      if (input.workerCount !== null) { row.employees = input.workerCount; cover(input.year, input.month, "employees"); }
    }
    for (const event of communications) {
      const row = ensure(event.eventDatetime.getUTCFullYear(), event.eventDatetime.getUTCMonth() + 1);
      const eventYear = event.eventDatetime.getUTCFullYear();
      const eventMonth = event.eventDatetime.getUTCMonth() + 1;
      if (event.type === "ACCIDENT") {
        row.accidents += 1;
        row.lostDays = new Prisma.Decimal(row.lostDays).add(event.lostDays ?? 0).toString();
        cover(eventYear, eventMonth, "accidents", "lostDays", "seriousInjury", "minorInjury");
        if (event.classification === "SERIOUS") row.seriousInjury += 1;
        if (event.classification === "MINOR") row.minorInjury += 1;
      }
      if (event.type === "FIRST_AID") { row.firstAids += 1; cover(eventYear, eventMonth, "firstAids"); }
      if (event.type === "NEAR_MISS") { row.nearMiss += 1; cover(eventYear, eventMonth, "nearMiss"); }
      if (event.type === "UNSAFE_CONDITION") { row.unsafeCondition += 1; cover(eventYear, eventMonth, "unsafeCondition"); }
      if (event.type === "UNSAFE_ACT") { row.unsafeAct += 1; cover(eventYear, eventMonth, "unsafeAct"); }
    }
    const historyMonths: SafetyKpiMonth[] = historical.map(row => ({ plantId, plantCode, year: row.year, month: row.month, source: "HISTORICAL", hoursWorked: row.hoursWorked.toString(), employees: row.employees, accidents: row.accidents, lostDays: row.lostDays.toString(), seriousInjury: row.seriousInjury, minorInjury: row.minorInjury, firstAids: row.firstAids, nearMiss: row.nearMiss, unsafeCondition: row.unsafeCondition, unsafeAct: row.unsafeAct }));
    const months = mergeSafetyKpiSources([...liveMap.values()], historyMonths, liveCoverage);
    return {
      months: months.filter(row => row.year === year),
      comparisonMonths: months.filter(row => row.year === compareTo),
      annual: aggregateSafetyKpiMonths(months.filter(row => row.year === year)),
      comparison: compareSafetyKpiYears(months, year, compareTo),
    };
  },
};
