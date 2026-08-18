import { RoleCode } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canUseAgent, isAgentRateLimitExempt } from "@/lib/agent/permissions";
import { buildAgentRateLimitKey } from "@/lib/agent/rate-limit";
import { shouldShowInternalAgentChat } from "@/lib/agent/ui-access";

describe("agent access controls", () => {
  it("allows only internal agent roles", () => {
    expect(canUseAgent({ role: RoleCode.N0_ADMIN })).toBe(true);
    expect(canUseAgent({ role: RoleCode.N1_CORPORATE })).toBe(true);
    expect(canUseAgent({ role: RoleCode.N2_PLANT_MANAGER })).toBe(true);
    expect(canUseAgent({ role: RoleCode.N3_SAFETY })).toBe(true);
    expect(canUseAgent({ role: RoleCode.N4_SUPERVISOR })).toBe(true);

    expect(canUseAgent({ role: RoleCode.N5_OPERATOR })).toBe(false);
    expect(canUseAgent({ role: RoleCode.MEDICO })).toBe(false);
    expect(canUseAgent({ role: null })).toBe(false);
  });

  it("exempts N0, N1 and N3 from agent rate limiting", () => {
    expect(isAgentRateLimitExempt({ role: RoleCode.N0_ADMIN })).toBe(true);
    expect(isAgentRateLimitExempt({ role: RoleCode.N1_CORPORATE })).toBe(true);
    expect(isAgentRateLimitExempt({ role: RoleCode.N3_SAFETY })).toBe(true);

    expect(isAgentRateLimitExempt({ role: RoleCode.N2_PLANT_MANAGER })).toBe(false);
    expect(isAgentRateLimitExempt({ role: RoleCode.N4_SUPERVISOR })).toBe(false);
    expect(isAgentRateLimitExempt({ role: RoleCode.N5_OPERATOR })).toBe(false);
    expect(isAgentRateLimitExempt({ role: RoleCode.MEDICO })).toBe(false);
  });

  it("separates agent rate limit keys by user and plant", () => {
    expect(buildAgentRateLimitKey({ userId: "user-1", plantCode: "pl01" })).toBe("agent:user-1:pl01");
    expect(buildAgentRateLimitKey({ userId: "user-2", plantCode: "pl01" })).toBe("agent:user-2:pl01");
    expect(buildAgentRateLimitKey({ userId: "user-1", plantCode: "pl02" })).toBe("agent:user-1:pl02");
  });

  it("hides the frontend chat when the agent is disabled", () => {
    expect(
      shouldShowInternalAgentChat({
        agentEnabled: false,
        isAllPlants: false,
        role: RoleCode.N3_SAFETY,
      }),
    ).toBe(false);
  });

  it("hides the frontend chat in all-plants routes", () => {
    expect(
      shouldShowInternalAgentChat({
        agentEnabled: true,
        isAllPlants: true,
        role: RoleCode.N3_SAFETY,
      }),
    ).toBe(false);
  });

  it("shows the frontend chat for an allowed plant role when enabled", () => {
    expect(
      shouldShowInternalAgentChat({
        agentEnabled: true,
        isAllPlants: false,
        role: RoleCode.N3_SAFETY,
      }),
    ).toBe(true);
  });
});
