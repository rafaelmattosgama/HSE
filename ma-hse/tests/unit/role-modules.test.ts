import { describe, expect, it } from "vitest";
import { resolveModuleToggles } from "@/lib/modules";
import { getModuleRequestScope, resolveRoleModuleSettings } from "@/lib/role-modules";
import { roleModuleTogglesInput } from "@/lib/validation/dtos";

describe("role module settings", () => {
  it("preserves existing access until N3 configures a restriction", () => {
    const roles = resolveRoleModuleSettings(resolveModuleToggles(), null);
    expect(roles.N4_SUPERVISOR.SMAT).toBe(true);
    expect(roles.N5_OPERATOR.SMAT).toBe(false);
    expect(roles.N6_HR.SEWO).toBe(true);
    expect(roles.N6_HR.OCCUPATIONAL_HEALTH).toBe(true);
    expect(roles.N4_SUPERVISOR.OCCUPATIONAL_HEALTH).toBe(false);
  });

  it("keeps role settings below factory authorization and base profile permissions", () => {
    const roles = resolveRoleModuleSettings(resolveModuleToggles({ ACTIONS: false }), {
      N4_SUPERVISOR: { ACTIONS: true, COMMUNICATIONS: false, SEWO: true },
    });
    expect(roles.N4_SUPERVISOR.ACTIONS).toBe(false);
    expect(roles.N4_SUPERVISOR.SEWO).toBe(false);
    expect(roles.N4_SUPERVISOR.COMMUNICATIONS).toBe(false);
    expect(roles.N5_OPERATOR.COMMUNICATIONS).toBe(true);
  });

  it("rejects unmanaged profiles, unknown modules and non-boolean settings", () => {
    for (const roles of [{ N3_SAFETY: {} }, { N4_SUPERVISOR: { OTHER: true } }, { N6_HR: { ACTIONS: "true" } }]) {
      expect(roleModuleTogglesInput.safeParse({ roles }).success).toBe(false);
    }
  });

  it("maps nested page/API paths without treating admin settings as module access", () => {
    expect(getModuleRequestScope("/api/plants/maap/competences/workers/123")).toEqual({ plantCode: "maap", moduleKey: "COMPETENCE_AUTHORIZATIONS" });
    expect(getModuleRequestScope("/app/maap/%61ctions")).toEqual({ plantCode: "maap", moduleKey: "ACTIONS" });
    expect(getModuleRequestScope("/app/all/communications")).toEqual({ plantCode: "all", moduleKey: "COMMUNICATIONS" });
    expect(getModuleRequestScope("/api/plants/maap/admin/role-modules")).toBeNull();
    expect(getModuleRequestScope("/app/maap/dashboards")).toBeNull();
  });
});
