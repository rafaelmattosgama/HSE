import { SEWOStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  sEWO: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  userPlantRole: {
    findMany: vi.fn(),
  },
  reportRecipientList: {
    findFirst: vi.fn(),
  },
  reportRecipient: {
    findMany: vi.fn(),
  },
}));

const auditMock = vi.hoisted(() => ({
  buildDiff: vi.fn(() => ({ before: {}, after: {} })),
  writeAuditLog: vi.fn(),
}));

const notificationMock = vi.hoisted(() => ({
  NotificationService: {
    notify: vi.fn(),
  },
}));

const exportMock = vi.hoisted(() => ({
  SewoExportService: {
    buildExport: vi.fn(),
    buildExternalSummaryExport: vi.fn(),
  },
}));

const emailMock = vi.hoisted(() => ({
  EmailService: {
    sendMail: vi.fn(),
  },
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    error: vi.fn(),
  },
}));

const validationMock = vi.hoisted(() => ({
  SEWO_APPROVED_CHANNEL: "sewo-approved",
  SEWO_N1_APPROVAL_CHANNEL: "sewo-n1",
  SEWO_REJECTED_CHANNEL: "sewo-rejected",
  SEWO_STAKEHOLDER_ROLES: ["N1_CORPORATE", "N2_PLANT_MANAGER", "N3_SAFETY"],
  buildSewoSubmissionTemplateData: vi.fn(),
  formatSewoOccurrenceType: vi.fn(() => "Near Miss"),
  getSewoTemplateRecord: vi.fn(() => ({ eventType: "NEAR_MISS" })),
  getSifPsifDisplayLabel: vi.fn(() => "SIF"),
  getSifPsifResultFromTemplateData: vi.fn(() => "SIF"),
  getUserHighestRoleForSewoPlant: vi.fn(),
  isPrioritySifPsif: vi.fn(() => true),
  isSewoSubmitterRole: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
vi.mock("@/lib/audit", () => auditMock);
vi.mock("@/lib/services/notification-service", () => notificationMock);
vi.mock("@/lib/services/sewo-export", () => exportMock);
vi.mock("@/lib/services/email-service", () => emailMock);
vi.mock("@/lib/logger", () => loggerMock);
vi.mock("@/lib/services/sewo-validation-service", () => validationMock);
vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
  },
}));

import { SewaService } from "@/lib/services/sewo-service";

describe("SewaService approval notifications", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends external S-EWO reports in each recipient language after N1 approval", async () => {
    const approvedAt = new Date("2026-05-26T10:00:00.000Z");
    prismaMock.sEWO.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: "sewo-1",
        plantId: "plant-1",
        status: SEWOStatus.IN_APPROVAL,
      })
      .mockResolvedValueOnce({
        id: "sewo-1",
        plantId: "plant-1",
        eventClassification: "NEAR_MISS",
        templateData: null,
        whereText: "Workstation A",
        communication: { type: "NEAR_MISS" },
        line: { name: "Line 4" },
        plant: {
          code: "pl1",
          name: "Plant 1",
          defaultLanguage: "pt",
        },
      })
      .mockResolvedValueOnce({
        id: "sewo-1",
        plantId: "plant-1",
        status: SEWOStatus.APPROVED,
        approvedAt,
        approvedByUserId: "user-1",
        actions: [],
        actionLinks: [],
      })
      .mockResolvedValueOnce({
        id: "sewo-1",
        plantId: "plant-1",
        status: SEWOStatus.APPROVED,
        approvedAt,
        approvedByUserId: "user-1",
      });
    prismaMock.sEWO.update.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      status: SEWOStatus.APPROVED,
      approvedAt,
      approvedByUserId: "user-1",
    });
    prismaMock.userPlantRole.findMany.mockResolvedValue([]);
    prismaMock.reportRecipientList.findFirst.mockResolvedValue({ id: "list-1" });
    prismaMock.reportRecipient.findMany.mockResolvedValue([
      {
        id: "recipient-pt",
        name: "Maria Silva",
        email: "maria@example.com",
        language: "pt",
      },
      {
        id: "recipient-en-1",
        name: "John Doe",
        email: "john@example.com",
        language: "en",
      },
      {
        id: "recipient-en-2",
        name: "Jane Doe",
        email: "jane@example.com",
        language: "en",
      },
    ]);
    exportMock.SewoExportService.buildExternalSummaryExport
      .mockResolvedValueOnce({ pdf: Buffer.from("pt-report") })
      .mockResolvedValueOnce({ pdf: Buffer.from("en-report") });

    const result = await SewaService.approve({
      sewoId: "sewo-1",
      actorUserId: "user-1",
      payload: {
        approved: true,
        approvalComment: "Approved",
      },
    });

    expect(notificationMock.NotificationService.notify).not.toHaveBeenCalled();
    expect(exportMock.SewoExportService.buildExport).not.toHaveBeenCalled();
    expect(exportMock.SewoExportService.buildExternalSummaryExport).toHaveBeenCalledTimes(2);
    expect(exportMock.SewoExportService.buildExternalSummaryExport).toHaveBeenNthCalledWith(1, "sewo-1", { locale: "pt" });
    expect(exportMock.SewoExportService.buildExternalSummaryExport).toHaveBeenNthCalledWith(2, "sewo-1", { locale: "en" });
    expect(emailMock.EmailService.sendMail).toHaveBeenCalledTimes(3);

    const ptEmail = emailMock.EmailService.sendMail.mock.calls.find((call) => call[0].to === "maria@example.com")?.[0];
    const enEmail = emailMock.EmailService.sendMail.mock.calls.find((call) => call[0].to === "john@example.com")?.[0];

    expect(ptEmail).toEqual(expect.objectContaining({
      to: "maria@example.com",
      subject: "Relatorio S-EWO aprovado",
      text: expect.stringContaining("Plant 1 (PL1)"),
    }));
    expect(ptEmail?.text).toContain("Workstation A");
    expect(ptEmail?.text).toContain("Near Miss");
    expect(ptEmail?.text).toContain("SIF");
    expect(ptEmail?.attachments?.[0]?.filename).toBe("sewo-summary-pl1-sewo-1.pdf");

    expect(enEmail).toEqual(expect.objectContaining({
      to: "john@example.com",
      subject: "Approved S-EWO report",
      text: expect.stringContaining("Plant 1 (PL1)"),
    }));
    expect(enEmail?.text).toContain("Workstation A");
    expect(enEmail?.text).toContain("Near Miss");
    expect(enEmail?.text).toContain("SIF");
    expect(result.status).toBe(SEWOStatus.APPROVED);
  });
});
