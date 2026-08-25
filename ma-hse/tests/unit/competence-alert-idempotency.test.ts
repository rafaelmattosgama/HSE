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
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  competenceType: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  competenceAlertDelivery: {
    create: vi.fn(),
    findMany: vi.fn(),
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
    suspendedAt: new Date("2026-08-01T09:00:00.000Z"),
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

// item 16: dispatchExpiryAlert/dispatchAwaitingAssessmentSummary/dispatchMissingDocuments
// now take the shared per-plant context directly, instead of resolving their own
// worker/type/recipients — build it by hand here rather than mocking the whole
// loadDailyAlertContext query chain for tests that are really about one function.
function buildDailyAlertContext(overrides: {
  plant?: { id: string; code: string; name: string };
  workers?: Array<{ id: string; areaId: string | null; name: string }>;
  competenceTypes?: Array<{ id: string; name: string }>;
  n3Recipients?: Array<{ id: string; name: string; email: string; language: string }>;
  n2Recipients?: Array<{ id: string; name: string; email: string; language: string }>;
  recipientsByAreaId?: Record<string, Array<{ id: string; name: string; email: string; language: string }>>;
  undocumentedAuthorizations?: Array<{ id: string; competenceWorkerId: string; competenceTypeId: string }>;
  deliveredKeys?: string[];
} = {}) {
  return {
    plant: overrides.plant ?? { id: "plant-1", code: "maap", name: "MAAP" },
    competenceTypesById: new Map((overrides.competenceTypes ?? []).map((type) => [type.id, type])),
    workersById: new Map(
      (overrides.workers ?? []).map((worker) => [worker.id, { id: worker.id, areaId: worker.areaId, employee: { name: worker.name } }]),
    ),
    n3Recipients: overrides.n3Recipients ?? [],
    n2Recipients: overrides.n2Recipients ?? [],
    recipientsByAreaId: new Map(Object.entries(overrides.recipientsByAreaId ?? {})),
    undocumentedAuthorizations: overrides.undocumentedAuthorizations ?? [],
    deliveredKeys: new Set(overrides.deliveredKeys ?? []),
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
    // item 16: loadDailyAlertContext's batched reads, defaulted to "nothing
    // extra" so tests that don't care about them (e.g. dispatchAuthorizationSuspended,
    // dispatchRoleWithoutCompetence — unaffected by the item-16 refactor) are unaffected.
    prismaMock.competenceType.findMany.mockResolvedValue([]);
    prismaMock.competenceWorker.findMany.mockResolvedValue([]);
    prismaMock.competenceAlertDelivery.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("cycleKey = authorizationId + suspendedAt: a suspension dispatched twice for the same suspension sends once, not twice", async () => {
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
          cycleKey: "auth-1:2026-08-01T09:00:00.000Z",
          // (menor) phase 4 rule #1: the SOFTWARE delivery row must carry the
          // notification it backs, or listUnreadUrgentAlerts (which joins
          // through notificationId) can never resolve it back to a Notification.
          notificationId: "notification-1",
        }),
      }),
    );

    // Simulate the real unique-index rejection a second dispatch attempt would hit in production.
    txMock.competenceAlertDelivery.create.mockRejectedValue(uniqueError());
    prismaMock.competenceAlertDelivery.create.mockRejectedValue(uniqueError());

    await expect(CompetenceAlertService.dispatchAuthorizationSuspended("auth-1")).resolves.toBe(0);
    expect(emailMock.sendNotificationEmail).toHaveBeenCalledTimes(1);
  });

  it("cycleKey = authorizationId + suspendedAt: a renewal (new authorization id) can alert again even in the same cycle", async () => {
    prismaMock.workerAuthorization.findUnique.mockResolvedValue(authorizationFixture());
    await expect(CompetenceAlertService.dispatchAuthorizationSuspended("auth-1")).resolves.toBe(2);

    // The first authorization's cycle is now "used up" for this (worker, type, user, alertType).
    const usedCycleKey = "auth-1:2026-08-01T09:00:00.000Z";
    txMock.competenceAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === usedCycleKey) throw uniqueError();
      return {};
    });
    prismaMock.competenceAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === usedCycleKey) throw uniqueError();
      return {};
    });

    // Renewal creates a brand new WorkerAuthorization row (§2.5) — a new id, so a new cycleKey.
    prismaMock.workerAuthorization.findUnique.mockResolvedValue(
      authorizationFixture({ id: "auth-2", suspendedAt: new Date("2026-08-05T09:00:00.000Z") }),
    );
    await expect(CompetenceAlertService.dispatchAuthorizationSuspended("auth-2")).resolves.toBe(2);
  });

  it("crit 3: suspend, reactivate, suspend again — both suspensions alert, since suspendedAt (not just authorization.id) is part of the cycleKey", async () => {
    // Guards against a regression back to the old bare-authorizationId cycleKey: reactivateAuthorization
    // flips SUSPENDED -> ACTIVE on the SAME row (no new id), so if the second suspension reused the
    // first one's key, this mock would reject it exactly like the real unique index would.
    const firstCycleKey = "auth-1:2026-08-01T09:00:00.000Z";
    txMock.competenceAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === "auth-1" || data.cycleKey === firstCycleKey) throw uniqueError();
      return {};
    });
    prismaMock.competenceAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === "auth-1" || data.cycleKey === firstCycleKey) throw uniqueError();
      return {};
    });

    // First suspension already "used up" firstCycleKey (as if dispatched earlier). Reactivate,
    // then suspend again on the same authorization.id: suspendAuthorization() rewrites suspendedAt
    // on every call, so this second suspension still alerts instead of colliding with the first.
    prismaMock.workerAuthorization.findUnique.mockResolvedValue(
      authorizationFixture({ suspendedAt: new Date("2026-08-10T14:00:00.000Z") }),
    );
    await expect(CompetenceAlertService.dispatchAuthorizationSuspended("auth-1")).resolves.toBe(2);
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
    // loadWorkerTypeContext resolves via findFirst({ id, plantId }), not a bare findUnique(id) —
    // a cross-plant id must not resolve (minor fix).
    prismaMock.competenceWorker.findFirst.mockResolvedValue({
      id: "worker-1",
      areaId: null,
      employee: { name: "Ana Silva" },
    });
    prismaMock.competenceType.findFirst.mockResolvedValue({ id: "type-1", name: "Forklift" });

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

  it("(minor fix) MISSING_DOCUMENT folds authorizationId into the cycleKey, so a same-month renewal still alerts", async () => {
    const context = buildDailyAlertContext({
      workers: [{ id: "worker-1", areaId: "area-1", name: "Ana Silva" }],
      competenceTypes: [{ id: "type-1", name: "Forklift" }],
      n3Recipients: [n3User],
      undocumentedAuthorizations: [{ id: "auth-9", competenceWorkerId: "worker-1", competenceTypeId: "type-1" }],
    });

    await CompetenceAlertService.dispatchMissingDocuments("plant-1", new Date("2026-08-05T00:00:00.000Z"), context);
    expect(txMock.competenceAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ alertType: CompetenceAlertType.MISSING_DOCUMENT, cycleKey: "auth-9:2026-08", authorizationId: "auth-9" }),
      }),
    );
  });

  it("(minor fix) monthlyCycleKey crosses the month boundary in Europe/Lisbon, not in UTC", async () => {
    const context = buildDailyAlertContext({
      workers: [{ id: "worker-1", areaId: "area-1", name: "Ana Silva" }],
      competenceTypes: [{ id: "type-1", name: "Forklift" }],
      n3Recipients: [n3User],
      undocumentedAuthorizations: [{ id: "auth-9", competenceWorkerId: "worker-1", competenceTypeId: "type-1" }],
    });

    // 2026-08-31T23:30:00Z is already 2026-09-01T00:30 in Europe/Lisbon (WEST, UTC+1 in August) —
    // a UTC-only cycleKey would still say "2026-08" here.
    await CompetenceAlertService.dispatchMissingDocuments("plant-1", new Date("2026-08-31T23:30:00.000Z"), context);

    expect(txMock.competenceAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cycleKey: "auth-9:2026-09" }),
      }),
    );
  });

  it("(item 14) AWAITING_ASSESSMENT is a weekly (not monthly) summary: one notification/email per recipient for all their pending pairs", async () => {
    const context = buildDailyAlertContext({
      workers: [
        { id: "worker-1", areaId: "area-1", name: "Ana Silva" },
        { id: "worker-2", areaId: "area-1", name: "Bruno Costa" },
      ],
      competenceTypes: [
        { id: "type-1", name: "Forklift" },
        { id: "type-2", name: "Crane" },
      ],
      recipientsByAreaId: { "area-1": [n3User] },
    });
    const rows = [
      { competenceWorkerId: "worker-1", competenceTypeId: "type-1" },
      { competenceWorkerId: "worker-2", competenceTypeId: "type-2" },
    ];

    const sent = await CompetenceAlertService.dispatchAwaitingAssessmentSummary(
      "plant-1",
      rows,
      context,
      new Date("2026-08-24T06:00:00.000Z"), // Monday, ISO week 2026-W35
    );

    expect(sent).toBe(2); // one recipient x (SOFTWARE + EMAIL), not one pair each
    expect(txMock.competenceAlertDelivery.create).toHaveBeenCalledTimes(1);
    expect(txMock.competenceAlertDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ alertType: CompetenceAlertType.AWAITING_ASSESSMENT, cycleKey: "2026-W35", userId: "user-n3" }),
      }),
    );
    expect(emailMock.sendNotificationEmail).toHaveBeenCalledTimes(1);
    const emailBody = emailMock.sendNotificationEmail.mock.calls[0][0].mensagem as string;
    expect(emailBody).toContain("Ana Silva");
    expect(emailBody).toContain("Bruno Costa");

    // A different week is a different cycleKey — the summary is allowed to repeat.
    txMock.competenceAlertDelivery.create.mockClear();
    txMock.competenceAlertDelivery.create.mockImplementation(async ({ data }: { data: { cycleKey: string } }) => {
      if (data.cycleKey === "2026-W35") throw uniqueError();
      return {};
    });
    const nextMonday = new Date("2026-08-31T06:00:00.000Z"); // ISO week 2026-W36
    const sentNextWeek = await CompetenceAlertService.dispatchAwaitingAssessmentSummary("plant-1", rows, context, nextMonday);
    expect(sentNextWeek).toBe(2);
  });

  it("(item 16) skips a combination already present in the pre-loaded deliveredKeys, without attempting the write", async () => {
    const context = buildDailyAlertContext({
      workers: [{ id: "worker-1", areaId: null, name: "Ana Silva" }],
      competenceTypes: [{ id: "type-1", name: "Forklift" }],
      n3Recipients: [n3User],
      deliveredKeys: [
        ["worker-1", "type-1", n3User.id, CompetenceAlertType.EXPIRING_30, ActionAlertChannel.SOFTWARE, "auth-1"].join("|"),
      ],
    });

    const sent = await CompetenceAlertService.dispatchExpiryAlert({
      context,
      competenceWorkerId: "worker-1",
      competenceTypeId: "type-1",
      authorizationId: "auth-1",
      alertType: CompetenceAlertType.EXPIRING_30,
      daysToExpiry: 30,
      validUntil: new Date("2026-09-23T00:00:00.000Z"),
    });

    expect(sent).toBe(1); // EMAIL still sent; SOFTWARE was skipped as already delivered
    expect(txMock.competenceAlertDelivery.create).not.toHaveBeenCalled();
    expect(prismaMock.competenceAlertDelivery.create).toHaveBeenCalledTimes(1);
  });

  it("(minor fix) the in-app Notification carries actionUrl, not just the email", async () => {
    const context = buildDailyAlertContext({
      workers: [{ id: "worker-1", areaId: null, name: "Ana Silva" }],
      competenceTypes: [{ id: "type-1", name: "Forklift" }],
      n3Recipients: [n3User],
    });

    await CompetenceAlertService.dispatchExpiryAlert({
      context,
      competenceWorkerId: "worker-1",
      competenceTypeId: "type-1",
      authorizationId: "auth-1",
      alertType: CompetenceAlertType.EXPIRING_30,
      daysToExpiry: 30,
      validUntil: new Date("2026-09-23T00:00:00.000Z"),
    });

    // RepeatabilityAlertModal has nowhere else to get a link from for this channel —
    // previously actionUrl only ever reached sendNotificationEmail.
    expect(txMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actionUrl: "/app/maap/competences/worker-1" }),
      }),
    );
  });

  it("weekly gate: AWAITING_ASSESSMENT is only dispatched by the daily job on the designated weekday", async () => {
    prismaMock.competenceWorker.findMany.mockResolvedValue([
      { id: "worker-1", areaId: "area-1", employee: { name: "Ana Silva" } },
    ]);
    prismaMock.competenceType.findMany.mockResolvedValue([{ id: "type-1", name: "Forklift" }]);
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
    prismaMock.competenceWorker.findMany.mockResolvedValue([
      { id: "worker-1", areaId: null, employee: { name: "Ana Silva" } },
    ]);
    prismaMock.competenceType.findMany.mockResolvedValue([{ id: "type-1", name: "Forklift" }]);
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

  it("(minor fix) listUnreadUrgentAlerts filters by the notification's own channel, not just the delivery row's", async () => {
    prismaMock.competenceAlertDelivery.findMany.mockResolvedValue([]);

    await CompetenceAlertService.listUnreadUrgentAlerts({ plantId: "plant-1", plantCode: "maap", userId: "user-1" });

    expect(prismaMock.competenceAlertDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          notification: { channel: "COMPETENCE_URGENT", status: "UNREAD" },
        }),
      }),
    );
  });
});
