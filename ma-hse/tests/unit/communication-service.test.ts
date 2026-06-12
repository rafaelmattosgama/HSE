import { CommunicationImprovementSubtype, CommunicationSource, CommunicationStatus, CommunicationType, RoleCode } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  employeeDirectory: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  communication: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  action: {
    count: vi.fn(),
  },
  userPlantRole: {
    findMany: vi.fn(),
  },
  riskTheme: {
    findFirst: vi.fn(),
  },
  unsafeConditionType: {
    findFirst: vi.fn(),
  },
}));

const notificationServiceMock = vi.hoisted(() => ({
  NotificationService: {
    notify: vi.fn(),
    notifyPlantRoles: vi.fn(),
  },
}));

const sewoServiceMock = vi.hoisted(() => ({
  SewaService: {
    createProvisionalFromCommunication: vi.fn(),
  },
}));

const repeatabilityAlertMock = vi.hoisted(() => ({
  RepeatabilityAlertService: {
    processCommunication: vi.fn(),
  },
}));

const safetyCommunicationAlertServiceMock = vi.hoisted(() => ({
  SafetyCommunicationAlertService: {
    safeDispatchN3CommunicationCreatedAlerts: vi.fn(),
    safeDispatchApprovedCommunicationAlerts: vi.fn(),
  },
}));

const auditMock = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
  buildDiff: vi.fn(() => ({})),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/notification-service", () => notificationServiceMock);
vi.mock("@/lib/services/sewo-service", () => sewoServiceMock);
vi.mock("@/lib/services/repeatability-alert-service", () => repeatabilityAlertMock);
vi.mock("@/lib/services/safety-communication-alert-service", () => safetyCommunicationAlertServiceMock);
vi.mock("@/lib/audit", () => auditMock);
vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
  },
}));

import { CommunicationService } from "@/lib/services/communication-service";

