import { SEWOStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  sEWO: {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
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
  sewoRejectedNotificationQueue: {
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
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
  getSifPsifDisplayLabel: vi.fn(() => "Pending"),
  getSifPsifResultFromTemplateData: vi.fn(() => "PENDING"),
  getUserHighestRoleForSewoPlant: vi.fn(),
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
import { handleSewoRejectedNotification } from "@/jobs/handlers/sewo-rejected-notification";

async function flushAsyncWork() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("SewaService rejection notifications", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enqueues the N3 rejection notification instead of blocking the approval request", async () => {
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      status: SEWOStatus.IN_APPROVAL,
    });
    prismaMock.sEWO.update.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      status: SEWOStatus.REJECTED,
    });

    const result = await SewaService.approve({
      sewoId: "sewo-1",
      actorUserId: "user-1",
      payload: {
        approved: false,
        approvalComment: "Missing evidence",
      },
    });

    await flushAsyncWork();

    expect(result.status).toBe(SEWOStatus.REJECTED);
    expect(queuesMock.sewoRejectedNotificationQueue.add).toHaveBeenCalledWith(
      "send-sewo-rejected-notification",
      { sewoId: "sewo-1", actorUserId: "user-1", approvalComment: "Missing evidence" },
      expect.objectContaining({ attempts: 3 }),
    );
    // Same principle as the submission fix: the request that records the
    // N1 decision must not wait on email delivery to N3.
    expect(notificationMock.NotificationService.notify).not.toHaveBeenCalled();
  });

  it("enqueues a rejection notification when Corporate flips an approved decision to rejected", async () => {
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      status: SEWOStatus.APPROVED,
    });
    prismaMock.sEWO.update.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      status: SEWOStatus.REJECTED,
    });

    await SewaService.changeCorporateDecision({
      sewoId: "sewo-1",
      actorUserId: "corp-1",
      payload: {
        approved: false,
        approvalComment: "Reopened for review",
      },
    });

    await flushAsyncWork();

    expect(queuesMock.sewoRejectedNotificationQueue.add).toHaveBeenCalledWith(
      "send-sewo-rejected-notification",
      { sewoId: "sewo-1", actorUserId: "corp-1", approvalComment: "Reopened for review" },
      expect.objectContaining({ attempts: 3 }),
    );
    expect(notificationMock.NotificationService.notify).not.toHaveBeenCalled();
  });

  it("rejects a worker job with a missing sewoId", async () => {
    await expect(
      handleSewoRejectedNotification({ sewoId: "", actorUserId: "user-1", approvalComment: "" }),
    ).rejects.toThrow(/Invalid S-EWO rejected notification job payload/);
  });

  it("sends the N3 rejection email from the worker handler", async () => {
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      codigoSewo: "PT11-SEWO-2026-0001",
      eventClassification: "NEAR_MISS",
      templateData: null,
      whereText: "Workstation A",
      approvedAt: new Date("2026-06-04T09:00:00.000Z"),
      approvedBy: { name: "N1 Reviewer" },
      communication: { type: "NEAR_MISS" },
      plant: {
        code: "pl1",
        name: "Plant 1",
      },
    });
    prismaMock.user.findUnique.mockResolvedValue({ name: "N1 Reviewer" });
    prismaMock.userPlantRole.findMany.mockResolvedValue([
      {
        userId: "n3-user-1",
        user: {
          id: "n3-user-1",
          email: "n3@example.com",
          name: "N3 Safety",
          language: "pt",
        },
      },
    ]);

    await handleSewoRejectedNotification({
      sewoId: "sewo-1",
      actorUserId: "n1-user-1",
      approvalComment: "Missing evidence",
    });

    expect(notificationMock.NotificationService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        plantId: "plant-1",
        userIds: ["n3-user-1"],
        channel: "sewo-rejected",
        emailRecipients: expect.arrayContaining([expect.objectContaining({ email: "n3@example.com" })]),
      }),
    );
  });
});
