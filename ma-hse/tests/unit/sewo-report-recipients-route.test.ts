import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  reportRecipientList: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  reportRecipient: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { DELETE, GET, POST } from "@/app/api/plants/[plantCode]/admin/sewo-report-recipients/route";

function routeContext(plantCode = "pl1") {
  return {
    params: Promise.resolve({ plantCode }),
  };
}

describe("sewo report recipients route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists configured recipients for N0 admin", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N0_ADMIN }] } },
      role: RoleCode.N0_ADMIN,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.reportRecipientList.findFirst.mockResolvedValue({ id: "list-1" });
    prismaMock.reportRecipient.findMany.mockResolvedValue([
      {
        id: "recipient-1",
        name: "Maria Silva",
        email: "maria@example.com",
        language: "pt",
      },
    ]);

    const response = (await GET(new Request("http://localhost/api/plants/pl1/admin/sewo-report-recipients"), routeContext()))!;
    const json = await response.json();

    expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("pl1", [RoleCode.N0_ADMIN]);
    expect(response.status).toBe(200);
    expect(json.data.recipients).toEqual([
      {
        id: "recipient-1",
        name: "Maria Silva",
        email: "maria@example.com",
        language: "pt",
      },
    ]);
  });

  it("creates a recipient and normalizes the email", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N0_ADMIN }] } },
      role: RoleCode.N0_ADMIN,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.reportRecipientList.findFirst.mockResolvedValue(null);
    prismaMock.reportRecipientList.create.mockResolvedValue({ id: "list-1" });
    prismaMock.reportRecipient.findUnique.mockResolvedValue(null);
    prismaMock.reportRecipient.create.mockResolvedValue({
      id: "recipient-1",
      name: "Maria Silva",
      email: "maria.silva@example.com",
      language: "pt",
    });

    const response = (await POST(
      new Request("http://localhost/api/plants/pl1/admin/sewo-report-recipients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Maria Silva",
          email: " Maria.Silva@Example.com ",
          language: "pt",
        }),
      }),
      routeContext(),
    ))!;

    expect(prismaMock.reportRecipient.create).toHaveBeenCalledWith({
      data: {
        listId: "list-1",
        name: "Maria Silva",
        email: "maria.silva@example.com",
        language: "pt",
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        language: true,
      },
    });
    expect(response.status).toBe(201);
  });

  it("soft deletes a recipient from the active list", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { plantRoles: [{ role: RoleCode.N0_ADMIN }] } },
      role: RoleCode.N0_ADMIN,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.reportRecipientList.findFirst.mockResolvedValue({ id: "list-1" });
    prismaMock.reportRecipient.findFirst.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    prismaMock.reportRecipient.update.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", isActive: false });

    const response = (await DELETE(
      new Request("http://localhost/api/plants/pl1/admin/sewo-report-recipients", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "11111111-1111-4111-8111-111111111111",
        }),
      }),
      routeContext(),
    ))!;

    expect(prismaMock.reportRecipient.update).toHaveBeenCalledWith({
      where: {
        id: "11111111-1111-4111-8111-111111111111",
      },
      data: {
        isActive: false,
      },
    });
    expect(response.status).toBe(200);
  });
});
