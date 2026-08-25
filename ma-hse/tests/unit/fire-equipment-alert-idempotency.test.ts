import { ActionAlertChannel, FireChecklistFrequency, FireChecklistResult, FireComplianceCellState, FireEquipmentAlertType, FireEquipmentStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function uniqueError() {
  return { code: "P2002" };
}

const txMock = vi.hoisted(() => ({
  notification: {
    create: vi.fn(),
  },
  fireEquipmentAlertDelivery: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
  plant: {
    findUnique: vi.fn(),
  },
  userPlantRole: {
    findMany: vi.fn(),
  },
  fireChecklistExecution: {
    findUnique: vi.fn(),
  },
  fireEquipmentAlertDelivery: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

const emailMock = vi.hoisted(() => ({
  sendNotificationEmail: vi.fn(),
}));

type DepartmentRecipientRow = { user: { id: string; name: string; email: string; language: string } };

const safetyCommunicationMock = vi.hoisted(() => ({
  resolveDepartmentAlertRecipients: vi.fn(async (): Promise<DepartmentRecipientRow[]> => []),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/src/email/systemEmailHelpers.js", () => emailMock);
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://example.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/services/safety-communication-alert-service", () => safetyCommunicationMock);

import { FireEquipmentAlertService } from "@/lib/services/fire-equipment-alert-service";

const areaUser = { id: "user-area", name: "Area Responsible", email: "area@example.com", language: "pt" };
const n3User = { id: "user-n3", name: "N3 User", email: "n3@example.com", language: "pt" };

function buildDailyContext(overrides: {
  equipment?: Array<{ id: string; internalCode: string; areaId: string | null; areaName: string | null; fireEquipmentTypeName: string; status: FireEquipmentStatus; hasTag: boolean }>;
  n3Recipients?: Array<{ id: string; name: string; email: string; language: string }>;
  recipientsByAreaId?: Record<string, Array<{ id: string; name: string; email: string; language: string }>>;
  deliveredKeys?: string[];
} = {}) {
  const equipment = overrides.equipment ?? [];
  return {
    plant: { id: "plant-1", code: "maap", name: "MAAP" },
    equipmentById: new Map(equipment.map((row) => [row.id, row])),
    n3Recipients: overrides.n3Recipients ?? [],
    recipientsByAreaId: new Map(Object.entries(overrides.recipientsByAreaId ?? {})),
    deliveredKeys: new Set(overrides.deliveredKeys ?? []),
  };
}

describe("FireEquipmentAlertService — idempotency via cycleKey (§8)", () => {
  beforeEach(() => {
    txMock.notification.create.mockResolvedValue({ id: "notification-1" });
    txMock.fireEquipmentAlertDelivery.create.mockResolvedValue({});
    prismaMock.fireEquipmentAlertDelivery.create.mockResolvedValue({});
    emailMock.sendNotificationEmail.mockResolvedValue({});
    prismaMock.plant.findUnique.mockResolvedValue({ id: "plant-1", code: "maap", name: "MAAP" });
    prismaMock.userPlantRole.findMany.mockResolvedValue([{ user: n3User }]);
    safetyCommunicationMock.resolveDepartmentAlertRecipients.mockResolvedValue([{ user: areaUser }]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cycleKey = fireEquipmentId:frequency:dueDate: DUE_SOON dispatched twice for the same due date sends once, a new due date alerts again", async () => {
    const context = buildDailyContext({
      equipment: [{ id: "eq-1", internalCode: "EXT-MAAP-0001", areaId: "area-1", areaName: "Warehouse", fireEquipmentTypeName: "Extinguisher", status: FireEquipmentStatus.ACTIVE, hasTag: true }],
      n3Recipients: [n3User],
      recipientsByAreaId: { "area-1": [areaUser] },
    });
    const equipment = context.equipmentById.get("eq-1")!;
    const dueDate = new Date("2026-09-10T00:00:00.000Z");

    await expect(
      FireEquipmentAlertService.dispatchDueDateAlert({
        context, equipment, frequency: FireChecklistFrequency.QUARTERLY,
        computed: { state: FireComplianceCellState.DUE_SOON, dueDate, lastExecutionId: "exec-1" },
      }),
    ).resolves.toBe(4); // 2 recipients (area + N3) x (SOFTWARE + EMAIL)

    expect(txMock.fireEquipmentAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fireEquipmentId: "eq-1",
          alertType: FireEquipmentAlertType.DUE_SOON,
          channel: ActionAlertChannel.SOFTWARE,
          cycleKey: `eq-1:${FireChecklistFrequency.QUARTERLY}:${dueDate.toISOString()}`,
          notificationId: "notification-1",
        }),
      }),
    );

    // Simulate the real unique-index rejection a second dispatch attempt would hit in production.
    txMock.fireEquipmentAlertDelivery.create.mockRejectedValue(uniqueError());
    prismaMock.fireEquipmentAlertDelivery.create.mockRejectedValue(uniqueError());

    await expect(
      FireEquipmentAlertService.dispatchDueDateAlert({
        context, equipment, frequency: FireChecklistFrequency.QUARTERLY,
        computed: { state: FireComplianceCellState.DUE_SOON, dueDate, lastExecutionId: "exec-1" },
      }),
    ).resolves.toBe(0);

    // A fresh execution moves the due date forward — a new cycleKey, free to alert again.
    txMock.fireEquipmentAlertDelivery.create.mockResolvedValue({});
    prismaMock.fireEquipmentAlertDelivery.create.mockResolvedValue({});
    const newDueDate = new Date("2026-12-10T00:00:00.000Z");
    await expect(
      FireEquipmentAlertService.dispatchDueDateAlert({
        context, equipment, frequency: FireChecklistFrequency.QUARTERLY,
        computed: { state: FireComplianceCellState.DUE_SOON, dueDate: newDueDate, lastExecutionId: "exec-2" },
      }),
    ).resolves.toBe(4);
  });

  it("dispatches OVERDUE (not DUE_SOON) once the due date has passed, to the same recipients (area + N3)", async () => {
    const context = buildDailyContext({
      equipment: [{ id: "eq-1", internalCode: "EXT-MAAP-0001", areaId: "area-1", areaName: "Warehouse", fireEquipmentTypeName: "Extinguisher", status: FireEquipmentStatus.ACTIVE, hasTag: true }],
      n3Recipients: [n3User],
      recipientsByAreaId: { "area-1": [areaUser] },
    });
    const equipment = context.equipmentById.get("eq-1")!;

    const sent = await FireEquipmentAlertService.dispatchDueDateAlert({
      context, equipment, frequency: FireChecklistFrequency.ANNUAL,
      computed: { state: FireComplianceCellState.OVERDUE, dueDate: new Date("2026-06-01T00:00:00.000Z"), lastExecutionId: "exec-1" },
    });

    expect(sent).toBe(4); // 2 recipients x (SOFTWARE + EMAIL)
    const alertTypes = txMock.fireEquipmentAlertDelivery.create.mock.calls.map((call) => call[0].data.alertType);
    expect(new Set(alertTypes)).toEqual(new Set([FireEquipmentAlertType.OVERDUE]));
    const recipientIds = txMock.fireEquipmentAlertDelivery.create.mock.calls.map((call) => call[0].data.userId);
    expect(new Set(recipientIds)).toEqual(new Set(["user-area", "user-n3"]));
  });

  it("VALID / NEVER_DONE / NOT_APPLICABLE never dispatch a due-date alert, and never even resolve recipients", async () => {
    const context = buildDailyContext({
      equipment: [{ id: "eq-1", internalCode: "EXT-MAAP-0001", areaId: "area-1", areaName: "Warehouse", fireEquipmentTypeName: "Extinguisher", status: FireEquipmentStatus.ACTIVE, hasTag: true }],
    });
    const equipment = context.equipmentById.get("eq-1")!;

    for (const state of [FireComplianceCellState.VALID, FireComplianceCellState.NEVER_DONE, FireComplianceCellState.NOT_APPLICABLE]) {
      const sent = await FireEquipmentAlertService.dispatchDueDateAlert({
        context, equipment, frequency: FireChecklistFrequency.QUARTERLY,
        computed: { state, dueDate: state === FireComplianceCellState.VALID ? new Date("2027-01-01T00:00:00.000Z") : null, lastExecutionId: null },
      });
      expect(sent).toBe(0);
    }
    expect(txMock.fireEquipmentAlertDelivery.create).not.toHaveBeenCalled();
  });

  it("cycleKey = 'YYYY-MM' for TAG_MISSING: only ACTIVE equipment with no active tag alerts, repeated dispatch in the same month sends once", async () => {
    const context = buildDailyContext({
      equipment: [
        { id: "eq-1", internalCode: "EXT-MAAP-0001", areaId: "area-1", areaName: "Warehouse", fireEquipmentTypeName: "Extinguisher", status: FireEquipmentStatus.ACTIVE, hasTag: false },
        { id: "eq-2", internalCode: "EXT-MAAP-0002", areaId: "area-1", areaName: "Warehouse", fireEquipmentTypeName: "Extinguisher", status: FireEquipmentStatus.ACTIVE, hasTag: true },
        { id: "eq-3", internalCode: "EXT-MAAP-0003", areaId: null, areaName: null, fireEquipmentTypeName: "Extinguisher", status: FireEquipmentStatus.OUT_OF_SERVICE, hasTag: false },
      ],
      n3Recipients: [n3User],
      recipientsByAreaId: { "area-1": [areaUser] },
    });

    const sent = await FireEquipmentAlertService.dispatchTagMissingAlerts(context, new Date("2026-08-05T00:00:00.000Z"));
    expect(sent).toBe(4); // only eq-1: 2 recipients x (SOFTWARE + EMAIL)
    expect(txMock.fireEquipmentAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fireEquipmentId: "eq-1", alertType: FireEquipmentAlertType.TAG_MISSING, cycleKey: "2026-08" }) }),
    );

    txMock.fireEquipmentAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === "2026-08") throw uniqueError();
      return {};
    });
    prismaMock.fireEquipmentAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === "2026-08") throw uniqueError();
      return {};
    });

    await expect(FireEquipmentAlertService.dispatchTagMissingAlerts(context, new Date("2026-08-20T00:00:00.000Z"))).resolves.toBe(0);
    await expect(FireEquipmentAlertService.dispatchTagMissingAlerts(context, new Date("2026-09-02T00:00:00.000Z"))).resolves.toBe(4);
  });

  it("(item 16) skips a combination already present in the pre-loaded deliveredKeys, without attempting the write", async () => {
    const dueDate = new Date("2026-09-10T00:00:00.000Z");
    const context = buildDailyContext({
      equipment: [{ id: "eq-1", internalCode: "EXT-MAAP-0001", areaId: null, areaName: null, fireEquipmentTypeName: "Extinguisher", status: FireEquipmentStatus.ACTIVE, hasTag: true }],
      n3Recipients: [n3User],
      deliveredKeys: [
        ["eq-1", n3User.id, FireEquipmentAlertType.DUE_SOON, ActionAlertChannel.SOFTWARE, `eq-1:${FireChecklistFrequency.QUARTERLY}:${dueDate.toISOString()}`].join("|"),
      ],
    });
    const equipment = context.equipmentById.get("eq-1")!;

    const sent = await FireEquipmentAlertService.dispatchDueDateAlert({
      context, equipment, frequency: FireChecklistFrequency.QUARTERLY,
      computed: { state: FireComplianceCellState.DUE_SOON, dueDate, lastExecutionId: "exec-1" },
    });

    expect(sent).toBe(1); // EMAIL still sent; SOFTWARE was skipped as already delivered
    expect(txMock.fireEquipmentAlertDelivery.create).not.toHaveBeenCalled();
    expect(prismaMock.fireEquipmentAlertDelivery.create).toHaveBeenCalledTimes(1);
  });

  it("NON_CONFORMITY_FOUND: urgent channel, dispatched to Area responsible + N3_SAFETY when a critical item failed (overallResult FAILED)", async () => {
    prismaMock.fireChecklistExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      plantId: "plant-1",
      fireEquipmentId: "eq-1",
      overallResult: FireChecklistResult.FAILED,
      fireEquipment: {
        internalCode: "EXT-MAAP-0001",
        areaId: "area-1",
        area: { name: "Warehouse" },
        fireEquipmentType: { name: "Extinguisher" },
      },
    });

    const sent = await FireEquipmentAlertService.dispatchNonConformityFound("exec-1");

    expect(sent).toBe(4); // (area + N3) x (SOFTWARE + EMAIL)
    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ channel: "FIRE_EQUIPMENT_URGENT" }) }),
    );
    expect(txMock.fireEquipmentAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fireEquipmentId: "eq-1",
          executionId: "exec-1",
          alertType: FireEquipmentAlertType.NON_CONFORMITY_FOUND,
          cycleKey: "exec-1",
        }),
      }),
    );
  });

  it("NON_CONFORMITY_FOUND: does nothing for PASSED / PASSED_WITH_OBSERVATIONS — never even resolves recipients", async () => {
    prismaMock.fireChecklistExecution.findUnique.mockResolvedValue({
      id: "exec-2",
      plantId: "plant-1",
      fireEquipmentId: "eq-1",
      overallResult: FireChecklistResult.PASSED_WITH_OBSERVATIONS,
      fireEquipment: { internalCode: "EXT-MAAP-0001", areaId: "area-1", area: { name: "Warehouse" }, fireEquipmentType: { name: "Extinguisher" } },
    });

    await expect(FireEquipmentAlertService.dispatchNonConformityFound("exec-2")).resolves.toBe(0);
    expect(safetyCommunicationMock.resolveDepartmentAlertRecipients).not.toHaveBeenCalled();
    expect(txMock.notification.create).not.toHaveBeenCalled();
  });

  it("(minor) listUnreadUrgentAlerts filters by the notification's own channel, not just the delivery row's", async () => {
    prismaMock.fireEquipmentAlertDelivery.findMany.mockResolvedValue([]);

    await FireEquipmentAlertService.listUnreadUrgentAlerts({ plantId: "plant-1", plantCode: "maap", userId: "user-1" });

    expect(prismaMock.fireEquipmentAlertDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          notification: { channel: "FIRE_EQUIPMENT_URGENT", status: "UNREAD" },
        }),
      }),
    );
  });
});
