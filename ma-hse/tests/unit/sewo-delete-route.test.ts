import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const httpMock = vi.hoisted(() => ({
  parseBody: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  sEWO: {
    findFirst: vi.fn(),
  },
}));

const sewoServiceMock = vi.hoisted(() => ({
  SewaService: {
    deleteSewo: vi.fn(),
  },
  SewoValidationError: class SewoValidationError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status = 400,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/http", () => httpMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/services/sewo-service", () => sewoServiceMock);

import { DELETE } from "@/app/api/plants/[plantCode]/sewo/[id]/route";

function routeContext() {
  return { params: Promise.resolve({ plantCode: "pl1", id: "11111111-1111-4111-8111-111111111111" }) };
}

function deleteAuth() {
  return {
    session: {
      user: {
        id: "safety-user",
        plantRoles: [{ role: RoleCode.N3_SAFETY, plantCode: "pl1" }],
      },
    },
  };
}

describe("S-EWO delete API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("enforces authorization before accepting a delete request", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ error: new Response(null, { status: 403 }) });

    const response = await DELETE(new Request("http://localhost/api/plants/pl1/sewo/sewo-1", { method: "DELETE" }), routeContext());

    expect(response.status).toBe(403);
    expect(httpMock.parseBody).not.toHaveBeenCalled();
    expect(sewoServiceMock.SewaService.deleteSewo).not.toHaveBeenCalled();
  });

  it("passes the record version to the service for a safe draft deletion", async () => {
    const updatedAt = new Date("2026-08-19T10:00:00.000Z");
    guardsMock.requirePlantAccess.mockResolvedValue(deleteAuth());
    httpMock.parseBody.mockResolvedValue({ data: { updatedAt } });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.sEWO.findFirst.mockResolvedValue({ id: "sewo-1" });
    sewoServiceMock.SewaService.deleteSewo.mockResolvedValue({ id: "sewo-1", deletedAt: updatedAt.toISOString() });

    const response = await DELETE(new Request("http://localhost/api/plants/pl1/sewo/sewo-1", { method: "DELETE" }), routeContext());

    expect(response.status).toBe(200);
    expect(sewoServiceMock.SewaService.deleteSewo).toHaveBeenCalledWith({
      sewoId: "11111111-1111-4111-8111-111111111111",
      actorUserId: "safety-user",
      expectedUpdatedAt: updatedAt,
    });
  });

  it("returns the service error without removing data client-side", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue(deleteAuth());
    httpMock.parseBody.mockResolvedValue({ data: { updatedAt: new Date("2026-08-19T10:00:00.000Z") } });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.sEWO.findFirst.mockResolvedValue({ id: "sewo-1" });
    sewoServiceMock.SewaService.deleteSewo.mockRejectedValue(
      new sewoServiceMock.SewoValidationError("SEWO_DELETE_CONFLICT", "This S-EWO was changed by another user.", 409),
    );

    const response = await DELETE(new Request("http://localhost/api/plants/pl1/sewo/sewo-1", { method: "DELETE" }), routeContext());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ errorCode: "SEWO_DELETE_CONFLICT" });
  });
});
