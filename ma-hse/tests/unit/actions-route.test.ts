import { ActionCategory, ActionManualOrigin, ActionPriority, ActionSourceType, CommunicationStatus, RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    communication: {
      findFirst: vi.fn(),
    },
    sEWO: {
      findFirst: vi.fn(),
    },
    smatAudit: {
      findFirst: vi.fn(),
    },
    userPlantRole: {
      findFirst: vi.fn(),
    },
    action: {
      findMany: vi.fn(),
    },
  },
}));

const actionServiceMock = vi.hoisted(() => ({
  ActionService: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/services/action-service", () => actionServiceMock);

import { POST } from "@/app/api/plants/[plantCode]/actions/route";

function routeContext(plantCode = "maap") {
  return {
    params: Promise.resolve({ plantCode }),
  };
}

describe("actions route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects linking a new action to a communication outside the approved lifecycle", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N4_SUPERVISOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.communication.findFirst.mockResolvedValue(null);

    const response = (await POST(
      new Request("http://localhost/api/plants/maap/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: ActionSourceType.COMMUNICATION,
          communicationId: "11111111-1111-4111-8111-111111111111",
          category: ActionCategory.CORRECTIVE,
          priority: ActionPriority.MEDIUM,
          title: "Nova acao",
          description: "Criada a partir do modulo de acoes.",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      errorCode: "INVALID_COMMUNICATION",
    });
    expect(prismaMock.prisma.communication.findFirst).toHaveBeenCalledWith({
      where: {
        id: "11111111-1111-4111-8111-111111111111",
        plantId: "plant-1",
        status: {
          in: [
            CommunicationStatus.VALID_OPEN,
            CommunicationStatus.ONGOING,
            CommunicationStatus.CLOSED,
          ],
        },
      },
      select: { id: true, status: true },
    });
    expect(actionServiceMock.ActionService.create).not.toHaveBeenCalled();
  });

  it("allows linking a new action to active communications", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N4_SUPERVISOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.communication.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: CommunicationStatus.VALID_OPEN,
    });
    prismaMock.prisma.userPlantRole.findFirst.mockResolvedValue({
      userId: "22222222-2222-4222-8222-222222222222",
    });
    actionServiceMock.ActionService.create.mockResolvedValue({
      id: "action-1",
      communicationId: "11111111-1111-4111-8111-111111111111",
      idempotency: {
        reusedExistingAction: false,
      },
    });

    const response = (await POST(
      new Request("http://localhost/api/plants/maap/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: ActionSourceType.COMMUNICATION,
          communicationId: "11111111-1111-4111-8111-111111111111",
          category: ActionCategory.CORRECTIVE,
          priority: ActionPriority.MEDIUM,
          title: "Nova acao",
          description: "Criada a partir do modulo de acoes.",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(201);
    expect(prismaMock.prisma.userPlantRole.findFirst).toHaveBeenCalledWith({
      where: {
        plantId: "plant-1",
        userId: "22222222-2222-4222-8222-222222222222",
        user: {
          isActive: true,
        },
      },
      select: {
        userId: true,
      },
    });
    expect(actionServiceMock.ActionService.create).toHaveBeenCalledWith({
      plantId: "plant-1",
      actorUserId: "user-1",
      payload: expect.objectContaining({
        sourceType: ActionSourceType.COMMUNICATION,
        communicationId: "11111111-1111-4111-8111-111111111111",
      }),
    });
  });

  it("rejects pending validation communications even for validation roles", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.communication.findFirst.mockResolvedValue(null);

    const response = (await POST(
      new Request("http://localhost/api/plants/maap/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: ActionSourceType.COMMUNICATION,
          communicationId: "11111111-1111-4111-8111-111111111111",
          category: ActionCategory.CORRECTIVE,
          priority: ActionPriority.MEDIUM,
          title: "Nova acao",
          description: "Criada durante a validacao.",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      errorCode: "INVALID_COMMUNICATION",
    });
    expect(actionServiceMock.ActionService.create).not.toHaveBeenCalled();
  });

  it("rejects pending validation communications for non-validation roles", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N4_SUPERVISOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.communication.findFirst.mockResolvedValue(null);

    const response = (await POST(
      new Request("http://localhost/api/plants/maap/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: ActionSourceType.COMMUNICATION,
          communicationId: "11111111-1111-4111-8111-111111111111",
          category: ActionCategory.CORRECTIVE,
          priority: ActionPriority.MEDIUM,
          title: "Nova acao",
          description: "Tentativa fora da validacao.",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      errorCode: "INVALID_COMMUNICATION",
    });
    expect(actionServiceMock.ActionService.create).not.toHaveBeenCalled();
  });

  it("returns ok without creating a duplicate when the action service reuses an existing communication action", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N4_SUPERVISOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.communication.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: CommunicationStatus.VALID_OPEN,
    });
    prismaMock.prisma.userPlantRole.findFirst.mockResolvedValue({
      userId: "22222222-2222-4222-8222-222222222222",
    });
    actionServiceMock.ActionService.create.mockResolvedValue({
      id: "action-existing",
      communicationId: "11111111-1111-4111-8111-111111111111",
      idempotency: {
        reusedExistingAction: true,
      },
    });

    const response = (await POST(
      new Request("http://localhost/api/plants/maap/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: ActionSourceType.COMMUNICATION,
          communicationId: "11111111-1111-4111-8111-111111111111",
          category: ActionCategory.CORRECTIVE,
          priority: ActionPriority.MEDIUM,
          title: "Nova acao",
          description: "Criada a partir do modulo de acoes.",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        id: "action-existing",
        idempotency: {
          reusedExistingAction: true,
        },
      },
    });
  });

  it("allows creating a manual action when origin is provided", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N4_SUPERVISOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.userPlantRole.findFirst.mockResolvedValue({
      userId: "22222222-2222-4222-8222-222222222222",
    });
    actionServiceMock.ActionService.create.mockResolvedValue({
      id: "action-manual",
      idempotency: {
        reusedExistingAction: false,
      },
    });

    const response = (await POST(
      new Request("http://localhost/api/plants/maap/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: ActionSourceType.MANUAL,
          manualOrigin: ActionManualOrigin.AUDITS,
          category: ActionCategory.CORRECTIVE,
          priority: ActionPriority.MEDIUM,
          title: "Nova acao",
          description: "Criada manualmente.",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(201);
    expect(actionServiceMock.ActionService.create).toHaveBeenCalledWith({
      plantId: "plant-1",
      actorUserId: "user-1",
      payload: expect.objectContaining({
        sourceType: ActionSourceType.MANUAL,
        manualOrigin: ActionManualOrigin.AUDITS,
      }),
    });
  });

  it("rejects manual actions without origin", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N4_SUPERVISOR,
    });

    const response = (await POST(
      new Request("http://localhost/api/plants/maap/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: ActionSourceType.MANUAL,
          category: ActionCategory.CORRECTIVE,
          priority: ActionPriority.MEDIUM,
          title: "Nova acao",
          description: "Criada manualmente.",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(422);
    expect(actionServiceMock.ActionService.create).not.toHaveBeenCalled();
  });

  it("allows linking a new action to S-EWO records in the same plant", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N4_SUPERVISOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
    });
    prismaMock.prisma.userPlantRole.findFirst.mockResolvedValue({
      userId: "22222222-2222-4222-8222-222222222222",
    });
    actionServiceMock.ActionService.create.mockResolvedValue({
      id: "action-sewo",
      sewoId: "33333333-3333-4333-8333-333333333333",
      idempotency: {
        reusedExistingAction: false,
      },
    });

    const response = (await POST(
      new Request("http://localhost/api/plants/maap/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: ActionSourceType.SEWO,
          sewoId: "33333333-3333-4333-8333-333333333333",
          category: ActionCategory.CORRECTIVE,
          priority: ActionPriority.MEDIUM,
          title: "Nova acao",
          description: "Criada a partir de S-EWO.",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(201);
    expect(prismaMock.prisma.sEWO.findFirst).toHaveBeenCalledWith({
      where: {
        id: "33333333-3333-4333-8333-333333333333",
        plantId: "plant-1",
      },
      select: { id: true },
    });
    expect(actionServiceMock.ActionService.create).toHaveBeenCalledWith({
      plantId: "plant-1",
      actorUserId: "user-1",
      payload: expect.objectContaining({
        sourceType: ActionSourceType.SEWO,
        sewoId: "33333333-3333-4333-8333-333333333333",
      }),
    });
  });

  it("allows linking a new action to SMAT records in the same plant", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N4_SUPERVISOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.smatAudit.findFirst.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
    });
    prismaMock.prisma.userPlantRole.findFirst.mockResolvedValue({
      userId: "22222222-2222-4222-8222-222222222222",
    });
    actionServiceMock.ActionService.create.mockResolvedValue({
      id: "action-smat",
      idempotency: {
        reusedExistingAction: false,
      },
    });

    const response = (await POST(
      new Request("http://localhost/api/plants/maap/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: ActionSourceType.SMAT,
          smatAuditId: "44444444-4444-4444-8444-444444444444",
          category: ActionCategory.CORRECTIVE,
          priority: ActionPriority.MEDIUM,
          title: "Nova acao",
          description: "Criada a partir de SMAT.",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(201);
    expect(prismaMock.prisma.smatAudit.findFirst).toHaveBeenCalledWith({
      where: {
        id: "44444444-4444-4444-8444-444444444444",
        plantId: "plant-1",
      },
      select: { id: true },
    });
    expect(actionServiceMock.ActionService.create).toHaveBeenCalledWith({
      plantId: "plant-1",
      actorUserId: "user-1",
      payload: expect.objectContaining({
        sourceType: ActionSourceType.SMAT,
        smatAuditId: "44444444-4444-4444-8444-444444444444",
      }),
    });
  });

  it("rejects action owners that are not active users for the plant", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N4_SUPERVISOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.communication.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: CommunicationStatus.VALID_OPEN,
    });
    prismaMock.prisma.userPlantRole.findFirst.mockResolvedValue(null);

    const response = (await POST(
      new Request("http://localhost/api/plants/maap/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceType: ActionSourceType.COMMUNICATION,
          communicationId: "11111111-1111-4111-8111-111111111111",
          category: ActionCategory.CORRECTIVE,
          priority: ActionPriority.MEDIUM,
          title: "Nova acao",
          description: "Criada a partir do modulo de acoes.",
          ownerUserId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      errorCode: "INVALID_ACTION_OWNER",
    });
    expect(actionServiceMock.ActionService.create).not.toHaveBeenCalled();
  });
});
