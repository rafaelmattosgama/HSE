import { SEWOStatus } from "@prisma/client";
import { tool } from "@openai/agents";
import { z } from "zod";
import {
  AGENT_SEWO_READ_ROLES,
  type AgentToolContext,
  runAgentTool,
} from "@/lib/agent/permissions";
import { prisma } from "@/lib/prisma";

const listSewoInput = z.object({
  status: z.nativeEnum(SEWOStatus).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

export function createSewoTools(ctx: AgentToolContext) {
  return [
    tool({
      name: "list_sewo",
      description: "List recent S-EWO records for the authenticated user's current plant.",
      parameters: listSewoInput,
      execute: async (input) =>
        runAgentTool({
          ctx,
          toolName: "list_sewo",
          toolInput: input,
          allowedRoles: AGENT_SEWO_READ_ROLES,
          run: async () => {
            const rows = await prisma.sEWO.findMany({
              where: {
                plantId: ctx.plantId,
                deletedAt: null,
                ...(input.status ? { status: input.status } : {}),
              },
              include: {
                communication: { select: { id: true, type: true, status: true, codigoCompleto: true, codigoAbreviado: true } },
                causeSelections: {
                  include: {
                    causeItem: { select: { id: true, label: true } },
                  },
                },
                actionLinks: {
                  include: {
                    action: { select: { id: true, title: true, status: true } },
                  },
                },
              },
              orderBy: { createdAt: "desc" },
              take: input.limit,
            });

            return rows.map((row) => ({
              id: row.id,
              code: row.codigoSewo,
              status: row.status,
              eventClassification: row.eventClassification,
              analysisDate: row.analysisDate,
              whatText: row.whatText,
              whereText: row.whereText,
              whoText: row.whoText,
              communication: row.communication,
              rootCauses: row.causeSelections
                .filter((entry) => entry.selected && entry.isRootCause)
                .map((entry) => ({
                  causeItemId: entry.causeItemId,
                  label: entry.causeItem.label,
                  comment: entry.comment,
                })),
              actions: row.actionLinks.map((entry) => entry.action),
            }));
          },
        }),
    }),
  ];
}
