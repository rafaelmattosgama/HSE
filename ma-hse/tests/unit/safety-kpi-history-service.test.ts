import { SafetyKpiHistorySource, SafetyKpiImportBatchStatus, SafetyKpiImportRowStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseWorkbook: vi.fn(),
  plantFindMany: vi.fn(),
  historyFindMany: vi.fn(),
  historyFindUnique: vi.fn(),
  historyCreate: vi.fn(),
  historyUpdate: vi.fn(),
  batchCreate: vi.fn(),
  batchFindUnique: vi.fn(),
  txBatchFindUnique: vi.fn(),
  batchUpdate: vi.fn(),
  rowUpdate: vi.fn(),
  executeRaw: vi.fn(),
  transaction: vi.fn(),
  writeAuditLog: vi.fn(),
}));

vi.mock("@/lib/safety-kpi-history/excel", () => ({ parseSafetyKpiWorkbook: mocks.parseWorkbook }));
vi.mock("@/lib/audit", () => ({ buildDiff: vi.fn(() => ({ changed: true })), writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    plant: { findMany: mocks.plantFindMany },
    safetyKpiHistory: { findMany: mocks.historyFindMany },
    safetyKpiImportBatch: { create: mocks.batchCreate, findUnique: mocks.batchFindUnique },
    $transaction: mocks.transaction,
  },
}));

import { SafetyKpiHistoryService } from "@/lib/safety-kpi-history/service";

const normalized = {
  plantCode: "maap", year: 2026, month: 1, hoursWorked: "18000", employees: 121,
  accidents: 0, lostDays: "0", seriousInjury: 0, minorInjury: 0, firstAids: 1,
  nearMiss: 2, unsafeCondition: 10, unsafeAct: 20, sourceFrequencyRate: null,
  sourceGravityRate: null, source: SafetyKpiHistorySource.HISTORICAL_IMPORT, notes: null,
};
const roles = [{ role: "N3_SAFETY" as const, plantCode: "MAAP" }];

describe("SafetyKpiHistoryService import workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plantFindMany.mockResolvedValue([{ id: "plant-1", code: "MAAP" }]);
    mocks.historyFindMany.mockResolvedValue([]);
    mocks.batchCreate.mockResolvedValue({ id: "batch-1" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $executeRaw: mocks.executeRaw,
      safetyKpiHistory: { findUnique: mocks.historyFindUnique, create: mocks.historyCreate, update: mocks.historyUpdate },
      safetyKpiImportRow: { update: mocks.rowUpdate },
      safetyKpiImportBatch: { findUnique: mocks.txBatchFindUnique, update: mocks.batchUpdate },
    }));
  });

  it("creates only an auditable preview batch and does not write canonical KPI records", async () => {
    mocks.parseWorkbook.mockResolvedValue([{ rowNumber: 2, recordKey: "MAAP|2026-01", raw: { Plant: "MAAP" }, normalized, calculated: { frequencyRate: "0", gravityRate: "0" }, errors: [], warnings: [], duplicateFile: false }]);

    const result = await SafetyKpiHistoryService.preview({ bytes: new Uint8Array([1, 2, 3]), fileName: "history.xlsx", userId: "user-1", roles });

    expect(result.summary).toMatchObject({ total: 1, validNew: 1, invalid: 0 });
    expect(mocks.batchCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalRows: 1, validRows: 1 }) }));
    expect(mocks.historyCreate).not.toHaveBeenCalled();
    expect(mocks.historyUpdate).not.toHaveBeenCalled();
  });

  it("marks an existing database key without treating it as a new import", async () => {
    mocks.parseWorkbook.mockResolvedValue([{ rowNumber: 2, recordKey: "MAAP|2026-01", raw: { Plant: "MAAP" }, normalized, calculated: { frequencyRate: "0", gravityRate: "0" }, errors: [], warnings: [], duplicateFile: false }]);
    mocks.historyFindMany.mockResolvedValue([{ plantId: "plant-1", year: 2026, month: 1 }]);

    const result = await SafetyKpiHistoryService.preview({ bytes: new Uint8Array([1]), fileName: "history.xlsx", userId: "user-1", roles });

    expect(result.summary).toMatchObject({ validNew: 0, existingDb: 1, invalid: 0 });
    expect(result.rows[0].status).toBe(SafetyKpiImportRowStatus.EXISTS_DB);
    expect(mocks.batchCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalRows: 1, validRows: 1, errorRows: 0 }) }));
  });

  it("commits once and makes a repeated commit idempotent", async () => {
    const previewBatch = {
      id: "batch-1", createdById: "user-1", plantId: "plant-1", status: SafetyKpiImportBatchStatus.PREVIEWED,
      importedRows: 0, skippedRows: 0, errorRows: 0,
      rows: [{ id: "row-1", rowNumber: 2, status: SafetyKpiImportRowStatus.NEW, normalizedData: normalized, messages: { errors: [], warnings: [], calculated: { frequencyRate: "0", gravityRate: "0" } } }],
    };
    mocks.batchFindUnique
      .mockResolvedValueOnce(previewBatch)
      .mockResolvedValueOnce({ ...previewBatch, status: SafetyKpiImportBatchStatus.IMPORTED, importedRows: 1 });
    mocks.txBatchFindUnique.mockResolvedValue({ status: SafetyKpiImportBatchStatus.PREVIEWED, importedRows: 0, skippedRows: 0, errorRows: 0 });
    mocks.historyFindUnique.mockResolvedValue(null);
    mocks.historyCreate.mockResolvedValue({ id: "history-1" });

    const first = await SafetyKpiHistoryService.commit({ batchId: "batch-1", strategy: "SKIP", userId: "user-1", roles });
    const repeated = await SafetyKpiHistoryService.commit({ batchId: "batch-1", strategy: "SKIP", userId: "user-1", roles });

    expect(first).toMatchObject({ status: SafetyKpiImportBatchStatus.IMPORTED, imported: 1, idempotent: false });
    expect(repeated).toMatchObject({ status: SafetyKpiImportBatchStatus.IMPORTED, imported: 1, idempotent: true });
    expect(mocks.historyCreate).toHaveBeenCalledTimes(1);
    expect(mocks.batchUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ importedRows: 1, skippedRows: 0 }) }));
    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1);
  });

  it("rechecks the batch under a transaction lock to close concurrent commit races", async () => {
    const previewBatch = {
      id: "batch-1", createdById: "user-1", plantId: "plant-1", status: SafetyKpiImportBatchStatus.PREVIEWED,
      importedRows: 0, skippedRows: 0, errorRows: 0,
      rows: [{ id: "row-1", rowNumber: 2, status: SafetyKpiImportRowStatus.NEW, normalizedData: normalized, messages: null }],
    };
    mocks.batchFindUnique.mockResolvedValue(previewBatch);
    mocks.txBatchFindUnique.mockResolvedValue({ status: SafetyKpiImportBatchStatus.IMPORTED, importedRows: 1, skippedRows: 0, errorRows: 0 });

    const result = await SafetyKpiHistoryService.commit({ batchId: "batch-1", strategy: "SKIP", userId: "user-1", roles });

    expect(result).toMatchObject({ status: SafetyKpiImportBatchStatus.IMPORTED, imported: 1, idempotent: true });
    expect(mocks.historyCreate).not.toHaveBeenCalled();
    expect(mocks.batchUpdate).not.toHaveBeenCalled();
  });
});
