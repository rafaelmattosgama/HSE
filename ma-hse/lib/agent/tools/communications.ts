import {
  ActionCategory,
  ActionPriority,
  ActionSourceType,
  CommunicationImprovementSubtype,
  CommunicationStatus,
  CommunicationType,
} from "@prisma/client";
import { tool } from "@openai/agents";
import { z } from "zod";
import {
  canManageCommunicationClassification,
  shouldDeferPublicReportNearMissType,
  shouldDeferPublicReportProfessionalRisk,
  shouldDeferPublicReportUnsafeActType,
  shouldDeferPublicReportUnsafeConditionType,
} from "@/lib/communication-classification";
import { isCommunicationLinkableStatus } from "@/lib/communication-status";
import { prisma } from "@/lib/prisma";
import {
  AGENT_COMMUNICATION_READ_ROLES,
  AGENT_COMMUNICATION_WRITE_ROLES,
  AgentToolUserError,
  type AgentToolContext,
  runAgentTool,
} from "@/lib/agent/permissions";
import { ActionService } from "@/lib/services/action-service";
import { CommunicationService } from "@/lib/services/communication-service";
import { initialStatusForCommunicationCreation } from "@/lib/services/workflow";
import { createCommunicationInput } from "@/lib/validation/dtos";

const listCommunicationsInput = z.object({
  status: z.nativeEnum(CommunicationStatus).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

const uuidSchema = { type: "string", format: "uuid" } as const;
const nullableUuidSchema = { anyOf: [uuidSchema, { type: "null" }] } as const;
const recordLevelSchema = { anyOf: [{ type: "string", enum: ["N1", "N2", "N3", "N4"] }, { type: "null" }] } as const;

const createCommunicationToolInput = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: Object.values(CommunicationType) },
    level: recordLevelSchema,
    eventDatetime: { type: "string" },
    reporterName: { type: "string", minLength: 2 },
    reporterEmployeeNo: { type: "string" },
    targetText: { type: "string" },
    targetEmployeeNo: { type: "string" },
    targetEmployeeId: nullableUuidSchema,
    involvedEmployeeIds: { type: "array", items: uuidSchema },
    shiftId: nullableUuidSchema,
    areaId: nullableUuidSchema,
    lineId: nullableUuidSchema,
    workstationId: nullableUuidSchema,
    equipmentId: nullableUuidSchema,
    riskThemeId: uuidSchema,
    unsafeActTypeId: nullableUuidSchema,
    unsafeConditionTypeId: nullableUuidSchema,
    nearMissTypeId: nullableUuidSchema,
    improvementSubtype: { anyOf: [{ type: "string", enum: Object.values(CommunicationImprovementSubtype) }, { type: "null" }] },
    description: { type: "string", minLength: 5 },
    suggestedAction: { type: "string" },
    severityPotential: { type: "string", enum: ["LOW", "MED", "HIGH"] },
    isContractor: { type: "boolean" },
    bodyPartId: nullableUuidSchema,
    injuryTypeId: nullableUuidSchema,
    isFatal: { type: "boolean" },
    initialLostDays: { type: "integer", minimum: 0 },
    hasLeave: { type: "boolean" },
    returnDate: { type: "string" },
    attachments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          fileKey: { type: "string", minLength: 3 },
          fileName: { type: "string", minLength: 1 },
          originalName: { type: "string", minLength: 1 },
          contentType: { type: "string", minLength: 3 },
          size: { type: "integer", minimum: 0 },
        },
        required: ["fileKey", "fileName", "contentType"],
      },
    },
    quickAction: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string", minLength: 3 },
        description: { type: "string", minLength: 5 },
        ownerUserId: uuidSchema,
        level: recordLevelSchema,
        priority: { type: "string", enum: Object.values(ActionPriority) },
        dueDate: { type: "string" },
      },
      required: ["title", "description", "ownerUserId", "priority"],
    },
  },
  required: ["type", "eventDatetime", "reporterName", "description"],
} as const;

