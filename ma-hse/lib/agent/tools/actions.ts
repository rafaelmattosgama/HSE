import { ActionCategory, ActionManualOrigin, ActionPriority, ActionStatus } from "@prisma/client";
import { tool } from "@openai/agents";
import { z } from "zod";
import { createPendingConfirmation } from "@/lib/agent/confirmations";
import {
  AGENT_ACTION_ROLES,
  AGENT_CONTROLLED_OPERATION_ROLES,
  AgentToolUserError,
  type AgentToolContext,
  runAgentTool,
} from "@/lib/agent/permissions";
import { formatInternalAgentCopy, getInternalAgentCopy } from "@/lib/agent/i18n";
import { LINKABLE_COMMUNICATION_STATUSES } from "@/lib/communication-status";
import { prisma } from "@/lib/prisma";
import { ActionService } from "@/lib/services/action-service";
import {
  closeActionConfirmationPayloadInput,
  executeCloseActionConfirmation,
  executeUpdateActionPriorityConfirmation,
  updateActionPriorityConfirmationPayloadInput,
} from "@/lib/agent/tools/action-confirmation-executors";
import { createActionInput, updateActionInput } from "@/lib/validation/dtos";

const listActionsInput = z.object({
  status: z.nativeEnum(ActionStatus).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

const createActionToolInput = {
  type: "object",
  additionalProperties: false,
  properties: {
    sourceType: { type: "string", enum: ["COMMUNICATION", "SEWO", "SMAT", "MANUAL"] },
    manualOrigin: { type: "string", enum: Object.values(ActionManualOrigin) },
    level: { type: "string", enum: ["N1", "N2", "N3", "N4"] },
    communicationId: { type: "string", format: "uuid" },
    sewoId: { type: "string", format: "uuid" },
    smatAuditId: { type: "string", format: "uuid" },
    category: { type: "string", enum: Object.values(ActionCategory) },
    priority: { type: "string", enum: Object.values(ActionPriority) },
    title: { type: "string", minLength: 3 },
    description: { type: "string", minLength: 5 },
    ownerUserId: { type: "string", format: "uuid" },
    coOwnerIds: { type: "array", items: { type: "string", format: "uuid" } },
    dueDate: { type: "string" },
  },
  required: ["sourceType", "category", "priority", "title", "description", "ownerUserId"],
} as const;

const closeActionToolInput = z.object({
  actionId: z.string().min(1),
  closureComment: z.string().min(5),
  closedAt: z.string().min(1),
  evidence: z
    .array(
      z.object({
        fileKey: z.string().min(3),
        fileName: z.string().min(1),
        contentType: z.string().min(3),
      }),
    )
    .default([]),
});

const updateActionToolInput = z
  .object({
    actionId: z.string().min(1),
    title: z.string().min(3).optional(),
    description: z.string().min(5).optional(),
    ownerUserId: z.string().uuid().optional(),
    priority: z.nativeEnum(ActionPriority).optional(),
    category: z.nativeEnum(ActionCategory).optional(),
    level: z.enum(["N1", "N2", "N3", "N4"]).nullable().optional(),
    dueDate: z.string().min(1).optional(),
  })
  .passthrough();

const updateActionPriorityToolInput = z.object({
  actionId: z.string().min(1),
  priority: z.nativeEnum(ActionPriority),
});

const findOverdueActionsInput = z
  .object({
    limit: z.number().int().min(1).max(100).default(25),
  })
  .passthrough();

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const updateActionAllowedKeys = new Set(["actionId", "title", "description", "ownerUserId", "priority", "category", "level", "dueDate"]);
const findOverdueAllowedKeys = new Set(["limit"]);

function assertAllowedKeys(input: unknown, allowedKeys: Set<string>, message: string) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const unexpected = Object.keys(input as Record<string, unknown>).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) throw new AgentToolUserError(message);
}

