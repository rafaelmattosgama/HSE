import { RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({
  getServerSession: vi.fn(),
}));

const navigationMock = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`redirect:${destination}`);
  }),
}));

const prismaMock = vi.hoisted(() => ({
  plant: { findUnique: vi.fn() },
  systemParameter: { findFirst: vi.fn() },
}));

vi.mock("next-auth", () => authMock);
vi.mock("next/navigation", () => navigationMock);
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import EnvironmentDashboardPage from "@/app/(secure)/app/[plant]/environment-dashboard/page";

describe("environment dashboard route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("blocks direct access when Dashboard de Ambiente is disabled for the plant", async () => {
    authMock.getServerSession.mockResolvedValue({
      user: {
        language: "pt",
        plantRoles: [{ plantCode: "pl1", role: RoleCode.N2_PLANT_MANAGER }],
      },
    });
    prismaMock.plant.findUnique.mockResolvedValue({
      id: "plant-1",
      code: "pl1",
      defaultLanguage: "pt",
      systemParameters: [{ valueJson: { ENVIRONMENT_DASHBOARD: false } }],
    });
    prismaMock.systemParameter.findFirst.mockResolvedValue(null);

    await expect(EnvironmentDashboardPage({
      params: Promise.resolve({ plant: "pl1" }),
      searchParams: Promise.resolve({}),
    })).rejects.toThrow("redirect:/app/pl1/dashboards");

    expect(navigationMock.redirect).toHaveBeenCalledWith("/app/pl1/dashboards");
  });
});
