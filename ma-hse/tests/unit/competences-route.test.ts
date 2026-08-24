import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const uiLanguageMock = vi.hoisted(() => ({
  getServerUiLocale: vi.fn(),
}));

const competenceServiceMock = vi.hoisted(() => ({
  CompetenceService: {
    list: vi.fn(),
    enroll: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/server-ui-language", () => uiLanguageMock);
vi.mock("@/lib/services/competence-service", () => competenceServiceMock);

import { GET, POST } from "@/app/api/plants/[plantCode]/competences/route";

function routeContext() {
  return { params: Promise.resolve({ plantCode: "maap" }) };
}

describe("competences route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns the matrix for any of the view roles, including N5_OPERATOR", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "en" } },
      role: RoleCode.N5_OPERATOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "pt" });
    uiLanguageMock.getServerUiLocale.mockResolvedValue("en");
    competenceServiceMock.CompetenceService.list.mockResolvedValue({ competenceTypes: [], workers: [] });

    const response = (await GET(new Request("http://localhost/api/competences"), routeContext())) as Response;
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { competenceTypes: [], workers: [] } });
    expect(competenceServiceMock.CompetenceService.list).toHaveBeenCalledWith("plant-1", "en", {
      role: RoleCode.N5_OPERATOR,
      userId: "user-1",
    });
  });

  it("GET propagates the RBAC rejection for roles without plant access", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }),
    });

    const response = (await GET(new Request("http://localhost/api/competences"), routeContext())) as Response;

    expect(response.status).toBe(403);
    expect(competenceServiceMock.CompetenceService.list).not.toHaveBeenCalled();
  });

  it("POST enrolls workers for roles allowed to write, and rejects N2_PLANT_MANAGER", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }),
    });

    const request = new Request("http://localhost/api/competences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workers: [{ employeeDirectoryId: "11111111-1111-4111-8111-111111111111", areaId: "22222222-2222-4222-8222-222222222222" }] }),
    });

    const response = (await POST(request, routeContext())) as Response;

    expect(response.status).toBe(403);
    expect(competenceServiceMock.CompetenceService.enroll).not.toHaveBeenCalled();
  });

  it("POST returns 201 and the enrolled count on success", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "en" } },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "pt" });
    competenceServiceMock.CompetenceService.enroll.mockResolvedValue([{ id: "worker-1" }]);

    const request = new Request("http://localhost/api/competences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workers: [{ employeeDirectoryId: "11111111-1111-4111-8111-111111111111", areaId: "22222222-2222-4222-8222-222222222222" }] }),
    });

    const response = (await POST(request, routeContext())) as Response;
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ ok: true, data: { enrolled: 1 } });
    expect(competenceServiceMock.CompetenceService.enroll).toHaveBeenCalledWith(
      "plant-1",
      { workers: [{ employeeDirectoryId: "11111111-1111-4111-8111-111111111111", areaId: "22222222-2222-4222-8222-222222222222" }] },
      "user-1",
    );
  });

  it("POST rejects an empty workers array before calling the service", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "en" } },
      role: RoleCode.N3_SAFETY,
    });

    const request = new Request("http://localhost/api/competences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workers: [] }),
    });

    const response = (await POST(request, routeContext())) as Response;

    expect(response.status).toBe(422);
    expect(competenceServiceMock.CompetenceService.enroll).not.toHaveBeenCalled();
  });

  it("POST turns a service failure into a controlled 422 response", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "user-1", language: "en" } },
      role: RoleCode.N3_SAFETY,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", defaultLanguage: "pt" });
    competenceServiceMock.CompetenceService.enroll.mockRejectedValue(new Error("Area not found for plant scope: x"));

    const request = new Request("http://localhost/api/competences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workers: [{ employeeDirectoryId: "11111111-1111-4111-8111-111111111111", areaId: "22222222-2222-4222-8222-222222222222" }] }),
    });

    const response = (await POST(request, routeContext())) as Response;
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.ok).toBe(false);
    expect(json.message).toContain("Area not found");
  });
});
