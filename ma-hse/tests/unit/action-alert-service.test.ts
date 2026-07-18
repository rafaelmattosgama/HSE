import { ActionAlertChannel, ActionAlertType, ActionStatus } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function uniqueError() {
  return { code: "P2002" };
}

const txMock = vi.hoisted(() => ({
  notification: {
    create: vi.fn(),
  },
  actionAlertDelivery: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
  action: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  notification: {
    updateMany: vi.fn(),
  },
  actionAlertDelivery: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
}));

const emailMock = vi.hoisted(() => ({
  sendNotificationEmail: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/src/email/systemEmailHelpers.js", () => emailMock);
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://example.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));

import { ActionAlertService } from "@/lib/services/action-alert-service";

const owner = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Owner",
  email: "owner@example.com",
  language: "pt",
  isActive: true,
};

function actionFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "22222222-2222-2222-2222-222222222222",
    plantId: "plant-1",
    title: "Close guard finding",
    description: "Install missing guard.",
    dueDate: new Date("2026-06-08T10:00:00.000Z"),
    status: ActionStatus.OPEN,
    communicationId: "33333333-3333-3333-3333-333333333333",
    plant: { id: "plant-1", code: "maap", name: "MAAP" },
    ownerUser: owner,
    coOwners: [],
    communication: {
      id: "33333333-3333-3333-3333-333333333333",
      area: { name: "Line A" },
      workstation: { name: "Press 01" },
    },
    sewo: null,
    ...overrides,
  };
}

describe("ActionAlertService", () => {
  beforeEach(() => {
    txMock.notification.create.mockResolvedValue({ id: "44444444-4444-4444-4444-444444444444" });
    txMock.actionAlertDelivery.create.mockResolvedValue({});
    prismaMock.actionAlertDelivery.create.mockResolvedValue({});
    emailMock.sendNotificationEmail.mockResolvedValue({});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sends software and email alerts when a new action is opened for a user", async () => {
    const action = actionFixture();
    prismaMock.action.findUnique.mockResolvedValue(action);

    await expect(ActionAlertService.sendNewActionAlerts(action.id)).resolves.toBe(2);

    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: owner.id,
          channel: "ACTION_ALERT",
          title: expect.stringContaining("Nova ação aberta"),
          body: expect.stringContaining("Local: Press 01"),
        }),
      }),
    );
    expect(txMock.actionAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionId: action.id,
          userId: owner.id,
          alertType: ActionAlertType.NEW_ACTION,
          channel: ActionAlertChannel.SOFTWARE,
        }),
      }),
    );
    expect(prismaMock.actionAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionId: action.id,
          userId: owner.id,
          alertType: ActionAlertType.NEW_ACTION,
          channel: ActionAlertChannel.EMAIL,
        }),
      }),
    );
    expect(emailMock.sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ email: owner.email }),
        mensagem: expect.stringContaining("Data limite:"),
      }),
    );
  });

  it("sends the three-day alert only for open actions due exactly three Lisbon calendar days later", async () => {
    const action = actionFixture({
      dueDate: new Date("2026-06-08T10:00:00.000Z"),
    });
    prismaMock.action.findMany.mockResolvedValue([action]);

    await expect(
      ActionAlertService.sendThreeDaysBeforeDueDateAlerts({
        plantId: "plant-1",
        referenceDate: new Date("2026-06-05T08:00:00.000Z"),
      }),
    ).resolves.toBe(2);

    expect(prismaMock.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plantId: "plant-1",
          status: { in: [ActionStatus.OPEN, ActionStatus.ONGOING] },
        }),
      }),
    );
    expect(txMock.actionAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alertType: ActionAlertType.THREE_DAYS_BEFORE_DUE_DATE,
        }),
      }),
    );
    expect(emailMock.sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tituloNotificacao: expect.stringContaining("Ação a 3 dias da data limite"),
      }),
    );
  });

  it("sends overdue alerts once per action, user and channel", async () => {
    const action = actionFixture({
      dueDate: new Date("2026-06-04T10:00:00.000Z"),
    });
    prismaMock.action.findMany.mockResolvedValue([action]);

    await expect(
      ActionAlertService.sendOverdueActionAlerts({
        referenceDate: new Date("2026-06-05T08:00:00.000Z"),
      }),
    ).resolves.toBe(2);

    txMock.actionAlertDelivery.create.mockRejectedValue(uniqueError());
    prismaMock.actionAlertDelivery.create.mockRejectedValue(uniqueError());

    await expect(
      ActionAlertService.sendOverdueActionAlerts({
        referenceDate: new Date("2026-06-05T08:00:00.000Z"),
      }),
    ).resolves.toBe(0);

    expect(emailMock.sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(txMock.actionAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          alertType: ActionAlertType.OVERDUE_ACTION,
          channel: ActionAlertChannel.SOFTWARE,
        }),
      }),
    );
  });
});
