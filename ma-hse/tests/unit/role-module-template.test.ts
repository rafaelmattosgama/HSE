import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";
import { MODULE_REQUEST_PATH_HEADER } from "@/lib/role-modules";

const mocks = vi.hoisted(() => ({ session: vi.fn(), headers: vi.fn(), allowed: vi.fn(), redirect: vi.fn((path: string) => { throw new Error(`Redirect: ${path}`); }) }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/services/role-module-service", () => ({ isRoleModuleRequestAllowed: mocks.allowed }));
import PlantModuleTemplate from "@/app/(secure)/app/[plant]/template";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { plantRoles: [] } });
  mocks.headers.mockResolvedValue(new Headers({ [MODULE_REQUEST_PATH_HEADER]: "/app/maap/actions" }));
});

describe("direct module navigation", () => {
  it("replaces spoofed path headers with the actual path for both pages and APIs", () => {
    for (const path of ["/app/maap/actions", "/api/plants/maap/actions/123/close"]) {
      const response = proxy(new NextRequest(`http://localhost${path}`, { headers: { [MODULE_REQUEST_PATH_HEADER]: "/app/maap/dashboards" } }));
      expect(response.headers.get(`x-middleware-request-${MODULE_REQUEST_PATH_HEADER}`)).toBe(path);
    }
  });

  it("redirects users instead of rendering a disabled module", async () => {
    mocks.allowed.mockResolvedValue(false);
    await expect(PlantModuleTemplate({ children: "private module" })).rejects.toThrow("Redirect: /app/corporate");
    expect(mocks.allowed).toHaveBeenCalledWith("/app/maap/actions", []);
  });

  it("renders an authorized module", async () => {
    mocks.allowed.mockResolvedValue(true);
    expect(await PlantModuleTemplate({ children: "module" })).toBe("module");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
