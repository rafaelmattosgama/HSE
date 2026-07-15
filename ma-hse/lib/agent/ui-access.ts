import type { RoleCode } from "@prisma/client";
import { canUseAgent } from "@/lib/agent/permissions";

export function shouldShowInternalAgentChat(input: {
  agentEnabled: boolean;
  isAllPlants: boolean;
  role?: RoleCode | null;
}) {
  return input.agentEnabled && !input.isAllPlants && canUseAgent({ role: input.role });
}
