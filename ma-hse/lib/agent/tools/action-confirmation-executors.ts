import { ActionService } from "@/lib/services/action-service";
import { prisma } from "@/lib/prisma";
import { AGENT_ACTION_ROLES, AgentToolUserError, type AgentToolContext, runAgentTool } from "@/lib/agent/permissions";
import { closeActionInput } from "@/lib/validation/dtos";
import { z } from "zod";

export const closeActionConfirmationPayloadInput = closeActionInput.extend({
  actionId: z.string().min(1),
});

export type CloseActionConfirmationPayload = z.infer<typeof closeActionConfirmationPayloadInput>;

export async function executeCloseActionConfirmation(ctx: AgentToolContext, payload: CloseActionConfirmationPayload) {
  return runAgentTool({
    ctx,
    toolName: "close_action_confirmed",
    toolInput: payload,
    allowedRoles: AGENT_ACTION_ROLES,
    run: async () => {
      const currentAction = await prisma.action.findFirst({
        where: { id: payload.actionId, plantId: ctx.plantId },
        select: { id: true },
      });
      if (!currentAction) throw new AgentToolUserError("Action not found for this plant.");

      const updated = await ActionService.close({
        actionId: payload.actionId,
        actorUserId: ctx.userId,
        payload: {
          closureComment: payload.closureComment,
          closedAt: payload.closedAt,
          evidence: payload.evidence,
        },
      });

      return {
        id: updated.id,
        title: updated.title,
        status: updated.status,
        closedAt: updated.closedAt,
      };
    },
  });
}
