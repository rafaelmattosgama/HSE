import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({ requirePlantAccess: vi.fn() }));
const plantMock = vi.hoisted(() => ({ getPlantByCode: vi.fn(async () => ({ id: "plant-1", code: "pl01" })) }));
const serviceMock = vi.hoisted(() => ({ CompetenceService: { registerCompetenceEntry: vi.fn() } }));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/services/competence-service", () => ({
  ...serviceMock,
  CompetenceValidationError: class CompetenceValidationError extends Error {},
}));

import { POST } from "@/app/api/plants/[plantCode]/competences/entries/route";

function request(body: unknown) {
  return new Request("http://localhost/api/plants/pl01/competences/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const body = {
  competenceWorkerId: "00000000-0000-4000-8000-00000000000a",
  competenceTypeId: "00000000-0000-4000-8000-00000000000b",
  training: { completedAt: "2026-08-01", result: "PASSED" },
};

describe("POST /api/plants/[plantCode]/competences/entries", () => {
  afterEach(() => vi.clearAllMocks());

  it.each([RoleCode.N3_SAFETY, RoleCode.N6_HR])("allows %s to submit an authorization entry", async (role) => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role });
    serviceMock.CompetenceService.registerCompetenceEntry.mockResolvedValue({ entryGroupId: "g1" });

    const response = (await POST(
      request({ ...body, assessment: { assessedAt: "2026-08-02", result: "COMPETENT", assessorUserId: "00000000-0000-4000-8000-00000000000c" }, authorization: { validFrom: "2026-08-03" } }),
      { params: Promise.resolve({ plantCode: "pl01" }) },
    )) as Response;

    expect(response.status).toBe(201);
    expect(serviceMock.CompetenceService.registerCompetenceEntry).toHaveBeenCalledTimes(1);
  });

  it("rejects N4_SUPERVISOR when the entry includes an authorization", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "user-1" } }, role: RoleCode.N4_SUPERVISOR });

    const response = (await POST(request({ ...body, authorization: { validFrom: "2026-08-03" } }), { params: Promise.resolve({ plantCode: "pl01" }) })) as Response;

    expect(response.status).toBe(403);
    expect(serviceMock.CompetenceService.registerCompetenceEntry).not.toHaveBeenCalled();
  });
});
