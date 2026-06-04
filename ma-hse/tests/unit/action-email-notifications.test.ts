import { ActionStatus } from "@prisma/client";
import { describe, expect, it, vi, afterEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  action: {
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
  },
  sEWOActionLink: {
    findMany: vi.fn(),
  },
}));

const notificationMock = vi.hoisted(() => ({
  NotificationService: {
    notify: vi.fn(),
  },
}));

const emailMock = vi.hoisted(() => ({
  sendActionAssignedEmail: vi.fn(),
  sendActionDueSoonEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/services/notification-service", () => notificationMock);
vi.mock("@/src/email/systemEmailHelpers.js", () => emailMock);
vi.mock("@/lib/services/communication-service", () => ({ CommunicationService: { syncStatusWithActions: vi.fn() } }));
vi.mock("@/lib/services/sewo-service", () => ({ SewaService: { syncStatusWithActions: vi.fn() } }));
vi.mock("@/lib/services/parameter-service", () => ({ getSlaConfig: vi.fn() }));
vi.mock("@/lib/audit", () => ({ buildDiff: vi.fn(), writeAuditLog: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://example.test" } }));

import { ActionService } from "@/lib/services/action-service";

describe("ActionService email notifications", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends an action assigned template to each assigned user language", async () => {
    prismaMock.action.findUniqueOrThrow.mockResolvedValue({
      id: "action-1",
      plantId: "plant-1",
      title: "Guard inspection",
      description: "Inspect machine guard.",
      dueDate: new Date("2026-06-10T00:00:00.000Z"),
      ownerUserId: "user-owner",
      plant: { code: "maap", name: "MAAP" },
      ownerUser: { id: "user-owner", name: "Owner", email: "owner@example.com", language: "it" },
      coOwners: [
        { userId: "user-co", user: { id: "user-co", name: "Co Owner", email: "co@example.com", language: "es" } },
      ],
    });

    await ActionService.notifyAssignees("action-1");

    expect(notificationMock.NotificationService.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ["user-owner", "user-co"],
      }),
    );
    expect(emailMock.sendActionAssignedEmail).toHaveBeenCalledTimes(2);
    expect(emailMock.sendActionAssignedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ email: "owner@example.com", language: "it" }),
        actionTitle: "Guard inspection",
      }),
    );
  });

  it("sends due soon templates using the existing five-day reminder rule", async () => {
    prismaMock.action.findMany.mockResolvedValue([
      {
        id: "action-2",
        plantId: "plant-1",
        title: "Close finding",
        dueDate: new Date("2026-06-10T00:00:00.000Z"),
        status: ActionStatus.OPEN,
        ownerUserId: "user-owner",
        plant: { code: "maap", name: "MAAP" },
        ownerUser: { id: "user-owner", name: "Owner", email: "owner@example.com", language: null },
        coOwners: [],
      },
    ]);

    await expect(ActionService.sendDueDateNotifications(new Date("2026-06-05T00:00:00.000Z"))).resolves.toBe(1);

    expect(emailMock.sendActionDueSoonEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ email: "owner@example.com", language: null }),
        daysUntilDue: 5,
      }),
    );
  });
});
