import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({ requirePlantAccess: vi.fn() }));
const plantMock = vi.hoisted(() => ({ getPlantByCode: vi.fn() }));
const prismaMock = vi.hoisted(() => ({
  prisma: {
    action: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));
const actionServiceMock = vi.hoisted(() => ({
  ActionService: {
    close: vi.fn(),
    closeMany: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/services/action-service", () => actionServiceMock);

import { POST as closeAction } from "@/app/api/plants/[plantCode]/actions/[id]/close/route";
import { POST as closeActions } from "@/app/api/plants/[plantCode]/actions/close-batch/route";

const actionId = "11111111-1111-4111-8111-111111111111";
const closeBody = { closureComment: "Closed after corrective action.", closedAt: "2026-08-28", evidence: [] };

function allowed(role: RoleCode, userId = "actor-1") {
  return { session: { user: { id: userId } }, role };
}

function request(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("action closure permissions", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY])("allows %s to close another user's action", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(role));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.action.findFirst.mockResolvedValue({ id: actionId, ownerUserId: "owner-2" });
    actionServiceMock.ActionService.close.mockResolvedValue({ id: actionId });

    const response = (await closeAction(request(closeBody), { params: Promise.resolve({ plantCode: "pl01", id: actionId }) })) as Response;

    expect(response.status).toBe(200);
    expect(actionServiceMock.ActionService.close).toHaveBeenCalledOnce();
  });

  it.each([RoleCode.N4_SUPERVISOR, RoleCode.N6_HR])("allows %s to close its own action", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(role));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.action.findFirst.mockResolvedValue({ id: actionId, ownerUserId: "actor-1" });
    actionServiceMock.ActionService.close.mockResolvedValue({ id: actionId });

    const response = (await closeAction(request(closeBody), { params: Promise.resolve({ plantCode: "pl01", id: actionId }) })) as Response;

    expect(response.status).toBe(200);
  });

  it.each([RoleCode.N4_SUPERVISOR, RoleCode.N6_HR])("rejects %s closing another user's action", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(role));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.action.findFirst.mockResolvedValue({ id: actionId, ownerUserId: "owner-2" });

    const response = (await closeAction(request(closeBody), { params: Promise.resolve({ plantCode: "pl01", id: actionId }) })) as Response;

    expect(response.status).toBe(403);
    expect(actionServiceMock.ActionService.close).not.toHaveBeenCalled();
  });

  it("rejects an N4 batch containing an action owned by another user", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(RoleCode.N4_SUPERVISOR));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.action.findMany.mockResolvedValue([
      { id: actionId, ownerUserId: "actor-1" },
      { id: "22222222-2222-4222-8222-222222222222", ownerUserId: "owner-2" },
    ]);

    const response = (await closeActions(request({
      ...closeBody,
      actionIds: [actionId, "22222222-2222-4222-8222-222222222222"],
    }), { params: Promise.resolve({ plantCode: "pl01" }) })) as Response;

    expect(response.status).toBe(403);
    expect(actionServiceMock.ActionService.closeMany).not.toHaveBeenCalled();
  });
});
