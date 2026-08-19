import { CommunicationStatus, CommunicationType, SEWOStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const txMock = vi.hoisted(() => ({
  sEWO: {
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  sewoAutoCreationSuppression: {
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  communicationAttachment: {
    findMany: vi.fn(),
  },
  sEWOAttachment: {
    findMany: vi.fn(),
    createMany: vi.fn(),
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
      findUniqueOrThrow: vi.fn(),
    },
    sewoAutoCreationSuppression: {
      findUnique: vi.fn(),
    },
    plant: {
      findUniqueOrThrow: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    communication: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    communicationAttachment: {
      findMany: vi.fn(),
    },
    sEWOAttachment: {
      findMany: vi.fn(),
      createMany: vi.fn(),
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
vi.mock("@/lib/services/record-code-service", () => ({
  RecordCodeService: {
    allocateSewoCode: vi.fn(() => ({
      codigoSewo: "PT11-SEWO-2026-0001",
      tipo: "SEWO",
      codigoFabrica: "PT11",
      ano: 2026,
      numeroSequencial: 1,
    })),
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

import { SewaService, syncCommunicationAttachmentsToSewo } from "@/lib/services/sewo-service";

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
    attachments: [
      {
        id: "attachment-1",
        fileKey: "maap/communications/public-reports/photo-1.jpg",
        fileName: "photo-1.jpg",
        originalName: "photo-1-original.jpg",
        contentType: "image/jpeg",
        size: 1234,
        createdAt: new Date("2026-06-03T08:31:00.000Z"),
        uploadedByUserId: null,
      },
      {
        id: "attachment-2",
        fileKey: "maap/communications/public-reports/photo-2.png",
        fileName: "photo-2.png",
        originalName: "photo-2-original.png",
        contentType: "image/png",
        size: 2345,
        createdAt: new Date("2026-06-03T08:32:00.000Z"),
        uploadedByUserId: null,
      },
    ],
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
    txMock.communicationAttachment.findMany.mockResolvedValue(communication.attachments);
    txMock.sEWOAttachment.findMany.mockResolvedValue([]);
    txMock.sEWOAttachment.createMany.mockResolvedValue({ count: 2 });
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
    expect(txMock.sEWOAttachment.createMany).toHaveBeenCalledWith({
      data: [
        {
          sewoId: "sewo-1",
          type: "EVENT_EVIDENCE",
          fileKey: "maap/communications/public-reports/photo-1.jpg",
          fileName: "photo-1.jpg",
          contentType: "image/jpeg",
          caption: null,
          uploadedById: "user-1",
        },
        {
          sewoId: "sewo-1",
          type: "EVENT_EVIDENCE",
          fileKey: "maap/communications/public-reports/photo-2.png",
          fileName: "photo-2.png",
          contentType: "image/png",
          caption: null,
          uploadedById: "user-1",
        },
      ],
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

  it("creates an automatic S-EWO normally when the communication has no photos", async () => {
    const communication = {
      ...buildCommunication(CommunicationType.FIRST_AID),
      attachments: [],
      actions: [],
    };
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue(null);
    prismaMock.prisma.user.findUnique.mockResolvedValue({ language: "en" });
    prismaMock.prisma.communication.findUniqueOrThrow.mockResolvedValue(communication);
    prismaMock.prisma.sEWOCauseCatalogVersion.findFirst.mockResolvedValue({ id: "catalog-1" });
    txMock.sEWO.create.mockResolvedValue({ id: "sewo-no-photos", communicationId: communication.id });
    txMock.communicationAttachment.findMany.mockResolvedValue([]);

    const result = await SewaService.createProvisionalFromCommunication({
      communicationId: communication.id,
      actorUserId: "user-1",
    });

    expect(result).toMatchObject({ id: "sewo-no-photos", communicationId: communication.id });
    expect(txMock.sEWO.create).toHaveBeenCalled();
    expect(txMock.sEWOAttachment.createMany).not.toHaveBeenCalled();
  });

  it("does not create duplicate S-EWO records for the same communication", async () => {
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue({ id: "existing-sewo", communicationId: "comm-1" });
    prismaMock.prisma.sewoAutoCreationSuppression.findUnique.mockResolvedValue(null);
    txMock.communicationAttachment.findMany.mockResolvedValue([]);

    const result = await SewaService.createProvisionalFromCommunication({
      communicationId: "comm-1",
      actorUserId: "user-1",
    });

    expect(result).toMatchObject({ id: "existing-sewo", communicationId: "comm-1" });
    expect(prismaMock.prisma.communication.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(txMock.sEWO.create).not.toHaveBeenCalled();
    expect(txMock.communicationAttachment.findMany).toHaveBeenCalledWith({
      where: {
        communicationId: "comm-1",
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  });

  it("does not recreate an automatic S-EWO after its source communication is suppressed", async () => {
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue(null);
    prismaMock.prisma.sewoAutoCreationSuppression.findUnique.mockResolvedValue({ id: "suppression-1" });

    const result = await SewaService.createProvisionalFromCommunication({
      communicationId: "comm-1",
      actorUserId: "user-1",
    });

    expect(result).toBeNull();
    expect(prismaMock.prisma.communication.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(txMock.sEWO.create).not.toHaveBeenCalled();
  });
});

describe("SewaService.deleteSewo", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const updatedAt = new Date("2026-08-19T10:00:00.000Z");

  function draftSewo(overrides: Record<string, unknown> = {}) {
    return {
      id: "sewo-1",
      plantId: "plant-1",
      communicationId: "comm-1",
      isAutoCreated: true,
      status: "DRAFT",
      updatedAt,
      actions: [],
      actionLinks: [],
      ...overrides,
    };
  }

  it("soft-deletes an eligible draft without removing the source communication or linked records", async () => {
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue(draftSewo());
    txMock.sEWO.updateMany.mockResolvedValue({ count: 1 });
    txMock.sewoAutoCreationSuppression.upsert.mockResolvedValue({ id: "suppression-1" });
    txMock.auditLog.create.mockResolvedValue({ id: "audit-1" });

    const result = await SewaService.deleteSewo({
      sewoId: "sewo-1",
      actorUserId: "user-1",
      expectedUpdatedAt: updatedAt,
    });

    expect(result.id).toBe("sewo-1");
    expect(txMock.sEWO.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        communicationId: null,
        deletedByUserId: "user-1",
      }),
    }));
    expect(txMock.sewoAutoCreationSuppression.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { communicationId: "comm-1" },
    }));
    expect(txMock.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "DELETE" }),
    }));
  });

  it.each([SEWOStatus.IN_APPROVAL, SEWOStatus.APPROVED, SEWOStatus.REJECTED, SEWOStatus.CLOSED])("blocks deletion of %s records", async (status) => {
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue(draftSewo({ status }));

    await expect(SewaService.deleteSewo({
      sewoId: "sewo-1",
      actorUserId: "user-1",
      expectedUpdatedAt: updatedAt,
    })).rejects.toMatchObject({ code: "SEWO_DELETE_DRAFT_ONLY", status: 409 });

    expect(txMock.sEWO.updateMany).not.toHaveBeenCalled();
  });

  it("blocks deletion when the draft has linked actions", async () => {
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue(draftSewo({ actions: [{ id: "action-1" }] }));

    await expect(SewaService.deleteSewo({
      sewoId: "sewo-1",
      actorUserId: "user-1",
      expectedUpdatedAt: updatedAt,
    })).rejects.toMatchObject({ code: "SEWO_HAS_LINKED_ACTIONS", status: 409 });

    expect(txMock.sEWO.updateMany).not.toHaveBeenCalled();
  });
});

describe("syncCommunicationAttachmentsToSewo", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not create duplicate S-EWO attachments when synchronization runs twice", async () => {
    const attachments = buildCommunication(CommunicationType.NEAR_MISS).attachments;
    txMock.communicationAttachment.findMany.mockResolvedValue(attachments);
    txMock.sEWOAttachment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(attachments.map((attachment) => ({ fileKey: attachment.fileKey })));
    txMock.sEWOAttachment.createMany.mockResolvedValue({ count: 2 });

    await syncCommunicationAttachmentsToSewo({
      communicationId: "comm-near_miss",
      sewoId: "sewo-1",
      actorUserId: "user-1",
      tx: txMock,
    });
    await syncCommunicationAttachmentsToSewo({
      communicationId: "comm-near_miss",
      sewoId: "sewo-1",
      actorUserId: "user-1",
      tx: txMock,
    });

    expect(txMock.sEWOAttachment.createMany).toHaveBeenCalledTimes(1);
    expect(txMock.sEWOAttachment.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          sewoId: "sewo-1",
          fileKey: "maap/communications/public-reports/photo-1.jpg",
        }),
        expect.objectContaining({
          sewoId: "sewo-1",
          fileKey: "maap/communications/public-reports/photo-2.png",
        }),
      ]),
    });
  });
});

