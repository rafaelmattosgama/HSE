import { CommunicationStatus, CommunicationType, RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  employeeDirectory: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  communication: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
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

import { CommunicationService } from "@/lib/services/communication-service";

describe("CommunicationService approved communication alerts", () => {
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

    expect(sewoServiceMock.SewaService.createProvisionalFromCommunication).not.toHaveBeenCalled();
    expect(
      safetyCommunicationAlertServiceMock.SafetyCommunicationAlertService.safeDispatchApprovedCommunicationAlerts,
    ).not.toHaveBeenCalled();
  });
});
