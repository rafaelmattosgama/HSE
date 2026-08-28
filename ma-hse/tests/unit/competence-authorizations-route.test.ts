import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const competenceServiceMock = vi.hoisted(() => ({
  CompetenceValidationError: class CompetenceValidationError extends Error {
    constructor(
      public code: string,
      message: string,
      public status: number,
    ) {
      super(message);
    }
  },
  CompetenceService: {
    registerTraining: vi.fn(),
    registerAssessment: vi.fn(),
    grantAuthorization: vi.fn(),
    suspendAuthorization: vi.fn(),
    reactivateAuthorization: vi.fn(),
    revokeAuthorization: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/services/competence-service", () => competenceServiceMock);

import { POST as postTraining } from "@/app/api/plants/[plantCode]/competences/trainings/route";
import { POST as postAssessment } from "@/app/api/plants/[plantCode]/competences/assessments/route";
import { POST as postAuthorization } from "@/app/api/plants/[plantCode]/competences/authorizations/route";
import { POST as postSuspend } from "@/app/api/plants/[plantCode]/competences/authorizations/[id]/suspend/route";
import { POST as postReactivate } from "@/app/api/plants/[plantCode]/competences/authorizations/[id]/reactivate/route";
import { POST as postRevoke } from "@/app/api/plants/[plantCode]/competences/authorizations/[id]/revoke/route";

function routeContext(): { params: Promise<{ plantCode: string }> };
function routeContext(id: string): { params: Promise<{ plantCode: string; id: string }> };
function routeContext(id?: string) {
  return { params: Promise.resolve(id === undefined ? { plantCode: "maap" } : { plantCode: "maap", id }) };
}

function forbidden() {
  return { error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }) };
}

function allowed(role: RoleCode) {
  return { session: { user: { id: "user-1" } }, role };
}

const TRAINING_BODY = JSON.stringify({
  competenceWorkerId: "11111111-1111-4111-8111-111111111111",
  competenceTypeId: "22222222-2222-4222-8222-222222222222",
  completedAt: "2026-01-01",
});

const ASSESSMENT_BODY = JSON.stringify({
  competenceWorkerId: "11111111-1111-4111-8111-111111111111",
  competenceTypeId: "22222222-2222-4222-8222-222222222222",
  assessedAt: "2026-01-02",
  result: "COMPETENT",
});

const AUTHORIZATION_BODY = JSON.stringify({
  competenceWorkerId: "11111111-1111-4111-8111-111111111111",
  competenceTypeId: "22222222-2222-4222-8222-222222222222",
  validFrom: "2026-01-01",
});

const REASON_BODY = JSON.stringify({ reason: "Because" });

describe("competences/trainings and assessments routes — N3/N4 register, N2/N5 cannot (§2.3)", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR])("training: %s can register", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(role));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.registerTraining.mockResolvedValue({ id: "training-1" });

    const response = (await postTraining(
      new Request("http://localhost", { method: "POST", body: TRAINING_BODY, headers: { "content-type": "application/json" } }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(201);
    // (menor) guards against silently widening REGISTER_ROLES in the route: if someone
    // added e.g. N2_PLANT_MANAGER there, this call's second argument would change and
    // this assertion would catch it even though requirePlantAccess itself is mocked.
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("maap", [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR]);
  });

  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N5_OPERATOR])("training: %s is rejected", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue(forbidden());

    const response = (await postTraining(
      new Request("http://localhost", { method: "POST", body: TRAINING_BODY, headers: { "content-type": "application/json" } }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(403);
    expect(competenceServiceMock.CompetenceService.registerTraining).not.toHaveBeenCalled();
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("maap", [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR]);
    // role kept only to document intent under it.each
    void role;
  });

  it.each([RoleCode.N4_SUPERVISOR, RoleCode.N6_HR])("assessment: %s can register", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(role));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.registerAssessment.mockResolvedValue({ id: "assessment-1" });

    const response = (await postAssessment(
      new Request("http://localhost", { method: "POST", body: ASSESSMENT_BODY, headers: { "content-type": "application/json" } }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(201);
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("maap", [RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR]);
  });
});

describe("competences/authorizations route — only N3_SAFETY grants (§2.3)", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([RoleCode.N3_SAFETY, RoleCode.N6_HR])("%s can grant", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(role));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.grantAuthorization.mockResolvedValue({ id: "auth-1" });

    const response = (await postAuthorization(
      new Request("http://localhost", { method: "POST", body: AUTHORIZATION_BODY, headers: { "content-type": "application/json" } }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(201);
    // (menor) this is the exact regression §2.3 of the review flags: without asserting
    // the roles array, adding RoleCode.N2_PLANT_MANAGER to GRANT_ROLES would leave this
    // suite green.
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("maap", [RoleCode.N3_SAFETY, RoleCode.N6_HR]);
  });

  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR])("%s cannot grant, despite being allowed to suspend", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue(forbidden());

    const response = (await postAuthorization(
      new Request("http://localhost", { method: "POST", body: AUTHORIZATION_BODY, headers: { "content-type": "application/json" } }),
      routeContext(),
    )) as Response;

    expect(response.status).toBe(403);
    expect(competenceServiceMock.CompetenceService.grantAuthorization).not.toHaveBeenCalled();
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("maap", [RoleCode.N3_SAFETY, RoleCode.N6_HR]);
  });

  it("turns a segregation-of-duties rejection from the service into a 422, not a 500", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(RoleCode.N3_SAFETY));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.grantAuthorization.mockRejectedValue(
      new competenceServiceMock.CompetenceValidationError(
        "SEGREGATION_OF_DUTIES",
        "Segregation of duties: the user who performed the practical assessment cannot grant this authorization",
        422,
      ),
    );

    const response = (await postAuthorization(
      new Request("http://localhost", { method: "POST", body: AUTHORIZATION_BODY, headers: { "content-type": "application/json" } }),
      routeContext(),
    )) as Response;
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.message).toContain("Segregation of duties");
  });
});

