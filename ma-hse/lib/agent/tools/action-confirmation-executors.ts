import { ActionPriority } from "@prisma/client";
import { ActionService } from "@/lib/services/action-service";
import { prisma } from "@/lib/prisma";
import {
  AGENT_ACTION_ROLES,
  AGENT_CONTROLLED_OPERATION_ROLES,
  AgentToolUserError,
  type AgentToolContext,
  runAgentTool,
} from "@/lib/agent/permissions";
import { closeActionInput, updateActionInput } from "@/lib/validation/dtos";
import { z } from "zod";

export const closeActionConfirmationPayloadInput = closeActionInput.extend({
  actionId: z.string().min(1),
});

export type CloseActionConfirmationPayload = z.infer<typeof closeActionConfirmationPayloadInput>;

export const updateActionPriorityConfirmationPayloadInput = z.object({
  actionId: z.string().min(1),
  priority: z.nativeEnum(ActionPriority),
});

export type UpdateActionPriorityConfirmationPayload = z.infer<typeof updateActionPriorityConfirmationPayloadInput>;

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

export async function executeUpdateActionPriorityConfirmation(
  ctx: AgentToolContext,
  payload: UpdateActionPriorityConfirmationPayload,
) {
  return runAgentTool({
    ctx,
    toolName: "update_action_priority_confirmed",
    toolInput: payload,
    allowedRoles: AGENT_CONTROLLED_OPERATION_ROLES,
    run: async () => {
      const currentAction = await prisma.action.findFirst({
        where: { id: payload.actionId, plantId: ctx.plantId },
        select: {
          id: true,
          sequenceNumber: true,
          title: true,
          description: true,
          ownerUserId: true,
          category: true,
          level: true,
          dueDate: true,
          status: true,
        },
      });
      if (!currentAction) throw new AgentToolUserError("Action not found for this plant.");

      const updatePayload = updateActionInput.parse({
        title: currentAction.title,
        description: currentAction.description,
        ownerUserId: currentAction.ownerUserId,
        priority: payload.priority,
        category: currentAction.category,
        level: currentAction.level,
        dueDate: currentAction.dueDate,
      });
      const updated = await ActionService.update({
        actionId: currentAction.id,
        actorUserId: ctx.userId,
        payload: updatePayload,
      });

      return {
        id: updated.id,
        sequenceNumber: updated.sequenceNumber,
        title: updated.title,
        priority: updated.priority,
        status: updated.status,
      };
    },
  });
}
