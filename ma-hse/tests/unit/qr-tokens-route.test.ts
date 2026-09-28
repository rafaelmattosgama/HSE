import { PlantAccessTokenType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { REPORT_QR_REGENERATION_ENABLED: false, APP_URL: "http://localhost:3000" },
  requirePlantAccess: vi.fn(),
  findPlantByCode: vi.fn(),
  generateAccessTokenValue: vi.fn(),
  hashAccessToken: vi.fn(),
  tokens: { updateMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  auditLog: { create: vi.fn() },
  transaction: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/rbac/guards", () => ({ requirePlantAccess: mocks.requirePlantAccess }));
vi.mock("@/lib/plant", () => ({ findPlantByCode: mocks.findPlantByCode }));
vi.mock("@/lib/security", () => ({
  generateAccessTokenValue: mocks.generateAccessTokenValue,
  hashAccessToken: mocks.hashAccessToken,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { plantAccessToken: mocks.tokens, $transaction: mocks.transaction, auditLog: mocks.auditLog },
}));

import { POST } from "@/app/api/plants/[plantCode]/admin/qr-tokens/route";
import { regeneratePlantToken, verifyPlantToken } from "@/lib/auth/plant-token";

function post(body: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/plants/pl01/admin/qr-tokens", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ plantCode: "pl01" }) });
}

describe("report QR regeneration protection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.env.REPORT_QR_REGENERATION_ENABLED = false;
    mocks.requirePlantAccess.mockResolvedValue({ session: { user: { id: "admin-1" } } });
    mocks.findPlantByCode.mockResolvedValue({ id: "plant-1", code: "pl01" });
    mocks.generateAccessTokenValue.mockReturnValue("new-test-token");
    mocks.hashAccessToken.mockReturnValue("test-hash");
    mocks.tokens.create.mockResolvedValue({ id: "token-1" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      plantAccessToken: mocks.tokens,
      auditLog: mocks.auditLog,
    }));
  });

  function expectNoRotation() {
    expect(mocks.generateAccessTokenValue).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.tokens.updateMany).not.toHaveBeenCalled();
    expect(mocks.tokens.create).not.toHaveBeenCalled();
  }

  it("rejects direct API regeneration without touching existing tokens", async () => {
    const response = await post({ type: "REPORT", regenerate: true });
    expect(response?.status).toBe(403);
    expect(await response?.json()).toMatchObject({ ok: false, errorCode: "REPORT_QR_REGENERATION_DISABLED" });
    expectNoRotation();
  });

  it("also blocks callers that bypass the API", async () => {
    await expect(regeneratePlantToken({
      plantId: "plant-1", type: PlantAccessTokenType.REPORT, actorUserId: "admin-1",
    })).rejects.toThrow("Report QR token regeneration is disabled.");
    expectNoRotation();
  });

  it.each([
    { type: "REPORT" },
    { type: "REPORT", regenerate: false },
    { type: "REPORT", regenerate: true, revoke: true },
    { type: "KIOSK" },
  ])("requires exactly one explicit action even when enabled: %j", async (body) => {
    mocks.env.REPORT_QR_REGENERATION_ENABLED = true;
    const response = await post(body);
    expect(response?.status).toBe(422);
    expectNoRotation();
  });

  it.each(["REPORT", "KIOSK"])("rotates %s only when allowed and records no plaintext token in the audit", async (type) => {
    mocks.env.REPORT_QR_REGENERATION_ENABLED = type === "REPORT";
    const response = await post({ type, regenerate: true });
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ ok: true, data: { type, token: "new-test-token" } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tokens.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { plantId: "plant-1", type, isActive: true, revokedAt: null },
    }));
    expect(mocks.tokens.create).toHaveBeenCalledTimes(1);
    expect(mocks.auditLog.create).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.auditLog.create.mock.calls)).not.toContain("new-test-token");
  });

  it("keeps validation of existing report tokens available while regeneration is disabled", async () => {
    const existing = { id: "existing-token" };
    mocks.tokens.findFirst.mockResolvedValue(existing);
    expect(await verifyPlantToken({ plantId: "plant-1", type: PlantAccessTokenType.REPORT, token: "existing" })).toBe(existing);
    expect(mocks.tokens.findFirst).toHaveBeenCalledWith({
      where: { plantId: "plant-1", type: "REPORT", tokenHash: "test-hash", isActive: true, revokedAt: null },
    });
    expectNoRotation();
  });

  it("preserves explicit emergency revocation without creating a token", async () => {
    const response = await post({ type: "REPORT", revoke: true });
    expect(response?.status).toBe(200);
    expect(mocks.tokens.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.tokens.create).not.toHaveBeenCalled();
    expect(mocks.generateAccessTokenValue).not.toHaveBeenCalled();
  });

  it("still requires authorization even when enabled", async () => {
    mocks.env.REPORT_QR_REGENERATION_ENABLED = true;
    mocks.requirePlantAccess.mockResolvedValue({ error: new Response(null, { status: 403 }) });
    expect((await post({ type: "REPORT", regenerate: true }))?.status).toBe(403);
    expectNoRotation();
  });
});
