import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  systemParameter: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("next-auth", () => authMock);
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { POST as postGlobalModules } from "@/app/api/admin/modules/route";
import { POST as postPlantModules } from "@/app/api/plants/[plantCode]/admin/modules/route";

function plantRouteContext(plantCode = "pl1") {
  return { params: Promise.resolve({ plantCode }) };
}

function forbiddenResponse() {
  return new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 });
}

describe("module settings API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("persists the canonical Dashboard de Ambiente global setting for N0", async () => {
    authMock.getServerSession.mockResolvedValue({
      user: { plantRoles: [{ role: RoleCode.N0_ADMIN }] },
    });
    prismaMock.systemParameter.findFirst.mockResolvedValue(null);

    const response = await postGlobalModules(new Request("http://localhost/api/admin/modules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modules: { ENVIRONMENT_DASHBOARD: false } }),
    }));
    if (!response) throw new Error("Global modules route did not return a response");

    expect(response.status).toBe(200);
    expect(prismaMock.systemParameter.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        plantId: null,
        valueJson: expect.objectContaining({ ENVIRONMENT_DASHBOARD: false }),
      }),
    });
  });

  it("rejects unknown module keys instead of storing duplicate configuration", async () => {
    authMock.getServerSession.mockResolvedValue({
      user: { plantRoles: [{ role: RoleCode.N0_ADMIN }] },
    });

    const response = await postGlobalModules(new Request("http://localhost/api/admin/modules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modules: { ENVIRONMENT_DASHBOARD: true, ENVIRONMENT_DASHBOARD_V2: true } }),
    }));
    if (!response) throw new Error("Global modules route did not return a response");

    expect(response.status).toBe(422);
    expect(prismaMock.systemParameter.create).not.toHaveBeenCalled();
    expect(prismaMock.systemParameter.update).not.toHaveBeenCalled();
  });

  it("requires N0 and upserts the selected plant configuration without changing another plant", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ session: { user: { id: "n0" } } });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });

    const response = await postPlantModules(new Request("http://localhost/api/plants/pl1/admin/modules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modules: { ENVIRONMENT_DASHBOARD: false } }),
    }), plantRouteContext());
    if (!response) throw new Error("Plant modules route did not return a response");

    expect(response.status).toBe(200);
    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("pl1", [RoleCode.N0_ADMIN]);
    expect(prismaMock.systemParameter.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { plantId_key: { plantId: "plant-1", key: "MODULE_TOGGLES" } },
      create: expect.objectContaining({
        plantId: "plant-1",
        valueJson: expect.objectContaining({ ENVIRONMENT_DASHBOARD: false }),
      }),
    }));
  });

  it("does not persist a plant configuration when authorization is denied", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({ error: forbiddenResponse() });

    const response = await postPlantModules(new Request("http://localhost/api/plants/pl1/admin/modules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ modules: { ENVIRONMENT_DASHBOARD: true } }),
    }), plantRouteContext());
    if (!response) throw new Error("Plant modules route did not return a response");

    expect(response.status).toBe(403);
    expect(plantMock.getPlantByCode).not.toHaveBeenCalled();
    expect(prismaMock.systemParameter.upsert).not.toHaveBeenCalled();
  });
});
