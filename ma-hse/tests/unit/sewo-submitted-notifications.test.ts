import { RoleCode, SEWOStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  sEWO: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  userPlantRole: {
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

const emailMock = vi.hoisted(() => ({
  sendSewoSubmittedForValidationEmail: vi.fn(),
  sendSewoValidatedDistributionEmail: vi.fn(),
  sendSewoValidatedSubmitterEmail: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    error: vi.fn(),
  },
}));

const queuesMock = vi.hoisted(() => ({
  sewoSubmittedNotificationQueue: {
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
  },
}));

const validationMock = vi.hoisted(() => ({
  SEWO_APPROVED_CHANNEL: "sewo-approved",
  SEWO_N1_APPROVAL_CHANNEL: "sewo-n1",
  SEWO_REJECTED_CHANNEL: "sewo-rejected",
  SEWO_STAKEHOLDER_ROLES: ["N1_CORPORATE", "N2_PLANT_MANAGER", "N3_SAFETY"],
  buildSewoSubmissionTemplateData: vi.fn((input: { templateData: unknown }) => input.templateData),
  formatSewoOccurrenceType: vi.fn(() => "Near Miss"),
  getSewoTemplateRecord: vi.fn(() => ({ eventType: "NEAR_MISS" })),
  getSifPsifDisplayLabel: vi.fn(() => "Pending"),
  getSifPsifResultFromTemplateData: vi.fn(() => "PENDING"),
  getUserHighestRoleForSewoPlant: vi.fn(() => RoleCode.N3_SAFETY),
  isPrioritySifPsif: vi.fn(() => false),
  isSewoSubmitterRole: vi.fn(() => true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
vi.mock("@/lib/audit", () => auditMock);
vi.mock("@/lib/services/notification-service", () => notificationMock);
vi.mock("@/src/email/systemEmailHelpers.js", () => emailMock);
vi.mock("@/lib/logger", () => loggerMock);
vi.mock("@/jobs/queues", () => queuesMock);
vi.mock("@/lib/services/sewo-validation-service", () => validationMock);
vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
  },
}));

import { SewaService } from "@/lib/services/sewo-service";
import { handleSewoSubmittedNotification } from "@/jobs/handlers/sewo-submitted-notification";

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SewaService submission notifications", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues the N1 approval notification instead of blocking the submit request", async () => {
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      status: SEWOStatus.DRAFT,
      templateData: {},
    });
    prismaMock.sEWO.update.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      status: SEWOStatus.IN_APPROVAL,
    });

    const result = await SewaService.submitForApproval("sewo-1", "user-1");

    await flushAsyncWork();

    expect(result.status).toBe(SEWOStatus.IN_APPROVAL);
    expect(queuesMock.sewoSubmittedNotificationQueue.add).toHaveBeenCalledWith(
      "send-sewo-submitted-notification",
      { sewoId: "sewo-1", actorRole: RoleCode.N3_SAFETY },
      expect.objectContaining({ attempts: 3 }),
    );
    // The whole point of routing this through a queue is that the request
    // that saved the S-EWO never waits on email delivery.
    expect(notificationMock.NotificationService.notify).not.toHaveBeenCalled();
    expect(emailMock.sendSewoSubmittedForValidationEmail).not.toHaveBeenCalled();
  });

  it("does not enqueue a submission notification when the S-EWO was already in approval", async () => {
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      status: SEWOStatus.IN_APPROVAL,
      templateData: {},
    });
    prismaMock.sEWO.update.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      status: SEWOStatus.IN_APPROVAL,
    });

    await SewaService.submitForApproval("sewo-1", "user-1");
    await flushAsyncWork();

    expect(queuesMock.sewoSubmittedNotificationQueue.add).not.toHaveBeenCalled();
  });

  it("rejects a worker job with a missing sewoId", async () => {
    await expect(handleSewoSubmittedNotification({ sewoId: "", actorRole: null })).rejects.toThrow(
      /Invalid S-EWO submitted notification job payload/,
    );
  });

  it("sends the N1 approval email from the worker handler", async () => {
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      eventClassification: "NEAR_MISS",
      templateData: null,
      analysisDate: new Date("2026-06-03T08:30:00.000Z"),
      whereText: "Workstation A",
      communication: { type: "NEAR_MISS" },
      plant: {
        code: "pl1",
        name: "Plant 1",
      },
    });
    prismaMock.userPlantRole.findMany.mockResolvedValue([
      {
        userId: "n1-user-1",
        user: {
          id: "n1-user-1",
          email: "n1@example.com",
          name: "N1 Reviewer",
          language: "pt",
        },
      },
    ]);

    await handleSewoSubmittedNotification({ sewoId: "sewo-1", actorRole: RoleCode.N3_SAFETY });

    expect(notificationMock.NotificationService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        plantId: "plant-1",
        userIds: ["n1-user-1"],
        channel: "sewo-n1",
      }),
    );
    expect(emailMock.sendSewoSubmittedForValidationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ email: "n1@example.com" }) }),
    );
  });
});
