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

    const response = await POST(
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
    );

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
      select: { id: true },
    });
    expect(actionServiceMock.ActionService.create).not.toHaveBeenCalled();
  });

  it("allows linking a new action only to approved communications", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N4_SUPERVISOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.communication.findFirst.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    actionServiceMock.ActionService.create.mockResolvedValue({
      id: "action-1",
      communicationId: "11111111-1111-4111-8111-111111111111",
    });

    const response = await POST(
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
    );

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
});