function buildActionReferenceWhere(reference: string) {
  const trimmed = reference.trim();
  if (uuidRegex.test(trimmed)) return { id: trimmed };

  const codeNumber = trimmed.match(/\b(?:ACT|ACAO|AÇÃO|ACTION)?[-\s#]*(\d{1,8})\b/i)?.[1];
  if (codeNumber) return { sequenceNumber: Number(codeNumber) };

  return { id: trimmed };
}

function parseUpdateActionToolInput(input: unknown) {
  assertAllowedKeys(input, updateActionAllowedKeys, "Campos invalidos para atualizar a acao. Usa apenas campos permitidos da acao.");
  const parsed = updateActionToolInput.safeParse(input);
  if (!parsed.success) {
    throw new AgentToolUserError("Campos invalidos para atualizar a acao. Usa apenas campos permitidos da acao.");
  }
  return parsed.data;
}

async function assertActionOwnerForPlant(ctx: AgentToolContext, ownerUserId: string) {
  const owner = await prisma.userPlantRole.findFirst({
    where: {
      plantId: ctx.plantId,
      userId: ownerUserId,
      user: { isActive: true },
    },
    select: { userId: true },
  });
  if (!owner) throw new AgentToolUserError("Select an active action owner for this plant.");
}

export async function prepareCloseActionForAgent(ctx: AgentToolContext, input: unknown) {
  return runAgentTool({
    ctx,
    toolName: "close_action",
    toolInput: input,
    allowedRoles: AGENT_ACTION_ROLES,
    run: async () => {
      const payload = closeActionConfirmationPayloadInput.parse(input);
      const action = await prisma.action.findFirst({
        where: { id: payload.actionId, plantId: ctx.plantId },
        select: { id: true, title: true, status: true, dueDate: true },
      });
      if (!action) throw new AgentToolUserError("Action not found for this plant.");
      if (action.status === ActionStatus.CLOSED) throw new AgentToolUserError("Action is already closed.");

      const confirmation = await createPendingConfirmation({
        ctx,
        toolName: "close_action",
        payload,
        allowedRoles: AGENT_ACTION_ROLES,
        summary: formatInternalAgentCopy(getInternalAgentCopy(ctx.session.user.language).closeActionSummary, {
          title: action.title,
          id: action.id,
          comment: payload.closureComment,
        }),
        execute: executeCloseActionConfirmation,
      });

      return {
        requiresConfirmation: true,
        ...confirmation,
      };
    },
  });
}

async function createPriorityUpdateConfirmation(
  ctx: AgentToolContext,
  input: { actionId: string; priority: ActionPriority },
  action: { id: string; sequenceNumber: number | null; title: string; priority: ActionPriority },
) {
  const reference = action.sequenceNumber ? `#${action.sequenceNumber}` : action.id;
  const confirmation = await createPendingConfirmation({
    ctx,
    toolName: "update_action_priority",
    payload: { actionId: action.id, priority: input.priority },
    allowedRoles: AGENT_CONTROLLED_OPERATION_ROLES,
    summary: `${getInternalAgentCopy(ctx.session.user.language).ui.confirmationRequired} ${reference}: ${action.title} (${action.priority} → ${input.priority}).`,
    execute: executeUpdateActionPriorityConfirmation,
  });

  return {
    requiresConfirmation: true,
    ...confirmation,
  };
}

export async function prepareUpdateActionPriorityForAgent(ctx: AgentToolContext, input: unknown) {
  return runAgentTool({
    ctx,
    toolName: "update_action_priority",
    toolInput: input,
    allowedRoles: AGENT_CONTROLLED_OPERATION_ROLES,
    run: async () => {
      const payload = updateActionPriorityConfirmationPayloadInput.parse(input);
      const action = await prisma.action.findFirst({
        where: { plantId: ctx.plantId, ...buildActionReferenceWhere(payload.actionId) },
        select: { id: true, sequenceNumber: true, title: true, status: true, priority: true },
      });
      if (!action) throw new AgentToolUserError("Action not found for this plant.");
      if (action.status === ActionStatus.CLOSED) throw new AgentToolUserError("Action is already closed.");

      return createPriorityUpdateConfirmation(ctx, payload, action);
    },
  });
}

async function assertCreateActionReferences(ctx: AgentToolContext, payload: z.infer<typeof createActionInput>) {
  if (payload.sourceType === "COMMUNICATION" && payload.communicationId) {
    const communication = await prisma.communication.findFirst({
      where: {
        id: payload.communicationId,
        plantId: ctx.plantId,
        status: { in: [...LINKABLE_COMMUNICATION_STATUSES] },
      },
      select: { id: true },
    });
    if (!communication) throw new AgentToolUserError("Select a validated communication for this plant.");
  }

  if (payload.sourceType === "SEWO" && payload.sewoId) {
    const sewo = await prisma.sEWO.findFirst({
      where: { id: payload.sewoId, plantId: ctx.plantId },
      select: { id: true },
    });
    if (!sewo) throw new AgentToolUserError("Select an existing S-EWO record for this plant.");
  }

  if (payload.sourceType === "SMAT" && payload.smatAuditId) {
    const smat = await prisma.smatAudit.findFirst({
      where: { id: payload.smatAuditId, plantId: ctx.plantId },
      select: { id: true },
    });
    if (!smat) throw new AgentToolUserError("Select an existing SMAT record for this plant.");
  }

  const owner = await prisma.userPlantRole.findFirst({
    where: {
      plantId: ctx.plantId,
      userId: payload.ownerUserId,
      user: { isActive: true },
    },
    select: { userId: true },
  });
  if (!owner) throw new AgentToolUserError("Select an active action owner for this plant.");
}

export function createActionTools(ctx: AgentToolContext) {
  return [
    tool({
      name: "list_actions",
      description: "List recent action plans for the authenticated user's current plant.",
      parameters: listActionsInput,
      execute: async (input) =>
        runAgentTool({
          ctx,
          toolName: "list_actions",
          toolInput: input,
          allowedRoles: AGENT_ACTION_ROLES,
          run: async () => {
            const rows = await prisma.action.findMany({
              where: {
                plantId: ctx.plantId,
                ...(input.status ? { status: input.status } : {}),
              },
              include: {
                ownerUser: { select: { id: true, name: true, email: true } },
                coOwners: { include: { user: { select: { id: true, name: true } } } },
                communication: { select: { id: true, type: true, status: true, codigoCompleto: true, codigoAbreviado: true } },
                sewo: { select: { id: true, status: true, codigoSewo: true } },
                smatLinks: {
                  include: {
                    smatAudit: { select: { id: true, auditorName: true, auditDate: true } },
                  },
                },
              },
              orderBy: { dueDate: "asc" },
              take: input.limit,
            });

            return rows.map((row) => ({
              id: row.id,
              sequenceNumber: row.sequenceNumber,
              sourceType: row.sourceType,
              title: row.title,
              description: row.description,
              category: row.category,
              priority: row.priority,
              status: row.status,
              dueDate: row.dueDate,
              owner: row.ownerUser,
              coOwners: row.coOwners.map((entry) => entry.user),
              communication: row.communication,
              sewo: row.sewo,
              smatAudits: row.smatLinks.map((entry) => entry.smatAudit),
            }));
          },
        }),
    }),
    tool({
      name: "create_action",
      description: "Create an action plan in the authenticated user's current plant.",
      parameters: createActionToolInput as never,
      strict: false,
      execute: async (input) =>
        runAgentTool({
          ctx,
          toolName: "create_action",
          toolInput: input,
          allowedRoles: AGENT_ACTION_ROLES,
          run: async () => {
            const payload = createActionInput.parse(input);
            await assertCreateActionReferences(ctx, payload);
            const action = await ActionService.create({
              plantId: ctx.plantId,
              actorUserId: ctx.userId,
              payload,
            });

            return {
              id: action.id,
              reusedExistingAction: action.idempotency.reusedExistingAction,
              title: action.title,
              priority: action.priority,
              status: action.status,
              dueDate: action.dueDate,
              ownerUserId: action.ownerUserId,
            };
          },
        }),
    }),
    tool({
      name: "update_action",
      description:
        "Update safe fields of an action plan in the authenticated user's current plant. This cannot close, reopen, move plants, or change linked record IDs.",
      parameters: updateActionToolInput,
      execute: async (input) =>
        runAgentTool({
          ctx,
          toolName: "update_action",
          toolInput: input,
          allowedRoles: AGENT_CONTROLLED_OPERATION_ROLES,
          run: async () => {
            const payload = parseUpdateActionToolInput(input);
            const current = await prisma.action.findFirst({
              where: {
                plantId: ctx.plantId,
                ...buildActionReferenceWhere(payload.actionId),
              },
              select: {
                id: true,
                sequenceNumber: true,
                title: true,
                description: true,
                ownerUserId: true,
                priority: true,
                category: true,
                level: true,
                dueDate: true,
                status: true,
              },
            });

            if (!current) throw new AgentToolUserError("Action not found for this plant.");
            const requestedPriority = payload.priority;
            if (requestedPriority !== undefined && requestedPriority !== current.priority) {
              if (current.status === ActionStatus.CLOSED) throw new AgentToolUserError("Action is already closed.");
              return createPriorityUpdateConfirmation(ctx, { actionId: current.id, priority: requestedPriority }, current);
            }
            if (payload.ownerUserId) await assertActionOwnerForPlant(ctx, payload.ownerUserId);

            const updatePayload = updateActionInput.safeParse({
              title: payload.title ?? current.title,
              description: payload.description ?? current.description,
              ownerUserId: payload.ownerUserId ?? current.ownerUserId,
              priority: payload.priority ?? current.priority,
              category: payload.category ?? current.category,
              level: payload.level === undefined ? current.level : payload.level,
              dueDate: payload.dueDate ?? current.dueDate,
            });

            if (!updatePayload.success) {
              throw new AgentToolUserError("A atualizacao da acao nao passou a validacao de negocio.");
            }

            const updated = await ActionService.update({
              actionId: current.id,
              actorUserId: ctx.userId,
              payload: updatePayload.data,
            });

            return {
              id: updated.id,
              sequenceNumber: updated.sequenceNumber,
              title: updated.title,
              description: updated.description,
              ownerUserId: updated.ownerUserId,
              priority: updated.priority,
              category: updated.category,
              level: updated.level,
              status: updated.status,
              dueDate: updated.dueDate,
            };
          },
        }),
    }),
    tool({
      name: "prepare_update_action_priority",
      description:
        "Prepare an action priority update. This tool always creates a pending server-side confirmation before changing the action.",
      parameters: updateActionPriorityToolInput,
      execute: async (input) => prepareUpdateActionPriorityForAgent(ctx, input),
    }),
    tool({
      name: "find_overdue_actions",
      description: "Find overdue open or ongoing action plans for the authenticated user's current plant.",
      parameters: findOverdueActionsInput,
      execute: async (input) =>
        runAgentTool({
          ctx,
          toolName: "find_overdue_actions",
          toolInput: input,
          allowedRoles: AGENT_CONTROLLED_OPERATION_ROLES,
          run: async () => {
            assertAllowedKeys(input, findOverdueAllowedKeys, "Pedido invalido para consultar acoes em atraso.");
            const parsed = findOverdueActionsInput.safeParse(input);
            if (!parsed.success) {
              throw new AgentToolUserError("Pedido invalido para consultar acoes em atraso.");
            }

            const now = new Date();
            const rows = await prisma.action.findMany({
              where: {
                plantId: ctx.plantId,
                status: { in: [ActionStatus.OPEN, ActionStatus.ONGOING] },
                dueDate: { lt: now },
              },
              select: {
                id: true,
                sequenceNumber: true,
                title: true,
                priority: true,
                status: true,
                dueDate: true,
                ownerUser: { select: { id: true, name: true } },
              },
              orderBy: { dueDate: "asc" },
              take: parsed.data.limit,
            });

            return {
              plantCode: ctx.plantCode,
              checkedAt: now.toISOString(),
              count: rows.length,
              actions: rows.map((row) => ({
                id: row.id,
                sequenceNumber: row.sequenceNumber,
                title: row.title,
                priority: row.priority,
                status: row.status,
                dueDate: row.dueDate,
                owner: row.ownerUser ? { id: row.ownerUser.id, name: row.ownerUser.name } : null,
              })),
            };
          },
        }),
    }),
    tool({
      name: "close_action",
      description: "Prepare to close an action plan. This tool always creates a pending server-side confirmation first.",
      parameters: closeActionToolInput,
      execute: async (input) => prepareCloseActionForAgent(ctx, input),
    }),
  ];
}
