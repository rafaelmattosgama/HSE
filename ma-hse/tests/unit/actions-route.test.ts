import { ActionCategory, ActionPriority, ActionSourceType, CommunicationStatus, RoleCode } from "@prisma/client";
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
            CommunicationStatus.SUBMITTED,
            CommunicationStatus.PENDING_VALIDATION,
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
    expect(actionServiceMock.ActionService.create).toHaveBeenCalledWith({
      plantId: "plant-1",
      actorUserId: "user-1",
      payload: expect.objectContaining({
        sourceType: ActionSourceType.COMMUNICATION,
        communicationId: "11111111-1111-4111-8111-111111111111",
      }),
    });
  });

  it("allows validation roles to create actions while the communication is pending validation", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.communication.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: CommunicationStatus.PENDING_VALIDATION,
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
          description: "Criada durante a validacao.",
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
        sourceType: ActionSourceType.COMMUNICATION,
        communicationId: "11111111-1111-4111-8111-111111111111",
      }),
    });
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
    prismaMock.prisma.communication.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      status: CommunicationStatus.PENDING_VALIDATION,
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
});
