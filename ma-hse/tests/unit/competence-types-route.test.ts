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
    },
  },
}));

const competenceServiceMock = vi.hoisted(() => ({
  CompetenceService: {
    upsertCompetenceType: vi.fn(),
    deactivateCompetenceType: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/services/competence-service", () => competenceServiceMock);

import { DELETE, GET, POST } from "@/app/api/plants/[plantCode]/admin/competence-types/route";

function routeContext() {
  return { params: Promise.resolve({ plantCode: "maap" }) };
}

// §2.7: the catalog belongs to the plant's N3_SAFETY (N1_CORPORATE may
// intervene); N0_ADMIN keeps read access for support but is blocked from
// writing. requirePlantAccess bypasses N0/N1 unconditionally regardless of
// the roles array (lib/rbac/evaluator.ts), so these tests assert the exact
// array passed to it, not just the resulting status code — see M1 in
// docs/revisao-modulo-competencias.md: a status-only assertion would still
// pass if the route silently reverted to admitting N0_ADMIN by omission.
const CATALOG_ROLES = [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY];

describe("admin competence-types route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET requests plant access with [N1_CORPORATE, N3_SAFETY], not N0_ADMIN", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N3_SAFETY });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([]);

    await GET(new Request("http://localhost/api/competence-types"), routeContext());

    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("maap", CATALOG_ROLES);
  });

  it("POST and DELETE request plant access with [N1_CORPORATE, N3_SAFETY]", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }),
    });

    await POST(new Request("http://localhost/api/competence-types", { method: "POST", body: "{}" }), routeContext());
    await DELETE(new Request("http://localhost/api/competence-types", { method: "DELETE", body: "{}" }), routeContext());

    expect(guardsMock.requirePlantAccess).toHaveBeenNthCalledWith(1, "maap", CATALOG_ROLES);
    expect(guardsMock.requirePlantAccess).toHaveBeenNthCalledWith(2, "maap", CATALOG_ROLES);
  });

  it("rejects roles outside the catalog list on every verb", async () => {
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

  it("GET lets N0_ADMIN read (support access) despite the write block below", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N0_ADMIN });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([{ id: "type-1", code: "FORKLIFT", isActive: true }]);

    const response = (await GET(new Request("http://localhost/api/competence-types"), routeContext())) as Response;
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.types).toEqual([{ id: "type-1", code: "FORKLIFT", isActive: true }]);
  });

  it("GET lists both active and inactive types, ordered by displayOrder then name", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N3_SAFETY });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.competenceType.findMany.mockResolvedValue([]);

    await GET(new Request("http://localhost/api/competence-types"), routeContext());

    expect(prismaMock.prisma.competenceType.findMany).toHaveBeenCalledWith({
      where: { plantId: "plant-1" },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });
  });

  it("POST rejects N0_ADMIN with 403, even though the guard admits N0 by bypass", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N0_ADMIN });

    const request = new Request("http://localhost/api/competence-types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "FORKLIFT", name: "Empilhador", category: CompetenceCategory.EQUIPMENT_OPERATION }),
    });

    const response = (await POST(request, routeContext())) as Response;

    expect(response.status).toBe(403);
    expect(competenceServiceMock.CompetenceService.upsertCompetenceType).not.toHaveBeenCalled();
  });

  it("DELETE rejects N0_ADMIN with 403, even though the guard admits N0 by bypass", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N0_ADMIN });

    const request = new Request("http://localhost/api/competence-types", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
    });

    const response = (await DELETE(request, routeContext())) as Response;

    expect(response.status).toBe(403);
    expect(competenceServiceMock.CompetenceService.deactivateCompetenceType).not.toHaveBeenCalled();
  });

  it("POST lets N3_SAFETY of the plant create a competence type", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N3_SAFETY });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.upsertCompetenceType.mockResolvedValue({ id: "type-1" });

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
    expect(competenceServiceMock.CompetenceService.upsertCompetenceType).toHaveBeenCalledWith(
      "plant-1",
      expect.objectContaining({ code: "FORKLIFT", validityMonths: 12 }),
      "user-1",
    );
  });

  it("POST lets N1_CORPORATE create a competence type", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N1_CORPORATE });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.upsertCompetenceType.mockResolvedValue({ id: "type-1" });

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
  });

  it("N3_SAFETY of another plant is rejected by requirePlantAccess before reaching the N0 check", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }),
    });

    const request = new Request("http://localhost/api/competence-types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "FORKLIFT", name: "Empilhador", category: CompetenceCategory.EQUIPMENT_OPERATION }),
    });

    const response = (await POST(request, routeContext())) as Response;
    expect(response.status).toBe(403);
    expect(competenceServiceMock.CompetenceService.upsertCompetenceType).not.toHaveBeenCalled();
  });

  it("N2_PLANT_MANAGER and N4_SUPERVISOR are rejected by requirePlantAccess", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }),
    });

    for (const method of ["POST", "DELETE"] as const) {
      const response = (await (method === "POST" ? POST : DELETE)(
        new Request("http://localhost/api/competence-types", { method, body: "{}" }),
        routeContext(),
      )) as Response;
      expect(response.status).toBe(403);
    }
  });

  it("DELETE soft-deletes through the service, scoped to the plant", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N3_SAFETY });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.deactivateCompetenceType.mockResolvedValue({ id: "type-1", isActive: false });

    const request = new Request("http://localhost/api/competence-types", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
    });

    const response = (await DELETE(request, routeContext())) as Response;

    expect(response.status).toBe(200);
    expect(competenceServiceMock.CompetenceService.deactivateCompetenceType).toHaveBeenCalledWith(
      "plant-1",
      "11111111-1111-4111-8111-111111111111",
      "user-1",
    );
  });

  it("DELETE surfaces the service's linked-records error as 422", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N3_SAFETY });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.deactivateCompetenceType.mockRejectedValue(
      new Error("Cannot deactivate: 3 linked record(s) exist (2 authorization(s), 1 training record(s), 0 assessment(s))"),
    );

    const request = new Request("http://localhost/api/competence-types", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
    });

    const response = (await DELETE(request, routeContext())) as Response;
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.message).toMatch(/linked record/);
  });
});