describe("SewaService manual communication linking", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects manual S-EWO creation from a communication still in validation", async () => {
    prismaMock.prisma.plant.findUniqueOrThrow.mockResolvedValue({ code: "pt11" });
    prismaMock.prisma.communication.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      type: CommunicationType.NEAR_MISS,
      status: CommunicationStatus.PENDING_VALIDATION,
    });

    await expect(SewaService.create({
      plantId: "plant-1",
      actorUserId: "user-1",
      payload: {
        communicationId: "11111111-1111-4111-8111-111111111111",
        eventClassification: "Near miss",
        analysisDate: new Date("2026-06-03T08:30:00.000Z"),
        whatText: "Near miss",
        whereText: "PT11",
        whoText: "Worker",
        usualWorkYesNo: true,
        whichText: "NEAR_MISS",
        howText: "Pending communication",
        immediateCorrectiveActionText: "",
        templateData: {},
        attachments: [],
        actionPlans: [],
        causeCatalogVersionId: "11111111-1111-4111-8111-222222222222",
        causeSelections: [],
      },
    })).rejects.toMatchObject({
      name: "SewoValidationError",
      code: "INVALID_COMMUNICATION",
      status: 422,
    });

    expect(txMock.sEWO.create).not.toHaveBeenCalled();
  });
});