export function createCommunicationTools(ctx: AgentToolContext) {
  return [
    tool({
      name: "list_communications",
      description: "List recent safety communications for the authenticated user's current plant.",
      parameters: listCommunicationsInput,
      execute: async (input) =>
        runAgentTool({
          ctx,
          toolName: "list_communications",
          toolInput: input,
          allowedRoles: AGENT_COMMUNICATION_READ_ROLES,
          run: async () => {
            const defaultStatuses = [
              CommunicationStatus.SUBMITTED,
              CommunicationStatus.PENDING_VALIDATION,
              CommunicationStatus.VALID_OPEN,
              CommunicationStatus.ONGOING,
              CommunicationStatus.CLOSED,
            ];
            const rows = await prisma.communication.findMany({
              where: {
                plantId: ctx.plantId,
                status: input.status ? input.status : { in: defaultStatuses },
              },
              include: {
                riskTheme: true,
                unsafeConditionType: true,
                nearMissType: true,
                actions: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    dueDate: true,
                  },
                },
                reporterUser: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
              orderBy: { eventDatetime: "desc" },
              take: input.limit,
            });

            const canClassify = canManageCommunicationClassification(ctx.role);
            return rows.map((row) => ({
              id: row.id,
              code: row.codigoCompleto ?? row.codigoAbreviado,
              type: row.type,
              level: row.level,
              status: row.status,
              eventDatetime: row.eventDatetime,
              reporterName: row.reporterName,
              targetText: row.targetText,
              description: row.description,
              suggestedAction: row.suggestedAction,
              riskTheme: canClassify || !shouldDeferPublicReportProfessionalRisk(row.type) ? row.riskTheme : null,
              unsafeActTypeId: canClassify || !shouldDeferPublicReportUnsafeActType(row.type) ? row.unsafeActTypeId : null,
              unsafeConditionType:
                canClassify || !shouldDeferPublicReportUnsafeConditionType(row.type) ? row.unsafeConditionType : null,
              nearMissType: canClassify || !shouldDeferPublicReportNearMissType(row.type) ? row.nearMissType : null,
              actions: row.actions,
            }));
          },
        }),
    }),
    tool({
      name: "create_communication",
      description: "Create a safety communication in the authenticated user's current plant.",
      parameters: createCommunicationToolInput as never,
      strict: false,
      execute: async (input) =>
        runAgentTool({
          ctx,
          toolName: "create_communication",
          toolInput: input,
          allowedRoles: AGENT_COMMUNICATION_WRITE_ROLES,
          run: async () => {
            const payload = createCommunicationInput.parse(input);
            const initialStatus = initialStatusForCommunicationCreation(ctx.role);
            if (payload.quickAction && !isCommunicationLinkableStatus(initialStatus)) {
              throw new AgentToolUserError("This communication must be validated before actions can be linked.");
            }

            const communication = await CommunicationService.create({
              plantId: ctx.plantId,
              payload,
              reporterUserId: ctx.userId,
              actorRole: ctx.role,
            });

            if (payload.quickAction) {
              await ActionService.create({
                plantId: ctx.plantId,
                actorUserId: ctx.userId,
                payload: {
                  sourceType: ActionSourceType.COMMUNICATION,
                  communicationId: communication.id,
                  category: ActionCategory.CORRECTIVE,
                  priority: payload.quickAction.priority,
                  title: payload.quickAction.title,
                  description: payload.quickAction.description,
                  ownerUserId: payload.quickAction.ownerUserId,
                  dueDate: payload.quickAction.dueDate,
                },
              });
            }

            return {
              id: communication.id,
              code: communication.codigoCompleto ?? communication.codigoAbreviado,
              type: communication.type,
              status: communication.status,
              eventDatetime: communication.eventDatetime,
              reporterName: communication.reporterName,
              description: communication.description,
            };
          },
        }),
    }),
  ];
}
