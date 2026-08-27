import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({ requirePlantAccess: vi.fn() }));
const plantMock = vi.hoisted(() => ({ getPlantByCode: vi.fn() }));
const serviceMock = vi.hoisted(() => ({
  CompetenceService: { setWorkerCompetenceRequirement: vi.fn() },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/services/competence-service", () => serviceMock);

import { PATCH } from "@/app/api/plants/[plantCode]/competences/workers/[id]/requirements/route";

function routeContext(id: string) {
  return { params: Promise.resolve({ plantCode: "pl01", id }) };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/plants/[plantCode]/competences/workers/[id]/requirements", () => {
  afterEach(() => vi.clearAllMocks());

  it("allows N4_SUPERVISOR to mark a competence required and returns the updated row", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N4_SUPERVISOR });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    serviceMock.CompetenceService.setWorkerCompetenceRequirement.mockResolvedValue({ id: "req-1", isRequired: true });

    const competenceTypeId = "22222222-2222-4222-8222-222222222222";
    const response = (await PATCH(
      jsonRequest({ competenceTypeId, isRequired: true }),
      routeContext("worker-1"),
    )) as Response;

    expect(response.status).toBe(200);
    expect(serviceMock.CompetenceService.setWorkerCompetenceRequirement).toHaveBeenCalledWith(
      "plant-1",
      "worker-1",
      competenceTypeId,
      { isRequired: true, notes: undefined },
      "user-1",
    );
  });

  it("rejects a role outside N0/N1/N3/N4 before touching the service", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }) });

    const competenceTypeId = "22222222-2222-4222-8222-222222222222";
    const response = (await PATCH(
      jsonRequest({ competenceTypeId, isRequired: true }),
      routeContext("worker-1"),
    )) as Response;

    expect(response.status).toBe(403);
    expect(serviceMock.CompetenceService.setWorkerCompetenceRequirement).not.toHaveBeenCalled();
  });
});
