import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
const guard = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rbac/guards", () => ({ requirePlantAccess: guard }));
vi.mock("@/lib/plant", () => ({ getPlantByCode: async () => ({ id: "plant-1" }) }));
vi.mock("@/lib/services/competence-service", () => ({ CompetenceService: { updateCompetenceRecord: update }, CompetenceValidationError: class extends Error {} }));
import { PATCH } from "@/app/api/plants/[plantCode]/competences/entries/[id]/route";
const training = { kind: "TRAINING", data: { completedAt: "2024-06-01", certificateExpiresAt: "2029-06-30", result: "PASSED" } };
const authorization = { kind: "AUTHORIZATION_GRANTED", data: { validFrom: "2024-06-01", validUntil: "2029-06-30", restrictions: null } };
function call(body: unknown) { return PATCH(new Request("http://localhost/api/plants/pl01/competences/entries/record-1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ plantCode: "pl01", id: "record-1" }) }); }
describe("competence record corrections", () => {
  afterEach(() => vi.clearAllMocks());
  it.each([RoleCode.N3_SAFETY, RoleCode.N6_HR, RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE])("allows %s to edit authorization dates", async role => {
    guard.mockResolvedValue({ session: { user: { id: "editor" } }, role }); update.mockResolvedValue({ id: "record-1" });
    expect((await call(authorization))?.status).toBe(200);
    expect(update).toHaveBeenCalledWith("plant-1", "record-1", expect.objectContaining({ kind: "AUTHORIZATION_GRANTED" }), "editor");
  });
  it("allows N4 to correct training but not an authorization", async () => {
    guard.mockResolvedValue({ session: { user: { id: "editor" } }, role: RoleCode.N4_SUPERVISOR });
    expect((await call(authorization))?.status).toBe(403); expect(update).not.toHaveBeenCalled();
    expect((await call(training))?.status).toBe(200);
  });
  it("respects denied access", async () => {
    guard.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    expect((await call(training))?.status).toBe(403); expect(update).not.toHaveBeenCalled();
  });
  it.each([
    { ...training, data: { ...training.data, certificateExpiresAt: "2020-01-01" } },
    { ...authorization, data: { ...authorization.data, validUntil: "2020-01-01" } },
    { ...authorization, data: { ...authorization.data, status: "ACTIVE" } },
    { ...training, data: { ...training.data, competenceWorkerId: "another-worker" } },
  ])("rejects invalid dates and attempts to change identity/status", async payload => {
    guard.mockResolvedValue({ session: { user: { id: "editor" } }, role: RoleCode.N3_SAFETY });
    expect((await call(payload))?.status).toBe(422); expect(update).not.toHaveBeenCalled();
  });
});
