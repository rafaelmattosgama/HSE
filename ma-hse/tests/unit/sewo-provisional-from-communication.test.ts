import { CommunicationType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const txMock = vi.hoisted(() => ({
  sEWO: {
    create: vi.fn(),
  },
  sEWOActionLink: {
    createMany: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn((input: unknown) => {
      if (Array.isArray(input)) {
        return Promise.all(input);
      }

      if (typeof input === "function") {
        return input(txMock);
      }

      return Promise.resolve(input);
    }),
    sEWO: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    communication: {
      findUniqueOrThrow: vi.fn(),
    },
    sEWOCauseCatalogVersion: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/audit", () => ({
  buildDiff: vi.fn(() => ({})),
  writeAuditLog: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock("@/lib/public-report", () => ({
  getLocalizedBodyPartName: vi.fn((bodyPart: { name: string }) => bodyPart.name),
  getLocalizedInjuryTypeName: vi.fn((injuryType: { name: string }) => injuryType.name),
}));
vi.mock("@/lib/services/notification-service", () => ({
  NotificationService: {
    notifyPlantRoles: vi.fn(),
  },
}));
vi.mock("@/lib/services/sewo-export", () => ({
  SewoExportService: {
    buildExport: vi.fn(),
    buildExternalSummaryExport: vi.fn(),
  },
}));
vi.mock("@/lib/services/sewo-recipient-service", () => ({
  listSewoReportRecipients: vi.fn(),
  normalizeSewoReportRecipientLanguage: vi.fn((language: string) => language),
}));
vi.mock("@/src/email/systemEmailHelpers.js", () => ({
  sendSewoSubmittedForValidationEmail: vi.fn(),
  sendSewoValidatedDistributionEmail: vi.fn(),
  sendSewoValidatedSubmitterEmail: vi.fn(),
}));
vi.mock("@/lib/services/sewo-validation-service", () => ({
  SEWO_APPROVED_CHANNEL: "sewo-approved",
  SEWO_N1_APPROVAL_CHANNEL: "sewo-n1",
  SEWO_REJECTED_CHANNEL: "sewo-rejected",
  SEWO_STAKEHOLDER_ROLES: [],
  buildSewoSubmissionTemplateData: vi.fn((input: { templateData: unknown }) => input.templateData),
  formatSewoOccurrenceType: vi.fn(() => "S-EWO"),
  getSewoTemplateRecord: vi.fn((value: unknown) => value && typeof value === "object" ? value : {}),
  getSifPsifDisplayLabel: vi.fn(() => "Pending"),
  getSifPsifResultFromTemplateData: vi.fn(() => "PENDING"),
  getUserHighestRoleForSewoPlant: vi.fn(),
  isPrioritySifPsif: vi.fn(() => false),
  isSewoSubmitterRole: vi.fn(() => true),
}));

import { SewaService } from "@/lib/services/sewo-service";

function buildCommunication(type: CommunicationType) {
  return {
    id: `comm-${type.toLowerCase()}`,
    plantId: "plant-1",
    plant: {
      code: "pt11",
    },
    type,
    classification: null,
    lostDays: type === CommunicationType.ACCIDENT ? 2 : null,
    initialLostDays: type === CommunicationType.ACCIDENT ? 2 : null,
    hasLeave: type === CommunicationType.ACCIDENT,
    returnDate: type === CommunicationType.ACCIDENT ? new Date("2026-06-05T00:00:00.000Z") : null,
    isFatal: false,
    eventDatetime: new Date("2026-06-03T08:30:00.000Z"),
    reporterName: "Ana Silva",
    reporterEmployeeNo: "1001",
    targetEmployeeId: "worker-1",
    targetEmployeeNo: "2002",
    targetText: "Maria Lopes",
    targetEmployee: {
      id: "worker-1",
      name: "Maria Lopes",
      employeeNo: "2002",
      dept: "PT11",
    },
    areaId: "area-1",
    lineId: "line-1",
    shiftId: "shift-1",
    workstationId: "workstation-1",
    injuryTypeId: type === CommunicationType.NEAR_MISS ? null : "injury-1",
    bodyPartId: type === CommunicationType.NEAR_MISS ? null : "body-1",
    area: {
      name: "Press Shop",
    },
    line: {
      name: "Line 1",
    },
    shift: {
      name: "Shift A",
    },
    workstation: {
      name: "PT11",
    },
    bodyPart: type === CommunicationType.NEAR_MISS ? null : {
      name: "Hand",
    },
    injuryType: type === CommunicationType.NEAR_MISS ? null : {
      name: "Contusion",
    },
    description: `${type} communication description`,
    suggestedAction: "Clean and isolate area",
    actions: [
      {
        id: "action-1",
      },
    ],
  };
}

describe("SewaService.createProvisionalFromCommunication", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    CommunicationType.FIRST_AID,
    CommunicationType.NEAR_MISS,
    CommunicationType.ACCIDENT,
  ])("prefills and links automatic S-EWO records for %s communications", async (type) => {
    const communication = buildCommunication(type);
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue(null);
    prismaMock.prisma.user.findUnique.mockResolvedValue({ language: "en" });
    prismaMock.prisma.communication.findUniqueOrThrow.mockResolvedValue(communication);
    prismaMock.prisma.sEWOCauseCatalogVersion.findFirst.mockResolvedValue({ id: "catalog-1" });
    txMock.sEWO.create.mockResolvedValue({ id: "sewo-1", communicationId: communication.id });
    txMock.sEWOActionLink.createMany.mockResolvedValue({ count: 1 });

    const result = await SewaService.createProvisionalFromCommunication({
      communicationId: communication.id,
      actorUserId: "user-1",
    });

    expect(result).toMatchObject({ id: "sewo-1", communicationId: communication.id });
    expect(txMock.sEWO.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        plantId: "plant-1",
        communicationId: communication.id,
        areaId: "area-1",
        lineId: "line-1",
        shiftId: "shift-1",
        analysisDate: communication.eventDatetime,
        whereText: "PT11",
        whoText: "Maria Lopes",
        howText: `${type} communication description`,
        immediateCorrectiveActionText: "Clean and isolate area",
        templateData: expect.objectContaining({
          sourceCommunicationId: communication.id,
          eventType: type,
          eventDatetime: "2026-06-03T08:30:00.000Z",
          areaId: "area-1",
          lineId: "line-1",
          workstationId: "workstation-1",
          shiftId: "shift-1",
          involvedWorkerId: "worker-1",
          involvedWorkerName: "Maria Lopes",
          involvedWorkerEmployeeNo: "2002",
          involvedWorkerDepartment: "PT11",
          natureId: communication.injuryTypeId,
          bodyPartId: communication.bodyPartId,
          analysisText: `${type} communication description`,
          suggestedAction: "Clean and isolate area",
        }),
      }),
    });
    expect(txMock.sEWOActionLink.createMany).toHaveBeenCalledWith({
      data: [
        {
          sewoId: "sewo-1",
          actionId: "action-1",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("does not create duplicate S-EWO records for the same communication", async () => {
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue({ id: "existing-sewo", communicationId: "comm-1" });

    const result = await SewaService.createProvisionalFromCommunication({
      communicationId: "comm-1",
      actorUserId: "user-1",
    });

    expect(result).toMatchObject({ id: "existing-sewo", communicationId: "comm-1" });
    expect(prismaMock.prisma.communication.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(txMock.sEWO.create).not.toHaveBeenCalled();
  });
});
