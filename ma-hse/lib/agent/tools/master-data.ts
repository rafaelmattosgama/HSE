import { tool } from "@openai/agents";
import { z } from "zod";
import {
  AGENT_MASTER_DATA_READ_ROLES,
  type AgentToolContext,
  runAgentTool,
} from "@/lib/agent/permissions";
import { prisma } from "@/lib/prisma";
import { ensureDefaultNearMissTypes } from "@/lib/services/near-miss-type-service";
import { ensureDefaultShifts } from "@/lib/services/shift-service";
import { ensureDefaultUnsafeActTypes } from "@/lib/services/unsafe-act-type-service";
import { ensureDefaultUnsafeConditionTypes } from "@/lib/services/unsafe-condition-type-service";

const listMasterDataInput = z.object({});

export function createMasterDataTools(ctx: AgentToolContext) {
  return [
    tool({
      name: "list_master_data",
      description: "List active master data for the authenticated user's current plant, including departments, workstations, employees and classification catalogs.",
      parameters: listMasterDataInput,
      execute: async (input) =>
        runAgentTool({
          ctx,
          toolName: "list_master_data",
          toolInput: input,
          allowedRoles: AGENT_MASTER_DATA_READ_ROLES,
          run: async () => {
            await ensureDefaultShifts(ctx.plantId);
            await ensureDefaultNearMissTypes(ctx.plantId);
            await ensureDefaultUnsafeActTypes(ctx.plantId);
            await ensureDefaultUnsafeConditionTypes(ctx.plantId);

            const [
              areas,
              lines,
              workstations,
              equipments,
              shifts,
              riskThemes,
              unsafeActTypes,
              unsafeCondTypes,
              nearMissTypes,
              bodyParts,
              injuryTypes,
              workers,
              actionOwners,
            ] = await prisma.$transaction([
              prisma.area.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
              prisma.line.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
              prisma.workstation.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
              prisma.equipment.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
              prisma.shift.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: { code: "asc" } }),
              prisma.riskTheme.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }] }),
              prisma.unsafeActType.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }] }),
              prisma.unsafeConditionType.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }, { code: "asc" }] }),
              prisma.nearMissType.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
              prisma.bodyPart.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
              prisma.injuryType.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
              prisma.employeeDirectory.findMany({ where: { plantId: ctx.plantId, isActive: true }, orderBy: [{ name: "asc" }] }),
              prisma.userPlantRole.findMany({
                where: { plantId: ctx.plantId, user: { isActive: true } },
                include: { user: { select: { id: true, name: true, email: true } }, role: true },
                orderBy: { user: { name: "asc" } },
              }),
            ]);

            return {
              areas,
              lines,
              workstations,
              equipments,
              shifts,
              riskThemes,
              unsafeActTypes,
              unsafeCondTypes,
              nearMissTypes,
              bodyParts,
              injuryTypes,
              workers,
              actionOwners: actionOwners.map((entry) => ({
                userId: entry.userId,
                name: entry.user.name,
                email: entry.user.email,
                role: entry.role.code,
              })),
            };
          },
        }),
    }),
  ];
}
