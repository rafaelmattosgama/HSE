import { ActionCategory, ActionManualOrigin, ActionPriority, ActionSourceType, ActionStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const transactionMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  action: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  smatAuditActionLink: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn((callback) => callback(transactionMock)),
    communication: {
      update: vi.fn(),
    },
    action: {
      findMany: vi.fn(),
    },
    sEWOActionLink: {
      findMany: vi.fn(),
    },
  },
}));

const auditMock = vi.hoisted(() => ({
  buildDiff: vi.fn(),
  writeAuditLog: vi.fn(),
}));

const parameterMock = vi.hoisted(() => ({
  getSlaConfig: vi.fn(),
}));

const communicationServiceMock = vi.hoisted(() => ({
  CommunicationService: {
    syncStatusWithActions: vi.fn(),
  },
}));

const sewoServiceMock = vi.hoisted(() => ({
  SewaService: {
    syncStatusWithActions: vi.fn(),
  },
}));

const actionAlertServiceMock = vi.hoisted(() => ({
  ActionAlertService: {
    sendNewActionAlerts: vi.fn(),
    sendOverdueActionAlerts: vi.fn(),
    sendThreeDaysBeforeDueDateAlerts: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/audit", () => auditMock);
vi.mock("@/lib/services/parameter-service", () => parameterMock);
vi.mock("@/lib/services/communication-service", () => communicationServiceMock);
vi.mock("@/lib/services/sewo-service", () => sewoServiceMock);
vi.mock("@/lib/services/action-alert-service", () => actionAlertServiceMock);

import { ActionService } from "@/lib/services/action-service";

describe("ActionService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an existing open communication action instead of creating a duplicate", async () => {
    parameterMock.getSlaConfig.mockResolvedValue({
      LOW: 3,
      MEDIUM: 7,
      HIGH: 14,
    });
    transactionMock.action.findFirst.mockResolvedValueOnce({
      id: "action-existing",
      plantId: "plant-1",
      sourceType: ActionSourceType.COMMUNICATION,
      communicationId: "communication-1",
      sewoId: null,
      category: ActionCategory.CORRECTIVE,
      priority: ActionPriority.LOW,
      title: "Parafusos HMI",
      description: "Realizar corte de parafusos HMI",
      ownerUserId: "owner-1",
      dueDate: new Date("2026-07-06T00:00:00.000Z"),
      status: ActionStatus.OPEN,
      coOwners: [],
    });
    prismaMock.prisma.sEWOActionLink.findMany.mockResolvedValue([]);

    const result = await ActionService.create({
      plantId: "plant-1",
      actorUserId: "user-1",
      payload: {
        sourceType: ActionSourceType.COMMUNICATION,
        communicationId: "communication-1",
        category: ActionCategory.CORRECTIVE,
        priority: ActionPriority.LOW,
        title: "Parafusos HMI",
        description: "Realizar corte de parafusos HMI",
        ownerUserId: "owner-1",
      },
    });

    expect(result).toMatchObject({
      id: "action-existing",
      idempotency: {
        reusedExistingAction: true,
      },
    });
    expect(transactionMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(transactionMock.action.create).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).not.toHaveBeenCalled();
    expect(actionAlertServiceMock.ActionAlertService.sendNewActionAlerts).not.toHaveBeenCalled();
    expect(prismaMock.prisma.communication.update).not.toHaveBeenCalled();
    expect(communicationServiceMock.CommunicationService.syncStatusWithActions).toHaveBeenCalledWith("communication-1");
  });

  it("stores manual origin for manual actions", async () => {
    parameterMock.getSlaConfig.mockResolvedValue({
      LOW: 3,
      MEDIUM: 7,
      HIGH: 14,
    });
    transactionMock.action.findFirst.mockResolvedValueOnce(null);
    transactionMock.action.create.mockResolvedValue({
      id: "action-manual",
      plantId: "plant-1",
      sourceType: ActionSourceType.MANUAL,
      manualOrigin: ActionManualOrigin.AUDITS,
      communicationId: null,
      sewoId: null,
      category: ActionCategory.CORRECTIVE,
      priority: ActionPriority.MEDIUM,
      title: "Auditoria",
      description: "Acao criada manualmente.",
      ownerUserId: "owner-1",
      dueDate: new Date("2026-07-04T00:00:00.000Z"),
      status: ActionStatus.OPEN,
      coOwners: [],
    });
    prismaMock.prisma.sEWOActionLink.findMany.mockResolvedValue([]);

    await ActionService.create({
      plantId: "plant-1",
      actorUserId: "user-1",
      payload: {
        sourceType: ActionSourceType.MANUAL,
        manualOrigin: ActionManualOrigin.AUDITS,
        category: ActionCategory.CORRECTIVE,
        priority: ActionPriority.MEDIUM,
        title: "Auditoria",
        description: "Acao criada manualmente.",
        ownerUserId: "owner-1",
      },
    });

    expect(transactionMock.action.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sourceType: ActionSourceType.MANUAL,
        manualOrigin: ActionManualOrigin.AUDITS,
        communicationId: null,
        sewoId: null,
      }),
    }));
  });

  it("creates the SMAT action link when source type is SMAT", async () => {
    parameterMock.getSlaConfig.mockResolvedValue({
      LOW: 3,
      MEDIUM: 7,
      HIGH: 14,
    });
    transactionMock.action.findFirst.mockResolvedValueOnce(null);
    transactionMock.action.create.mockResolvedValue({
      id: "action-smat",
      plantId: "plant-1",
      sourceType: ActionSourceType.SMAT,
      manualOrigin: null,
      communicationId: null,
      sewoId: null,
      category: ActionCategory.CORRECTIVE,
      priority: ActionPriority.MEDIUM,
      title: "SMAT",
      description: "Acao criada a partir de SMAT.",
      ownerUserId: "owner-1",
      dueDate: new Date("2026-07-04T00:00:00.000Z"),
      status: ActionStatus.OPEN,
      coOwners: [],
    });
    prismaMock.prisma.sEWOActionLink.findMany.mockResolvedValue([]);

    await ActionService.create({
      plantId: "plant-1",
      actorUserId: "user-1",
      payload: {
        sourceType: ActionSourceType.SMAT,
        smatAuditId: "smat-1",
        category: ActionCategory.CORRECTIVE,
        priority: ActionPriority.MEDIUM,
        title: "SMAT",
        description: "Acao criada a partir de SMAT.",
        ownerUserId: "owner-1",
      },
    });

    expect(transactionMock.smatAuditActionLink.create).toHaveBeenCalledWith({
      data: {
        smatAuditId: "smat-1",
        actionId: "action-smat",
      },
    });
  });
});
