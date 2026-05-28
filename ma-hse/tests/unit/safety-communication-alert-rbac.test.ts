import { RoleCode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canManageSafetyCommunicationAlertRecipients } from "@/lib/rbac/safety-communication-alerts";

describe("safety communication alert recipient permissions", () => {
  it.each([
    RoleCode.N0_ADMIN,
    RoleCode.N1_CORPORATE,
    RoleCode.N2_PLANT_MANAGER,
    RoleCode.N3_SAFETY,
  ])("allows %s to manage alert recipients", (role) => {
    expect(canManageSafetyCommunicationAlertRecipients(role)).toBe(true);
  });

  it.each([
    RoleCode.N4_SUPERVISOR,
    RoleCode.N5_OPERATOR,
    RoleCode.N6_QR_REPORTER,
    RoleCode.MEDICO,
    null,
    undefined,
  ])("does not allow %s to manage alert recipients", (role) => {
    expect(canManageSafetyCommunicationAlertRecipients(role)).toBe(false);
  });
});
