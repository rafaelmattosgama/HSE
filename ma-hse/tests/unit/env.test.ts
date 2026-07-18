import { afterEach, describe, expect, it, vi } from "vitest";

describe("environment configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each(["", "   "])(
    "treats an empty DEPLOY_VERSION (%j) as absent during a production build",
    async (deployVersion) => {
      vi.stubEnv("APP_ENV", "production");
      vi.stubEnv("DEPLOY_VERSION", deployVersion);
      vi.resetModules();

      const { env } = await import("@/lib/env");

      expect(env.APP_ENV).toBe("production");
      expect(env.DEPLOY_VERSION).toBeUndefined();
    },
  );

  it("trims a configured deployment version", async () => {
    vi.stubEnv("APP_ENV", "production");
    vi.stubEnv("DEPLOY_VERSION", "  Release 2026.07  ");
    vi.resetModules();

    const { env } = await import("@/lib/env");

    expect(env.DEPLOY_VERSION).toBe("Release 2026.07");
  });
});
