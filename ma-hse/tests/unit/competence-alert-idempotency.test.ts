import { ActionAlertChannel, AuthorizationStatus, CompetenceAlertType, CompetenceCellState } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function uniqueError() {
  return { code: "P2002" };
}

const txMock = vi.hoisted(() => ({
  notification: {
    create: vi.fn(),
  },
  competenceAlertDelivery: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
  workerAuthorization: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  plant: {
    findUnique: vi.fn(),
  },
  userPlantRole: {
    findMany: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
  },
  competenceWorker: {
    findUnique: vi.fn(),
  },
  competenceType: {
    findUnique: vi.fn(),
  },
  competenceAlertDelivery: {
    create: vi.fn(),
  },
}));

const emailMock = vi.hoisted(() => ({
  sendNotificationEmail: vi.fn(),
}));

type DepartmentRecipientRow = { user: { id: string; name: string; email: string; language: string } };

const safetyCommunicationMock = vi.hoisted(() => ({
  resolveDepartmentAlertRecipients: vi.fn(async (): Promise<DepartmentRecipientRow[]> => []),
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/src/email/systemEmailHelpers.js", () => emailMock);
vi.mock("@/lib/env", () => ({ env: { APP_URL: "https://example.test" } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/services/safety-communication-alert-service", () => safetyCommunicationMock);

import { CompetenceAlertService } from "@/lib/services/competence-alert-service";

const n3User = { id: "user-n3", name: "N3 User", email: "n3@example.com", language: "pt" };
const n2User = { id: "user-n2", name: "N2 User", email: "n2@example.com", language: "pt" };

function authorizationFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "auth-1",
    plantId: "plant-1",
    competenceWorkerId: "worker-1",
    competenceTypeId: "type-1",
    status: AuthorizationStatus.SUSPENDED,
    suspensionReason: "Unsafe handling reported",
    revocationReason: null,
    competenceWorker: {
      areaId: null,
      employeeDirectoryId: "employee-1",
      employee: { name: "Ana Silva" },
    },
    competenceType: { name: "Forklift" },
    ...overrides,
  };
}

describe("CompetenceAlertService — idempotency via cycleKey (§7.3)", () => {
  beforeEach(() => {
    txMock.notification.create.mockResolvedValue({ id: "notification-1" });
    txMock.competenceAlertDelivery.create.mockResolvedValue({});
    prismaMock.competenceAlertDelivery.create.mockResolvedValue({});
    emailMock.sendNotificationEmail.mockResolvedValue({});
    prismaMock.plant.findUnique.mockResolvedValue({ id: "plant-1", code: "maap", name: "MAAP" });
    prismaMock.userPlantRole.findMany.mockImplementation(async ({ where }: { where: { role: { code: string } } }) => {
      if (where.role.code === "N3_SAFETY") return [{ user: n3User }];
      if (where.role.code === "N2_PLANT_MANAGER") return [{ user: n2User }];
      return [];
    });
    prismaMock.user.findFirst.mockResolvedValue(null);
    safetyCommunicationMock.resolveDepartmentAlertRecipients.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cycleKey = authorizationId: a suspension dispatched twice for the same authorization sends once, not twice", async () => {
    prismaMock.workerAuthorization.findUnique.mockResolvedValue(authorizationFixture());

    await expect(CompetenceAlertService.dispatchAuthorizationSuspended("auth-1")).resolves.toBe(2); // SOFTWARE + EMAIL

    expect(txMock.competenceAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          competenceWorkerId: "worker-1",
          competenceTypeId: "type-1",
          userId: "user-n3",
          alertType: CompetenceAlertType.AUTHORIZATION_SUSPENDED,
          channel: ActionAlertChannel.SOFTWARE,
          cycleKey: "auth-1",
        }),
      }),
    );

    // Simulate the real unique-index rejection a second dispatch attempt would hit in production.
    txMock.competenceAlertDelivery.create.mockRejectedValue(uniqueError());
    prismaMock.competenceAlertDelivery.create.mockRejectedValue(uniqueError());

    await expect(CompetenceAlertService.dispatchAuthorizationSuspended("auth-1")).resolves.toBe(0);
    expect(emailMock.sendNotificationEmail).toHaveBeenCalledTimes(1);
  });

  it("cycleKey = authorizationId: a renewal (new authorization id) can alert again even in the same cycle", async () => {
    prismaMock.workerAuthorization.findUnique.mockResolvedValue(authorizationFixture());
    await expect(CompetenceAlertService.dispatchAuthorizationSuspended("auth-1")).resolves.toBe(2);

    // The first authorization's cycle is now "used up" for this (worker, type, user, alertType).
    txMock.competenceAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === "auth-1") throw uniqueError();
      return {};
    });
    prismaMock.competenceAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === "auth-1") throw uniqueError();
      return {};
    });

    // Renewal creates a brand new WorkerAuthorization row (§2.5) — a new id, so a new cycleKey.
    prismaMock.workerAuthorization.findUnique.mockResolvedValue(authorizationFixture({ id: "auth-2" }));
    await expect(CompetenceAlertService.dispatchAuthorizationSuspended("auth-2")).resolves.toBe(2);
  });

  it("dispatchAuthorizationRevoked notifies N3_SAFETY and N2_PLANT_MANAGER but not the worker's own account", async () => {
    prismaMock.workerAuthorization.findUnique.mockResolvedValue(
      authorizationFixture({ status: AuthorizationStatus.REVOKED, revocationReason: "Serious incident", suspensionReason: null }),
    );

    const sent = await CompetenceAlertService.dispatchAuthorizationRevoked("auth-1");

    expect(sent).toBe(4); // (N3 + N2) x (SOFTWARE + EMAIL)
    const recipientIds = txMock.competenceAlertDelivery.create.mock.calls.map((call) => call[0].data.userId);
    expect(new Set(recipientIds)).toEqual(new Set(["user-n3", "user-n2"]));
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it("cycleKey = 'YYYY-MM' for ROLE_WITHOUT_COMPETENCE: repeated dispatch in the same month sends once, a later month sends again", async () => {
    prismaMock.competenceWorker.findUnique.mockResolvedValue({
      id: "worker-1",
      areaId: null,
      employee: { name: "Ana Silva" },
    });
    prismaMock.competenceType.findUnique.mockResolvedValue({ id: "type-1", name: "Forklift" });

    const gaps = [{ competenceWorkerId: "worker-1", competenceTypeId: "type-1" }];

    await expect(
      CompetenceAlertService.dispatchRoleWithoutCompetence("plant-1", gaps, new Date("2026-08-05T00:00:00.000Z")),
    ).resolves.toBe(2);

    expect(txMock.competenceAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cycleKey: "2026-08", alertType: CompetenceAlertType.ROLE_WITHOUT_COMPETENCE }) }),
    );

    txMock.competenceAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === "2026-08") throw uniqueError();
      return {};
    });
    prismaMock.competenceAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === "2026-08") throw uniqueError();
      return {};
    });

    // Same month, edited again the same day or a later day within August — no resend.
    await expect(
      CompetenceAlertService.dispatchRoleWithoutCompetence("plant-1", gaps, new Date("2026-08-20T00:00:00.000Z")),
    ).resolves.toBe(0);

    // A new month is a new cycleKey — the reminder is allowed to fire again.
    await expect(
      CompetenceAlertService.dispatchRoleWithoutCompetence("plant-1", gaps, new Date("2026-09-02T00:00:00.000Z")),
    ).resolves.toBe(2);
  });

  it("MISSING_DOCUMENT and AWAITING_ASSESSMENT alerts also use the monthly cycleKey, never authorizationId", async () => {
    prismaMock.competenceWorker.findUnique.mockResolvedValue({
      id: "worker-1",
      areaId: "area-1",
      employee: { name: "Ana Silva" },
    });
    prismaMock.competenceType.findUnique.mockResolvedValue({ id: "type-1", name: "Forklift" });
    prismaMock.workerAuthorization.findMany.mockResolvedValue([
      { id: "auth-9", competenceWorkerId: "worker-1", competenceTypeId: "type-1" },
    ]);

    await CompetenceAlertService.dispatchMissingDocuments("plant-1", new Date("2026-08-05T00:00:00.000Z"));
    expect(txMock.competenceAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ alertType: CompetenceAlertType.MISSING_DOCUMENT, cycleKey: "2026-08", authorizationId: "auth-9" }),
      }),
    );

    txMock.competenceAlertDelivery.create.mockClear();
    safetyCommunicationMock.resolveDepartmentAlertRecipients.mockResolvedValue([{ user: n3User }]);
    await CompetenceAlertService.dispatchAwaitingAssessment("plant-1", "worker-1", "type-1", new Date("2026-08-05T00:00:00.000Z"));
    expect(txMock.competenceAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ alertType: CompetenceAlertType.AWAITING_ASSESSMENT, cycleKey: "2026-08", authorizationId: null }),
      }),
    );
  });

  it("weekly gate: AWAITING_ASSESSMENT is only dispatched by the daily job on the designated weekday", async () => {
    prismaMock.competenceWorker.findUnique.mockResolvedValue({
      id: "worker-1",
      areaId: "area-1",
      employee: { name: "Ana Silva" },
    });
    prismaMock.competenceType.findUnique.mockResolvedValue({ id: "type-1", name: "Forklift" });
    prismaMock.workerAuthorization.findMany.mockResolvedValue([]);
    safetyCommunicationMock.resolveDepartmentAlertRecipients.mockResolvedValue([{ user: n3User }]);

    const computedStates = [
      {
        competenceWorkerId: "worker-1",
        competenceTypeId: "type-1",
        computed: {
          state: CompetenceCellState.AWAITING_ASSESSMENT,
          isRequired: true,
          requirementSource: "ALL_WORKERS",
          validUntil: null,
          daysToExpiry: null,
          currentAuthorizationId: null,
          blockedReason: null,
        },
      },
    ];

    // 2026-08-24 is a Monday in Europe/Lisbon — the designated weekly day.
    const monday = new Date("2026-08-24T06:00:00.000Z");
    await CompetenceAlertService.runDailyAlerts("plant-1", computedStates, monday);
    expect(txMock.competenceAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ alertType: CompetenceAlertType.AWAITING_ASSESSMENT }) }),
    );

    txMock.competenceAlertDelivery.create.mockClear();
    // 2026-08-25 is a Tuesday — not the designated day, so no AWAITING_ASSESSMENT alert this run.
    const tuesday = new Date("2026-08-25T06:00:00.000Z");
    await CompetenceAlertService.runDailyAlerts("plant-1", computedStates, tuesday);
    expect(txMock.competenceAlertDelivery.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ alertType: CompetenceAlertType.AWAITING_ASSESSMENT }) }),
    );
  });

  it("expiry bands from the daily job are exclusive: only one alertType fires for a given daysToExpiry", async () => {
    prismaMock.competenceWorker.findUnique.mockResolvedValue({
      id: "worker-1",
      areaId: null,
      employee: { name: "Ana Silva" },
    });
    prismaMock.competenceType.findUnique.mockResolvedValue({ id: "type-1", name: "Forklift" });
    prismaMock.workerAuthorization.findMany.mockResolvedValue([]);
    safetyCommunicationMock.resolveDepartmentAlertRecipients.mockResolvedValue([]);

    const computedStates = [
      {
        competenceWorkerId: "worker-1",
        competenceTypeId: "type-1",
        computed: {
          state: CompetenceCellState.EXPIRING,
          isRequired: true,
          requirementSource: "ALL_WORKERS",
          validUntil: new Date("2026-09-23T00:00:00.000Z"),
          daysToExpiry: 30,
          currentAuthorizationId: "auth-30",
          blockedReason: null,
        },
      },
    ];

    await CompetenceAlertService.runDailyAlerts("plant-1", computedStates, new Date("2026-08-24T06:00:00.000Z"));

    const softwareAlertTypes = txMock.competenceAlertDelivery.create.mock.calls.map((call) => call[0].data.alertType);
    const emailAlertTypes = prismaMock.competenceAlertDelivery.create.mock.calls.map((call) => call[0].data.alertType);
    expect(softwareAlertTypes).toEqual([CompetenceAlertType.EXPIRING_30]);
    expect(emailAlertTypes).toEqual([CompetenceAlertType.EXPIRING_30]);
    expect([...softwareAlertTypes, ...emailAlertTypes]).not.toContain(CompetenceAlertType.EXPIRING_60);
    expect([...softwareAlertTypes, ...emailAlertTypes]).not.toContain(CompetenceAlertType.EXPIRING_90);
  });
});