describe("authorizations/[id]/suspend and /reactivate — N2, N3, N4 (§2.3)", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR])("%s can suspend", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(role));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.suspendAuthorization.mockResolvedValue({ id: "auth-1" });

    const response = (await postSuspend(
      new Request("http://localhost", { method: "POST", body: REASON_BODY, headers: { "content-type": "application/json" } }),
      routeContext("auth-1"),
    )) as Response;

    expect(response.status).toBe(200);
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith(
      "maap",
      [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR],
    );
  });

  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR])("%s can reactivate", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(role));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.reactivateAuthorization.mockResolvedValue({ id: "auth-1" });

    const response = (await postReactivate(
      new Request("http://localhost", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }),
      routeContext("auth-1"),
    )) as Response;

    expect(response.status).toBe(200);
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith(
      "maap",
      [RoleCode.N2_PLANT_MANAGER, RoleCode.N3_SAFETY, RoleCode.N4_SUPERVISOR, RoleCode.N6_HR],
    );
  });
});

describe("authorizations/[id]/revoke — only N3_SAFETY (§2.3), N2/N4 rejected even though they can suspend", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([RoleCode.N3_SAFETY, RoleCode.N6_HR])("%s can revoke", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue(allowed(role));
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    competenceServiceMock.CompetenceService.revokeAuthorization.mockResolvedValue({ id: "auth-1" });

    const response = (await postRevoke(
      new Request("http://localhost", { method: "POST", body: REASON_BODY, headers: { "content-type": "application/json" } }),
      routeContext("auth-1"),
    )) as Response;

    expect(response.status).toBe(200);
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("maap", [RoleCode.N3_SAFETY, RoleCode.N6_HR]);
  });

  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR])("%s cannot revoke", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue(forbidden());

    const response = (await postRevoke(
      new Request("http://localhost", { method: "POST", body: REASON_BODY, headers: { "content-type": "application/json" } }),
      routeContext("auth-1"),
    )) as Response;

    expect(response.status).toBe(403);
    expect(competenceServiceMock.CompetenceService.revokeAuthorization).not.toHaveBeenCalled();
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("maap", [RoleCode.N3_SAFETY, RoleCode.N6_HR]);
  });
});
