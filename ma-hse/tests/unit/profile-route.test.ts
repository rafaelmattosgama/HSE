import { afterEach, describe, expect, it, vi } from "vitest";

const nextAuthMock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

const auditMock = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
  buildDiff: vi.fn(),
}));

vi.mock("next-auth", () => nextAuthMock);
vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));
vi.mock("@/lib/audit", () => auditMock);

import { PATCH } from "@/app/api/auth/profile/route";

describe("profile route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("requires an authenticated session", async () => {
    nextAuthMock.getServerSession.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/auth/profile", {
        method: "PATCH",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Ana Silva",
          language: "pt",
        }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("updates the authenticated user profile and persists the locale cookie", async () => {
    nextAuthMock.getServerSession.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      isActive: true,
      name: "Ana",
      language: "en",
      plantRoles: [{ plantId: "plant-1" }],
    });
    prismaMock.user.update.mockResolvedValue({
      id: "user-1",
      name: "Ana Silva",
      language: "pt",
    });
    auditMock.buildDiff.mockReturnValue({
      before: { name: "Ana", language: "en" },
      after: { name: "Ana Silva", language: "pt" },
      fieldsChanged: ["name", "language"],
    });

    const response = await PATCH(
      new Request("http://localhost/api/auth/profile", {
        method: "PATCH",
        headers: {
          origin: "http://localhost",
          host: "localhost",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Ana Silva",
          language: "pt",
        }),
      }),
    );

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        name: "Ana Silva",
        language: "pt",
      },
      select: {
        id: true,
        name: true,
        language: true,
      },
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith({
      entityType: "User",
      entityId: "user-1",
      action: "UPDATE_OWN_PROFILE",
      actorUserId: "user-1",
      plantId: "plant-1",
      diff: {
        before: { name: "Ana", language: "en" },
        after: { name: "Ana Silva", language: "pt" },
        fieldsChanged: ["name", "language"],
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("ehs_locale=pt");
  });
});
