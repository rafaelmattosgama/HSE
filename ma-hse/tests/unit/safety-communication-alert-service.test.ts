import {
  CommunicationStatus,
  CommunicationType,
  NotificationStatus,
  SafetyCommunicationNotificationDeliveryStatus,
} from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn((queries: Array<Promise<unknown>>) => Promise.all(queries)),
  communication: {
    findUnique: vi.fn(),
  },
  employeeDirectory: {
    findUnique: vi.fn(),
  },
  area: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  userPlantRole: {
    findFirst: vi.fn(),
  },
  safetyCommunicationAlertRecipient: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    updateMany: vi.fn(),
  },
  safetyCommunicationNotification: {
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  notification: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}));

const emailMock = vi.hoisted(() => ({
  sendNotificationEmail: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const validationMock = vi.hoisted(() => ({
  formatSewoOccurrenceType: vi.fn(() => "Injury"),
  getSifPsifDisplayLabel: vi.fn(() => "PSIF"),
  getSifPsifResultFromTemplateData: vi.fn(() => "PSIF"),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/src/email/systemEmailHelpers.js", () => emailMock);
vi.mock("@/lib/logger", () => loggerMock);
vi.mock("@/lib/services/sewo-validation-service", () => validationMock);
vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
  },
}));

import { SafetyCommunicationAlertService } from "@/lib/services/safety-communication-alert-service";

describe("SafetyCommunicationAlertService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches alerts only to supervisors configured for the worker department and includes the communication description", async () => {
    prismaMock.communication.findUnique.mockResolvedValue({
      id: "comm-1",
      plantId: "plant-1",
      type: CommunicationType.ACCIDENT,
      status: CommunicationStatus.VALID_OPEN,
      description: "Worker slipped near the conveyor guard.",
      eventDatetime: new Date("2026-05-27T08:30:00.000Z"),
      targetText: null,
      plant: {
        id: "plant-1",
        code: "pl1",
        name: "Plant 1",
      },
      workstation: {
        name: "WS-12",
      },
      targetEmployee: {
        id: "worker-1",
        name: "Ana Silva",
        employeeNo: "1007",
        dept: "Assembly",
      },
      sewoRecords: [
        {
          id: "sewo-1",
          templateData: {
            sifPsifDecision: {},
          },
        },
      ],
    });
    prismaMock.area.findMany.mockResolvedValue([
      {
        id: "dept-assembly",
        code: "ASSEMBLY",
        name: "Assembly",
      },
      {
        id: "dept-paint",
        code: "PAINT",
        name: "Paint",
      },
    ]);
    prismaMock.safetyCommunicationAlertRecipient.findMany.mockResolvedValue([
      {
        user: {
          id: "supervisor-1",
          name: "Supervisor One",
          email: "sup1@example.com",
        },
      },
      {
        user: {
          id: "supervisor-2",
          name: "Supervisor Two",
          email: "sup2@example.com",
        },
      },
    ]);
    prismaMock.safetyCommunicationNotification.upsert
      .mockResolvedValueOnce({
        id: "email-1",
        status: SafetyCommunicationNotificationDeliveryStatus.PENDING,
      })
      .mockResolvedValueOnce({
        id: "floating-1",
        status: SafetyCommunicationNotificationDeliveryStatus.PENDING,
      })
      .mockResolvedValueOnce({
        id: "email-2",
        status: SafetyCommunicationNotificationDeliveryStatus.PENDING,
      })
      .mockResolvedValueOnce({
        id: "floating-2",
        status: SafetyCommunicationNotificationDeliveryStatus.PENDING,
      });
    prismaMock.notification.findUnique.mockResolvedValue(null);
    prismaMock.notification.create
      .mockResolvedValueOnce({
        id: "notification-1",
        status: NotificationStatus.UNREAD,
      })
      .mockResolvedValueOnce({
        id: "notification-2",
        status: NotificationStatus.UNREAD,
      });

    await SafetyCommunicationAlertService.dispatchApprovedCommunicationAlerts({
      communicationId: "comm-1",
    });

    expect(prismaMock.safetyCommunicationAlertRecipient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plantId: "plant-1",
          departmentId: "dept-assembly",
        }),
      }),
    );

    expect(emailMock.sendNotificationEmail).toHaveBeenCalledTimes(2);
    expect(emailMock.sendNotificationEmail).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        user: expect.objectContaining({ email: "sup1@example.com" }),
        tituloNotificacao: "Comunicacao de Seguranca - Injury",
        mensagem: expect.stringContaining("Descricao: Worker slipped near the conveyor guard."),
      }),
    );
    expect(emailMock.sendNotificationEmail).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        user: expect.objectContaining({ email: "sup2@example.com" }),
        mensagem: expect.stringContaining("Trabalhador envolvido: Ana Silva"),
      }),
    );

    expect(prismaMock.safetyCommunicationNotification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          plantId: "plant-1",
          departmentId: "dept-assembly",
        }),
      }),
    );

    expect(prismaMock.notification.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "supervisor-1",
          plantId: "plant-1",
          title: "Comunicacao de Seguranca - Injury",
          body: expect.stringContaining("Descricao: Worker slipped near the conveyor guard."),
        }),
      }),
    );
    expect(loggerMock.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        communicationId: "comm-1",
        departmentId: "dept-assembly",
        recipients: ["supervisor-1", "supervisor-2"],
      }),
      "dispatched_safety_communication_alerts",
    );
  });

  it("can add recipients through raw SQL when the runtime Prisma Client lacks the generated recipient delegate", async () => {
    const recipientDelegate = prismaMock.safetyCommunicationAlertRecipient;
    (prismaMock as { safetyCommunicationAlertRecipient?: unknown }).safetyCommunicationAlertRecipient = undefined;

    try {
      prismaMock.area.findFirst.mockResolvedValue({
        id: "dept-assembly",
        code: "A01",
        name: "Assembly",
      });
      prismaMock.userPlantRole.findFirst.mockResolvedValue({ id: "role-1" });
      prismaMock.$queryRaw
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "recipient-1",
            userId: "supervisor-1",
            userName: "Supervisor One",
            userEmail: "sup1@example.com",
            departmentId: "dept-assembly",
            departmentCode: "A01",
            departmentName: "Assembly",
            createdAt: new Date("2026-05-28T08:00:00.000Z"),
            updatedAt: new Date("2026-05-28T08:00:00.000Z"),
          },
        ]);
      prismaMock.$executeRaw.mockResolvedValue(1);

      const recipient = await SafetyCommunicationAlertService.addRecipient({
        plantId: "plant-1",
        userId: "supervisor-1",
        departmentId: "dept-assembly",
        actorUserId: "actor-1",
      });

      expect(recipient).toEqual({
        id: "recipient-1",
        userId: "supervisor-1",
        userName: "Supervisor One",
        userEmail: "sup1@example.com",
        departmentId: "dept-assembly",
        departmentCode: "A01",
        departmentName: "Assembly",
        createdAt: "2026-05-28T08:00:00.000Z",
        updatedAt: "2026-05-28T08:00:00.000Z",
      });
      expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
      expect(recipientDelegate.upsert).not.toHaveBeenCalled();
    } finally {
      prismaMock.safetyCommunicationAlertRecipient = recipientDelegate;
    }
  });
});
