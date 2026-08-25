import { CompetenceRequirementScope, RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const serverUiLanguageMock = vi.hoisted(() => ({
  getServerUiLocale: vi.fn(async () => "pt"),
}));

const competenceServiceMock = vi.hoisted(() => ({
  CompetenceService: {
    listRequirements: vi.fn(async () => []),
    getRequirementCoverage: vi.fn(async () => ({
      totalRoles: 0,
      rolesWithRequirement: 0,
      roleNamesWithoutRequirement: [],
      workersWithoutRoleName: 0,
      totalWorkers: 0,
    })),
    upsertRequirement: vi.fn(),
    deactivateRequirement: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/server-ui-language", () => serverUiLanguageMock);
vi.mock("@/lib/services/competence-service", () => competenceServiceMock);

import { DELETE, GET, POST } from "@/app/api/plants/[plantCode]/admin/competence-requirements/route";

function routeContext() {
  return { params: Promise.resolve({ plantCode: "maap" }) };
}

// §2.7: same rule and same M1 concern as admin/competence-types — the
// requirePlantAccess guard bypasses N0_ADMIN unconditionally regardless of
// the allowedRoles array, so exclusion has to be an explicit post-guard
// check. Asserting only the status code would miss a regression where the
// route silently reverted to allowedRoles=[N0_ADMIN].
const CATALOG_ROLES = [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY];

describe("admin competence-requirements route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("every verb requests plant access with [N1_CORPORATE, N3_SAFETY], not N0_ADMIN", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }),
    });

    await GET(new Request("http://localhost/api/competence-requirements"), routeContext());
    await POST(new Request("http://localhost/api/competence-requirements", { method: "POST", body: "{}" }), routeContext());
    await DELETE(new Request("http://localhost/api/competence-requirements", { method: "DELETE", body: "{}" }), routeContext());

    expect(guardsMock.requirePlantAccess).toHaveBeenNthCalledWith(1, "maap", CATALOG_ROLES);
    expect(guardsMock.requirePlantAccess).toHaveBeenNthCalledWith(2, "maap", CATALOG_ROLES);
    expect(guardsMock.requirePlantAccess).toHaveBeenNthCalledWith(3, "maap", CATALOG_ROLES);
  });

  it("GET lets N0_ADMIN read (support access)", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1", language: "pt" } }, role: RoleCode.N0_ADMIN });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "pt" });

    const response = (await GET(new Request("http://localhost/api/competence-requirements"), routeContext())) as Response;
    expect(response.status).toBe(200);
  });

  it("POST rejects N0_ADMIN with 403 despite the guard's bypass", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N0_ADMIN });

    const response = (await POST(
      new Request("http://localhost/api/competence-requirements", { method: "POST", body: "{}" }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(403);
    expect(competenceServiceMock.CompetenceService.upsertRequirement).not.toHaveBeenCalled();
  });

  it("DELETE rejects N0_ADMIN with 403 despite the guard's bypass", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N0_ADMIN });

    const response = (await DELETE(
      new Request("http://localhost/api/competence-requirements", { method: "DELETE", body: "{}" }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(403);
    expect(competenceServiceMock.CompetenceService.deactivateRequirement).not.toHaveBeenCalled();
  });

  it("POST lets N3_SAFETY of the plant create a requirement rule", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N3_SAFETY });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.upsertRequirement.mockResolvedValue({ id: "req-1" });

    const request = new Request("http://localhost/api/competence-requirements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        competenceTypeId: "11111111-1111-4111-8111-111111111111",
        scopeType: CompetenceRequirementScope.ALL_WORKERS,
        isMandatory: true,
      }),
    });

    const response = (await POST(request, routeContext())) as Response;
    expect(response.status).toBe(201);
    expect(competenceServiceMock.CompetenceService.upsertRequirement).toHaveBeenCalledWith(
      "plant-1",
      expect.objectContaining({ scopeType: CompetenceRequirementScope.ALL_WORKERS }),
      "user-1",
    );
  });

  it("POST lets N1_CORPORATE create a requirement rule", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N1_CORPORATE });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.upsertRequirement.mockResolvedValue({ id: "req-1" });

    const request = new Request("http://localhost/api/competence-requirements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        competenceTypeId: "11111111-1111-4111-8111-111111111111",
        scopeType: CompetenceRequirementScope.ALL_WORKERS,
        isMandatory: true,
      }),
    });

    const response = (await POST(request, routeContext())) as Response;
    expect(response.status).toBe(201);
  });

  it("N3_SAFETY of another plant, N2_PLANT_MANAGER and N4_SUPERVISOR are rejected by requirePlantAccess", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }),
    });

    for (const method of ["POST", "DELETE"] as const) {
      const response = (await (method === "POST" ? POST : DELETE)(
        new Request("http://localhost/api/competence-requirements", { method, body: "{}" }),
        routeContext(),
      )) as Response;
      expect(response.status).toBe(403);
    }
  });

  it("DELETE deactivates through the service, scoped to the plant", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N3_SAFETY });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.deactivateRequirement.mockResolvedValue({ id: "req-1", isActive: false });

    const request = new Request("http://localhost/api/competence-requirements", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }),
    });

    const response = (await DELETE(request, routeContext())) as Response;

    expect(response.status).toBe(200);
    expect(competenceServiceMock.CompetenceService.deactivateRequirement).toHaveBeenCalledWith(
      "plant-1",
      "11111111-1111-4111-8111-111111111111",
      "user-1",
    );
  });
});
