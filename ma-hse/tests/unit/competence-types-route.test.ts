import { CompetenceCategory, RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    competenceType: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => prismaMock);

import { DELETE, GET, POST } from "@/app/api/plants/[plantCode]/admin/competence-types/route";

function routeContext() {
  return { params: Promise.resolve({ plantCode: "maap" }) };
}

describe("admin competence-types route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-N0_ADMIN roles on every verb", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }),
    });

    const getResponse = (await GET(new Request("http://localhost/api/competence-types"), routeContext())) as Response;
    expect(getResponse.status).toBe(403);

    const postResponse = (await POST(
      new Request("http://localhost/api/competence-types", { method: "POST", body: "{}" }),
      routeContext(),
    )) as Response;
    expect(postResponse.status).toBe(403);

    const deleteResponse = (await DELETE(
      new Request("http://localhost/api/competence-types", { method: "DELETE", body: "{}" }),
      routeContext(),
    )) as Response;
    expect(deleteResponse.status).toBe(403);
  });

  it("GET lists active competence types ordered by displayOrder", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N0_ADMIN });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([{ id: "type-1", code: "FORKLIFT" }]);

    const response = (await GET(new Request("http://localhost/api/competence-types"), routeContext())) as Response;
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.types).toEqual([{ id: "type-1", code: "FORKLIFT" }]);
    expect(prismaMock.prisma.competenceType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { plantId: "plant-1", isActive: true } }),
    );
  });

  it("POST creates a new competence type with the 12-month / mandatory-assessment defaults", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N0_ADMIN });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.competenceType.upsert.mockResolvedValue({ id: "type-1" });

    const request = new Request("http://localhost/api/competence-types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "FORKLIFT",
        name: "Empilhador",
        category: CompetenceCategory.EQUIPMENT_OPERATION,
        requiresTraining: true,
        requiresAssessment: true,
        requiresAuthorization: true,
        validityMonths: 12,
        displayOrder: 0,
      }),
    });

    const response = (await POST(request, routeContext())) as Response;

    expect(response.status).toBe(201);
    expect(prismaMock.prisma.competenceType.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { plantId_code: { plantId: "plant-1", code: "FORKLIFT" } },
        create: expect.objectContaining({ plantId: "plant-1", code: "FORKLIFT", validityMonths: 12, requiresAssessment: true }),
      }),
    );
  });

  it("DELETE soft-deletes by flipping isActive to false, scoped to the plant", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N0_ADMIN });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.competenceType.updateMany.mockResolvedValue({ count: 1 });

    const request = new Request("http://localhost/api/competence-types", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
    });

    const response = (await DELETE(request, routeContext())) as Response;

    expect(response.status).toBe(200);
    expect(prismaMock.prisma.competenceType.updateMany).toHaveBeenCalledWith({
      where: { id: "11111111-1111-4111-8111-111111111111", plantId: "plant-1" },
      data: { isActive: false },
    });
  });

  it("DELETE returns 404 when nothing matched the plant scope", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N0_ADMIN });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.competenceType.updateMany.mockResolvedValue({ count: 0 });

    const request = new Request("http://localhost/api/competence-types", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
    });

    const response = (await DELETE(request, routeContext())) as Response;
    expect(response.status).toBe(404);
  });
});