describe("CommunicationService approved communication alerts", () => {
  beforeEach(() => {
    prismaMock.communication.findUnique.mockResolvedValue(null);
    prismaMock.userPlantRole.findMany.mockResolvedValue([]);
    notificationServiceMock.NotificationService.notifyPlantRoles.mockResolvedValue(undefined);
    repeatabilityAlertMock.RepeatabilityAlertService.processCommunication.mockResolvedValue(undefined);
    safetyCommunicationAlertServiceMock.SafetyCommunicationAlertService.safeDispatchN3CommunicationCreatedAlerts.mockResolvedValue(undefined);
    safetyCommunicationAlertServiceMock.SafetyCommunicationAlertService.safeDispatchApprovedCommunicationAlerts.mockResolvedValue(undefined);
    sewoServiceMock.SewaService.createProvisionalFromCommunication.mockResolvedValue(undefined);
    auditMock.writeAuditLog.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches supervisor alerts after N3 validation only when the communication becomes approved and has SEWO support", async () => {
    prismaMock.communication.findUniqueOrThrow.mockResolvedValue({
      id: "comm-1",
      plantId: "plant-1",
      type: CommunicationType.ACCIDENT,
      reporterName: "Reporter",
      reporterEmployeeNo: "1001",
      riskThemeId: "risk-theme-1",
      status: CommunicationStatus.PENDING_VALIDATION,
    });
    prismaMock.employeeDirectory.findFirst.mockResolvedValue({
      employeeNo: "1001",
      name: "Reporter",
    });
    prismaMock.action.count.mockResolvedValue(0);
    prismaMock.communication.update.mockResolvedValue({
      id: "comm-1",
      plantId: "plant-1",
      type: CommunicationType.ACCIDENT,
      status: CommunicationStatus.VALID_OPEN,
    });

    const result = await CommunicationService.validate({
      communicationId: "comm-1",
      actorUserId: "user-1",
      actorRole: RoleCode.N3_SAFETY,
      payload: {
        isValid: true,
        status: CommunicationStatus.VALID_OPEN,
        notes: "Approved",
      },
    });

    expect((result as { status: CommunicationStatus }).status).toBe(CommunicationStatus.VALID_OPEN);
    expect(notificationServiceMock.NotificationService.notifyPlantRoles).toHaveBeenCalledWith(
      expect.objectContaining({
        plantId: "plant-1",
        roles: [RoleCode.N1_CORPORATE],
      }),
    );
    expect(sewoServiceMock.SewaService.createProvisionalFromCommunication).toHaveBeenCalledWith({
      communicationId: "comm-1",
      actorUserId: "user-1",
    });
    expect(
      safetyCommunicationAlertServiceMock.SafetyCommunicationAlertService.safeDispatchApprovedCommunicationAlerts,
    ).toHaveBeenCalledWith({
      communicationId: "comm-1",
      actorRole: RoleCode.N3_SAFETY,
    });
  });

  it("marks a validated communication as ongoing when an open action was created during validation", async () => {
    prismaMock.communication.findUniqueOrThrow.mockResolvedValue({
      id: "comm-1",
      plantId: "plant-1",
      type: CommunicationType.UNSAFE_CONDITION,
      reporterName: "Reporter",
      reporterEmployeeNo: "1001",
      unsafeConditionTypeId: "condition-1",
      status: CommunicationStatus.PENDING_VALIDATION,
    });
    prismaMock.employeeDirectory.findFirst.mockResolvedValue({
      employeeNo: "1001",
      name: "Reporter",
    });
    prismaMock.action.count.mockResolvedValue(1);
    prismaMock.communication.update.mockResolvedValue({
      id: "comm-1",
      plantId: "plant-1",
      type: CommunicationType.UNSAFE_CONDITION,
      status: CommunicationStatus.ONGOING,
    });

    const result = await CommunicationService.validate({
      communicationId: "comm-1",
      actorUserId: "user-1",
      actorRole: RoleCode.N3_SAFETY,
      payload: {
        isValid: true,
        status: CommunicationStatus.VALID_OPEN,
        notes: "Approved",
      },
    });

    expect((result as { status: CommunicationStatus }).status).toBe(CommunicationStatus.ONGOING);
    expect(prismaMock.communication.update).toHaveBeenCalledWith({
      where: { id: "comm-1" },
      data: expect.objectContaining({
        status: CommunicationStatus.ONGOING,
      }),
    });
  });

  it("creates SEWO and dispatches supervisor alerts when N3 creates an approved communication directly", async () => {
    prismaMock.employeeDirectory.findUnique.mockResolvedValue(null);
    prismaMock.riskTheme.findFirst.mockResolvedValue({ id: "risk-theme-1" });
    prismaMock.communication.create.mockResolvedValue({
      id: "comm-2",
      plantId: "plant-1",
      type: CommunicationType.ACCIDENT,
      status: CommunicationStatus.VALID_OPEN,
      eventDatetime: new Date("2026-05-01T10:00:00Z"),
      targetEmployeeId: null,
      targetEmployeeNo: null,
      workstationId: null,
      reporterName: "Reporter",
      reporterEmployeeNo: null,
    });

    const communication = await CommunicationService.create({
      plantId: "plant-1",
      payload: {
        type: CommunicationType.ACCIDENT,
        eventDatetime: new Date("2026-05-01T10:00:00Z"),
        reporterName: "Reporter",
        reporterEmployeeNo: undefined,
        targetText: undefined,
        targetEmployeeNo: undefined,
        targetEmployeeId: undefined,
        shiftId: undefined,
        areaId: undefined,
        lineId: undefined,
        workstationId: undefined,
        equipmentId: undefined,
        riskThemeId: "risk-theme-1",
        unsafeActTypeId: undefined,
        unsafeConditionTypeId: undefined,
        nearMissTypeId: undefined,
        description: "Test accident",
        suggestedAction: undefined,
        severityPotential: undefined,
        isContractor: undefined,
        bodyPartId: undefined,
        injuryTypeId: undefined,
        isFatal: false,
        initialLostDays: undefined,
        hasLeave: undefined,
        returnDate: undefined,
        attachments: undefined,
      },
      reporterUserId: "user-1",
      actorRole: RoleCode.N3_SAFETY,
    });

    expect(communication.id).toBe("comm-2");
    expect(
      safetyCommunicationAlertServiceMock.SafetyCommunicationAlertService.safeDispatchN3CommunicationCreatedAlerts,
    ).toHaveBeenCalledWith({
      communicationId: "comm-2",
    });
    expect(sewoServiceMock.SewaService.createProvisionalFromCommunication).toHaveBeenCalledWith({
      communicationId: "comm-2",
      actorUserId: "user-1",
    });
    expect(
      safetyCommunicationAlertServiceMock.SafetyCommunicationAlertService.safeDispatchApprovedCommunicationAlerts,
    ).toHaveBeenCalledWith({
      communicationId: "comm-2",
      actorRole: RoleCode.N3_SAFETY,
    });
  });

  it("does not dispatch supervisor alerts when the created communication is not in the approved lifecycle", async () => {
    prismaMock.riskTheme.findFirst.mockResolvedValue({ id: "risk-theme-1" });
    prismaMock.communication.create.mockResolvedValue({
      id: "comm-3",
      plantId: "plant-1",
      type: CommunicationType.ACCIDENT,
      status: CommunicationStatus.SUBMITTED,
      eventDatetime: new Date("2026-05-01T10:00:00Z"),
      targetEmployeeId: null,
      targetEmployeeNo: null,
      workstationId: null,
      reporterName: "Reporter",
      reporterEmployeeNo: null,
    });

    await CommunicationService.create({
      plantId: "plant-1",
      payload: {
        type: CommunicationType.ACCIDENT,
        eventDatetime: new Date("2026-05-01T10:00:00Z"),
        reporterName: "Reporter",
        reporterEmployeeNo: undefined,
        targetText: undefined,
        targetEmployeeNo: undefined,
        targetEmployeeId: undefined,
        shiftId: undefined,
        areaId: undefined,
        lineId: undefined,
        workstationId: undefined,
        equipmentId: undefined,
        riskThemeId: "risk-theme-1",
        unsafeActTypeId: undefined,
        unsafeConditionTypeId: undefined,
        nearMissTypeId: undefined,
        description: "Pending accident",
        suggestedAction: undefined,
        severityPotential: undefined,
        isContractor: undefined,
        bodyPartId: undefined,
        injuryTypeId: undefined,
        isFatal: false,
        initialLostDays: undefined,
        hasLeave: undefined,
        returnDate: undefined,
        attachments: undefined,
      },
      reporterUserId: "user-1",
      actorRole: RoleCode.N4_SUPERVISOR,
    });

    expect(
      safetyCommunicationAlertServiceMock.SafetyCommunicationAlertService.safeDispatchN3CommunicationCreatedAlerts,
    ).toHaveBeenCalledWith({
      communicationId: "comm-3",
    });
    expect(sewoServiceMock.SewaService.createProvisionalFromCommunication).not.toHaveBeenCalled();
    expect(
      safetyCommunicationAlertServiceMock.SafetyCommunicationAlertService.safeDispatchApprovedCommunicationAlerts,
    ).not.toHaveBeenCalled();
  });

  it("stores every involved worker for public unsafe act communications", async () => {
    const involvedEmployeeIds = ["worker-1", "worker-2"];
    prismaMock.employeeDirectory.findUnique.mockResolvedValue({
      id: "worker-1",
      name: "Worker One",
      employeeNo: "001",
    });
    prismaMock.employeeDirectory.findMany.mockResolvedValue([
      { id: "worker-1" },
      { id: "worker-2" },
    ]);
    prismaMock.communication.create.mockResolvedValue({
      id: "comm-4",
      plantId: "plant-1",
      type: CommunicationType.UNSAFE_ACT,
      status: CommunicationStatus.SUBMITTED,
      eventDatetime: new Date("2026-05-01T10:00:00Z"),
      targetEmployeeId: "worker-1",
      targetEmployeeNo: "001",
      workstationId: null,
      reporterName: "Reporter",
      reporterEmployeeNo: null,
    });

    await CommunicationService.create({
      plantId: "plant-1",
      payload: {
        type: CommunicationType.UNSAFE_ACT,
        eventDatetime: new Date("2026-05-01T10:00:00Z"),
        reporterName: "Reporter",
        reporterEmployeeNo: undefined,
        targetText: undefined,
        targetEmployeeNo: undefined,
        targetEmployeeId: "worker-1",
        involvedEmployeeIds,
        shiftId: undefined,
        areaId: undefined,
        lineId: undefined,
        workstationId: undefined,
        equipmentId: undefined,
        riskThemeId: undefined,
        unsafeActTypeId: undefined,
        unsafeConditionTypeId: undefined,
        nearMissTypeId: undefined,
        description: "Unsafe act with multiple workers",
        suggestedAction: undefined,
        severityPotential: undefined,
        isContractor: undefined,
        bodyPartId: undefined,
        injuryTypeId: undefined,
        isFatal: false,
        initialLostDays: undefined,
        hasLeave: undefined,
        returnDate: undefined,
        attachments: undefined,
      },
      source: CommunicationSource.TOKEN_REPORT,
    });

    expect(prismaMock.employeeDirectory.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: involvedEmployeeIds },
        plantId: "plant-1",
        isActive: true,
      },
      select: { id: true },
    });
    expect(prismaMock.communication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetEmployeeId: "worker-1",
          involvedEmployees: {
            createMany: {
              data: [
                { employeeId: "worker-1", sortOrder: 0 },
                { employeeId: "worker-2", sortOrder: 1 },
              ],
            },
          },
        }),
      }),
    );
  });

  it("stores improvement subtype and ignores worker data for improvement communications", async () => {
    prismaMock.employeeDirectory.findUnique.mockResolvedValue({
      id: "worker-1",
      name: "Worker One",
      employeeNo: "001",
    });
    prismaMock.communication.create.mockResolvedValue({
      id: "comm-5",
      plantId: "plant-1",
      type: CommunicationType.FIVE_S_IMPROVEMENT,
      status: CommunicationStatus.SUBMITTED,
      eventDatetime: new Date("2026-05-01T10:00:00Z"),
      targetEmployeeId: null,
      targetEmployeeNo: null,
      workstationId: null,
      reporterName: "Reporter",
      reporterEmployeeNo: null,
    });

    await CommunicationService.create({
      plantId: "plant-1",
      payload: {
        type: CommunicationType.FIVE_S_IMPROVEMENT,
        improvementSubtype: CommunicationImprovementSubtype.FIVE_S_AREA_IMPROVEMENT,
        eventDatetime: new Date("2026-05-01T10:00:00Z"),
        reporterName: "Reporter",
        reporterEmployeeNo: undefined,
        targetText: "Worker One",
        targetEmployeeNo: "001",
        targetEmployeeId: "worker-1",
        shiftId: undefined,
        areaId: undefined,
        lineId: undefined,
        workstationId: undefined,
        equipmentId: undefined,
        riskThemeId: undefined,
        unsafeActTypeId: undefined,
        unsafeConditionTypeId: undefined,
        nearMissTypeId: undefined,
        description: "5S improvement without involved worker",
        suggestedAction: undefined,
        severityPotential: undefined,
        isContractor: undefined,
        bodyPartId: undefined,
        injuryTypeId: undefined,
        isFatal: false,
        initialLostDays: undefined,
        hasLeave: undefined,
        returnDate: undefined,
        attachments: undefined,
      },
      source: CommunicationSource.TOKEN_REPORT,
    });

    expect(prismaMock.communication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          improvementSubtype: CommunicationImprovementSubtype.FIVE_S_AREA_IMPROVEMENT,
          targetText: undefined,
          targetEmployeeNo: null,
          targetEmployeeId: null,
        }),
      }),
    );
  });
});
