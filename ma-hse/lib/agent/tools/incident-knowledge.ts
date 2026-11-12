import {
  CommunicationStatus,
  IncidentKnowledgeCauseAssessment,
  IncidentKnowledgeReviewStatus,
  Prisma,
  RoleCode,
  SEWOStatus,
} from "@prisma/client";
import { tool } from "@openai/agents";
import { z } from "zod";
import { AgentToolUserError, type AgentToolContext, runAgentTool } from "@/lib/agent/permissions";
import { prisma } from "@/lib/prisma";
import { createIncidentKnowledgeEmbeddings } from "@/lib/services/incident-knowledge-index-service";
import { isStandalonePersonName, sanitizeIncidentKnowledgeEmbeddingText, sanitizeIncidentKnowledgeText } from "@/lib/services/incident-knowledge-privacy";

const INCIDENT_KNOWLEDGE_READ_ROLES = [RoleCode.N0_ADMIN, RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY] as const;
const searchInput = z.object({
  query: z.string().trim().min(2).max(240),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  type: z.string().trim().min(1).max(100).optional(),
  department: z.string().trim().min(1).max(160).optional(),
  equipment: z.string().trim().min(1).max(160).optional(),
  causeCategory: z.string().trim().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(10).default(5),
}).strict();
const similarInput = z.object({
  description: z.string().trim().min(10).max(4_000).optional(),
  communicationId: z.string().trim().min(1).max(80).optional(),
  sewoId: z.string().trim().min(1).max(80).optional(),
}).strict().refine((value) => [value.description, value.communicationId, value.sewoId].filter(Boolean).length === 1);
const referenceInput = z.object({
  incidentCode: z.string().trim().min(1).max(80).optional(),
  plantCode: z.string().trim().min(1).max(20).optional(),
  documentId: z.string().trim().min(1).max(80).optional(),
}).strict().refine((value) => Boolean(value.incidentCode) !== Boolean(value.documentId) && (!value.documentId || !value.plantCode));

type AgentSearchDocument = {
  id: string;
  sourceType: string;
  plant: { code: string; name: string };
  incidentType: string | null;
  incidentDate: Date | null;
  sourceReference: string | null;
  record: {
    incidentCode: string | null;
    incidentDate: Date | null;
    department: string | null;
    equipment: string | null;
    occurrenceDescription: string | null;
    occurrenceMechanism: string | null;
    lessonsLearned: string | null;
    evidences: Array<{ fieldName: string; sourcePage: number | null }>;
    causes: Array<{
      originalCauseCode: string | null;
      originalCauseLabel: string | null;
      normalizedCategory: string | null;
      description: string | null;
      assessmentStatus: IncidentKnowledgeCauseAssessment;
      sourcePage: number | null;
    }>;
    actions: Array<{
      description: string;
      actionType: string | null;
      plannedClosureDate: Date | null;
      actualClosureDate: Date | null;
      status: string;
      sourcePage: number | null;
    }>;
  } | null;
};

type KnowledgeSearchFilters = Partial<Omit<z.infer<typeof searchInput>, "query" | "limit">>
  & Pick<z.infer<typeof searchInput>, "limit">;

function textContains(value: string) {
  return { contains: value, mode: "insensitive" as const };
}

function dateIsValid(value: string | undefined) {
  if (!value) return true;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function searchApprovedKnowledge(ctx: AgentToolContext, query: string, filters: KnowledgeSearchFilters) {
  if ((filters.from && !dateIsValid(filters.from)) || (filters.to && !dateIsValid(filters.to)) || (filters.from && filters.to && filters.from > filters.to)) {
    throw new AgentToolUserError("The incident date range is invalid.");
  }

  const privateNameQuery = isStandalonePersonName(query);
  const safeQuery = privateNameQuery ? "" : sanitizeIncidentKnowledgeEmbeddingText(query)?.slice(0, 240) ?? "";
  if (privateNameQuery && !filters.from && !filters.to && !filters.type && !filters.department && !filters.equipment && !filters.causeCategory) {
    await prisma.incidentKnowledgeAudit.create({
      data: {
        plantId: ctx.plantId,
        actorUserId: ctx.userId,
        operation: "KNOWLEDGE_SEARCH_EXECUTED",
        changes: { queryProvided: true, querySkippedForPrivacy: true, resultCount: 0, source: "AGENT" },
      },
    });
    return {
      results: [],
      semanticUnavailable: false,
      notice: "Search by a standalone personal name was skipped for privacy. Use an incident code, event description, or filters.",
      disclaimer: "Relevance is a ranking for this search, not proof of a shared root cause. Confirmed causes and unconfirmed assessments are shown separately.",
    };
  }
  if (!safeQuery && !filters.from && !filters.to && !filters.type && !filters.department && !filters.equipment && !filters.causeCategory) {
    await prisma.incidentKnowledgeAudit.create({
      data: {
        plantId: ctx.plantId,
        actorUserId: ctx.userId,
        operation: "KNOWLEDGE_SEARCH_EXECUTED",
        changes: { queryProvided: Boolean(query), queryEmptyAfterPrivacyFilter: Boolean(query), resultCount: 0, source: "AGENT" },
      },
    });
    return {
      results: [],
      semanticUnavailable: false,
      notice: "No privacy-filtered search text or filters were available. Add an event description or a filter.",
      disclaimer: "Relevance is a ranking for this search, not proof of a shared root cause. Confirmed causes and unconfirmed assessments are shown separately.",
    };
  }
  const semanticQuery = safeQuery;
  let semanticUnavailable = false;
  let vectorHits: Array<{ documentId: string; content: string; pageStart: number | null; score: number }> = [];

  if (semanticQuery) {
    try {
      const [queryVector] = await createIncidentKnowledgeEmbeddings([semanticQuery], ctx.guardrails?.abortController?.signal);
      const vector = `[${queryVector.join(",")}]`;
      const conditions: Prisma.Sql[] = [
        Prisma.sql`d."archivedAt" IS NULL`,
        Prisma.sql`d."reviewStatus" = 'APPROVED'`,
        Prisma.sql`d."extractionStatus" = 'INDEXED'`,
        Prisma.sql`c."embedding" IS NOT NULL`,
      ];
      if (filters.from) conditions.push(Prisma.sql`d."incidentDate" >= ${new Date(`${filters.from}T00:00:00.000Z`)}`);
      if (filters.to) {
        const exclusiveEnd = new Date(`${filters.to}T00:00:00.000Z`);
        exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
        conditions.push(Prisma.sql`d."incidentDate" < ${exclusiveEnd}`);
      }
      if (filters.type) conditions.push(Prisma.sql`d."incidentType" ILIKE ${`%${filters.type}%`}`);
      if (filters.department) conditions.push(Prisma.sql`r."department" ILIKE ${`%${filters.department}%`}`);
      if (filters.equipment) conditions.push(Prisma.sql`r."equipment" ILIKE ${`%${filters.equipment}%`}`);
      if (filters.causeCategory) conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "IncidentKnowledgeCause" cause
        WHERE cause."incidentRecordId" = r."id" AND cause."assessmentStatus" = 'CONFIRMED'
          AND (cause."normalizedCategory" ILIKE ${`%${filters.causeCategory}%`}
            OR cause."originalCauseLabel" ILIKE ${`%${filters.causeCategory}%`}
            OR cause."normalizedCauseCode" ILIKE ${`%${filters.causeCategory}%`}
            OR cause."originalCauseCode" ILIKE ${`%${filters.causeCategory}%`})
      )`);

      vectorHits = await prisma.$queryRaw(Prisma.sql`
        WITH candidate_hits AS (
          SELECT DISTINCT ON (c."documentId") c."documentId" AS "documentId", c."content" AS "content",
            c."pageStart" AS "pageStart", (1 - (c."embedding" <=> ${vector}::vector))::float8 AS "score"
          FROM "IncidentKnowledgeChunk" c
          INNER JOIN "IncidentKnowledgeDocument" d ON d."id" = c."documentId"
          INNER JOIN "IncidentKnowledgeRecord" r ON r."documentId" = d."id"
          WHERE ${Prisma.join(conditions, " AND ")}
          ORDER BY c."documentId", c."embedding" <=> ${vector}::vector
        )
        SELECT * FROM candidate_hits ORDER BY "score" DESC LIMIT ${filters.limit * 3}
      `);
      vectorHits = (vectorHits as typeof vectorHits).filter((hit) => hit.score >= 0.35);
    } catch {
      semanticUnavailable = true;
    }
  }

  const recordWhere: Prisma.IncidentKnowledgeRecordWhereInput = {};
  if (filters.department) recordWhere.department = textContains(filters.department);
  if (filters.equipment) recordWhere.equipment = textContains(filters.equipment);
  if (filters.causeCategory) {
    recordWhere.causes = {
      some: {
        assessmentStatus: IncidentKnowledgeCauseAssessment.CONFIRMED,
        OR: [
          { normalizedCategory: textContains(filters.causeCategory) },
          { originalCauseLabel: textContains(filters.causeCategory) },
          { normalizedCauseCode: textContains(filters.causeCategory) },
          { originalCauseCode: textContains(filters.causeCategory) },
        ],
      },
    };
  }
  const metadataFilters: Prisma.IncidentKnowledgeDocumentWhereInput[] = [];
  if (filters.from || filters.to) metadataFilters.push({ incidentDate: {
    ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
    ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
  } });
  if (filters.type) metadataFilters.push({ incidentType: textContains(filters.type) });
  if (Object.keys(recordWhere).length) metadataFilters.push({ record: { is: recordWhere } });

  const textFilter: Prisma.IncidentKnowledgeDocumentWhereInput | null = safeQuery ? { OR: [
    { incidentType: textContains(safeQuery) },
    { sourceReference: textContains(safeQuery) },
    { record: { is: { OR: [
      { incidentCode: textContains(safeQuery) },
      { department: textContains(safeQuery) },
      { equipment: textContains(safeQuery) },
      { occurrenceDescription: textContains(safeQuery) },
      { occurrenceMechanism: textContains(safeQuery) },
      { lessonsLearned: textContains(safeQuery) },
    ] } } },
    { record: { is: { causes: { some: { OR: [
      { originalCauseCode: textContains(safeQuery) },
      { originalCauseLabel: textContains(safeQuery) },
      { normalizedCategory: textContains(safeQuery) },
      { description: textContains(safeQuery) },
    ] } } } } },
    { record: { is: { actions: { some: { description: textContains(safeQuery) } } } } },
  ] } : null;

  const metadataWhere: Prisma.IncidentKnowledgeDocumentWhereInput = {
    archivedAt: null,
    reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
    AND: metadataFilters,
  };
  const textualDocuments = await prisma.incidentKnowledgeDocument.findMany({
    where: textFilter ? { ...metadataWhere, AND: [...metadataFilters, textFilter] } : metadataWhere,
    orderBy: [{ incidentDate: "desc" }, { createdAt: "desc" }],
    take: filters.limit * 3,
    select: {
      id: true,
      sourceType: true,
      plant: { select: { code: true, name: true } },
      incidentType: true,
      incidentDate: true,
      sourceReference: true,
      record: { select: {
        incidentCode: true,
        incidentDate: true,
        department: true,
        equipment: true,
        occurrenceDescription: true,
        occurrenceMechanism: true,
        lessonsLearned: true,
        evidences: { select: { fieldName: true, sourcePage: true } },
        causes: { select: {
          originalCauseCode: true,
          originalCauseLabel: true,
          normalizedCategory: true,
          description: true,
          assessmentStatus: true,
          sourcePage: true,
        } },
        actions: { select: {
          description: true,
          actionType: true,
          plannedClosureDate: true,
          actualClosureDate: true,
          status: true,
          sourcePage: true,
        } },
      } },
    },
  }) as AgentSearchDocument[];

  const vectorByDocument = new Map<string, (typeof vectorHits)[number]>();
  for (const hit of vectorHits) {
    const previous = vectorByDocument.get(hit.documentId);
    if (!previous || hit.score > previous.score) vectorByDocument.set(hit.documentId, hit);
  }
  const vectorIds = [...vectorByDocument.keys()];
  const vectorDocuments = vectorIds.length ? await prisma.incidentKnowledgeDocument.findMany({
    where: { ...metadataWhere, id: { in: vectorIds } },
    select: {
      id: true,
      sourceType: true,
      plant: { select: { code: true, name: true } },
      incidentType: true,
      incidentDate: true,
      sourceReference: true,
      record: { select: {
        incidentCode: true,
        incidentDate: true,
        department: true,
        equipment: true,
        occurrenceDescription: true,
        occurrenceMechanism: true,
        lessonsLearned: true,
        evidences: { select: { fieldName: true, sourcePage: true } },
        causes: { select: {
          originalCauseCode: true,
          originalCauseLabel: true,
          normalizedCategory: true,
          description: true,
          assessmentStatus: true,
          sourcePage: true,
        } },
        actions: { select: {
          description: true,
          actionType: true,
          plannedClosureDate: true,
          actualClosureDate: true,
          status: true,
          sourcePage: true,
        } },
      } },
    },
  }) as AgentSearchDocument[] : [];
  const docs = new Map([...vectorDocuments, ...textualDocuments].map((doc) => [doc.id, doc]));
  const textRanks = new Map(textualDocuments.map((doc, index) => [doc.id, index]));
  const semanticRanks = new Map([...vectorByDocument.values()].sort((a, b) => b.score - a.score).map((hit, index) => [hit.documentId, index]));
  const combined = [...new Set([...vectorByDocument.keys(), ...textRanks.keys()])].map((id) => {
    const semanticRank = semanticRanks.get(id);
    const textRank = textRanks.get(id);
    const score = (semanticRank === undefined ? 0 : 1 / (61 + semanticRank)) + (textRank === undefined ? 0 : 1 / (61 + textRank));
    return { id, score, semantic: vectorByDocument.get(id), doc: docs.get(id) };
  }).sort((a, b) => b.score - a.score).slice(0, filters.limit);
  const maxScore = combined[0]?.score ?? 1;
  const results = combined.flatMap((item) => {
    const doc = item.doc;
    const record = doc?.record;
    if (!doc || !record) return [];
    const excerpt = item.semantic?.content || record.occurrenceMechanism || record.occurrenceDescription || record.lessonsLearned || "";
    const page = item.semantic?.pageStart ?? record.evidences.find((evidence) => evidence.fieldName === "occurrenceMechanism")?.sourcePage
      ?? record.evidences.find((evidence) => evidence.fieldName === "occurrenceDescription")?.sourcePage
      ?? null;
    return [{
      incidentCode: record.incidentCode,
      sourceType: doc.sourceType,
      plantCode: doc.sourceType === "HISTORICAL_PDF" ? null : doc.plant.code,
      plantName: doc.sourceType === "HISTORICAL_PDF" ? "Shared knowledge base" : doc.plant.name,
      incidentDate: (record.incidentDate ?? doc.incidentDate)?.toISOString().slice(0, 10) ?? null,
      incidentType: sanitizeIncidentKnowledgeText(doc.incidentType),
      department: sanitizeIncidentKnowledgeText(record.department),
      equipment: sanitizeIncidentKnowledgeText(record.equipment),
      relevance: Math.round(item.score / maxScore * 100),
      excerpt: sanitizeIncidentKnowledgeText(excerpt),
      page,
      confirmedCauses: record.causes.filter((cause) => cause.assessmentStatus === IncidentKnowledgeCauseAssessment.CONFIRMED).map((cause) => ({
        code: sanitizeIncidentKnowledgeText(cause.originalCauseCode),
        label: sanitizeIncidentKnowledgeText(cause.originalCauseLabel),
        page: cause.sourcePage,
      })),
      otherCauses: record.causes.filter((cause) => cause.assessmentStatus !== IncidentKnowledgeCauseAssessment.CONFIRMED).map((cause) => ({
        code: sanitizeIncidentKnowledgeText(cause.originalCauseCode),
        label: sanitizeIncidentKnowledgeText(cause.originalCauseLabel),
        assessmentStatus: cause.assessmentStatus,
        page: cause.sourcePage,
      })),
      actions: record.actions.map((action) => ({
        description: sanitizeIncidentKnowledgeText(action.description),
        status: action.status,
        plannedDate: action.plannedClosureDate?.toISOString().slice(0, 10) ?? null,
        actualDate: action.actualClosureDate?.toISOString().slice(0, 10) ?? null,
        page: action.sourcePage,
      })),
      lessonsLearned: sanitizeIncidentKnowledgeText(record.lessonsLearned),
      sourceUrl: ctx.role === RoleCode.N0_ADMIN ? `/app/corporate/knowledge-base?documentId=${encodeURIComponent(doc.id)}` : null,
    }];
  });

  await prisma.incidentKnowledgeAudit.create({
    data: {
      plantId: ctx.plantId,
      actorUserId: ctx.userId,
      operation: "KNOWLEDGE_SEARCH_EXECUTED",
      changes: {
        queryProvided: Boolean(query),
        filters: { from: filters.from ?? null, to: filters.to ?? null, type: filters.type ?? null, department: filters.department ?? null, equipment: filters.equipment ?? null, causeCategory: filters.causeCategory ?? null },
        resultCount: results.length,
        semanticUnavailable,
        source: "AGENT",
      },
    },
  });

  return {
    results,
    semanticUnavailable,
    notice: privateNameQuery ? "The standalone personal name was skipped for privacy; results use the remaining filters only." : null,
    disclaimer: "Relevance is a ranking for this search, not proof of a shared root cause. Confirmed causes and unconfirmed assessments are shown separately.",
  };
}

async function findApprovedIncident(ctx: AgentToolContext, input: z.infer<typeof referenceInput>) {
  const documents = await prisma.incidentKnowledgeDocument.findMany({
    where: {
      archivedAt: null,
      reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
      ...(input.documentId
        ? { id: input.documentId }
        : {
            record: { is: { incidentCode: input.incidentCode } },
            ...(input.plantCode ? { plant: { is: { code: input.plantCode } } } : {}),
          }),
    },
    select: {
      id: true,
      sourceType: true,
      plant: { select: { code: true, name: true } },
      sourceReference: true,
      incidentDate: true,
      incidentType: true,
      record: { select: {
        incidentCode: true,
        department: true,
        equipment: true,
        lessonsLearned: true,
        evidences: { select: { fieldName: true, sourcePage: true } },
        causes: { select: {
          originalCauseCode: true,
          originalCauseLabel: true,
          normalizedCategory: true,
          description: true,
          assessmentStatus: true,
          sourcePage: true,
        } },
        actions: { select: {
          description: true,
          actionType: true,
          plannedClosureDate: true,
          actualClosureDate: true,
          status: true,
          sourcePage: true,
        } },
      } },
    },
    take: 2,
  });
  if (!input.documentId && !input.plantCode && documents.length > 1) {
    throw new AgentToolUserError("That S-EWO code exists in more than one plant. Specify its plantCode or use the documentId.");
  }
  const document = documents[0];
  if (!document?.record) throw new AgentToolUserError("No approved historical incident matched that reference in the shared knowledge base.");
  return document;
}

function incidentCitation(ctx: AgentToolContext, document: { id: string; sourceType: string; sourceReference: string | null; incidentType: string | null; incidentDate: Date | null; plant: { code: string; name: string }; record: { incidentCode: string | null } | null }) {
  return {
    code: document.record?.incidentCode ?? document.sourceReference,
    sourceType: document.sourceType,
    plantCode: document.sourceType === "HISTORICAL_PDF" ? null : document.plant.code,
    plantName: document.sourceType === "HISTORICAL_PDF" ? "Shared knowledge base" : document.plant.name,
    type: sanitizeIncidentKnowledgeText(document.incidentType),
    date: document.incidentDate?.toISOString().slice(0, 10) ?? null,
    sourceUrl: ctx.role === RoleCode.N0_ADMIN ? `/app/corporate/knowledge-base?documentId=${encodeURIComponent(document.id)}` : null,
  };
}

export function createIncidentKnowledgeTools(ctx: AgentToolContext) {
  return [
    tool({
      name: "search_historical_incidents",
      description: "Search approved historical S-EWO reports across all plants in the shared knowledge base. Use natural language and optional date, type, department, equipment and confirmed cause filters. Return documented facts with S-EWO, source plant and page references.",
      parameters: searchInput,
      execute: async (input) => runAgentTool({
        ctx,
        toolName: "search_historical_incidents",
        toolInput: { queryLength: input.query.length, from: input.from, to: input.to, type: input.type, department: input.department, equipment: input.equipment, causeCategory: input.causeCategory, limit: input.limit },
        allowedRoles: INCIDENT_KNOWLEDGE_READ_ROLES,
        run: () => searchApprovedKnowledge(ctx, input.query, input),
      }),
    }),
    tool({
      name: "find_similar_incidents",
      description: "Find possible similar approved historical incidents across all plants from a description, a validated safety communication, or an approved S-EWO in the current plant. Similarity does not prove that causes are the same; include the source plant.",
      parameters: similarInput,
      execute: async (input) => runAgentTool({
        ctx,
        toolName: "find_similar_incidents",
        toolInput: { communicationId: input.communicationId, sewoId: input.sewoId, descriptionLength: input.description?.length ?? null },
        allowedRoles: INCIDENT_KNOWLEDGE_READ_ROLES,
        run: async () => {
          let query = input.description;
          let sourceReference: { type: string; code: string | null } | null = null;
          if (input.communicationId) {
            const communication = await prisma.communication.findFirst({
              where: {
                plantId: ctx.plantId,
                status: { in: [CommunicationStatus.VALID_OPEN, CommunicationStatus.ONGOING, CommunicationStatus.CLOSED] },
                OR: [{ id: input.communicationId }, { codigoCompleto: input.communicationId }, { codigoAbreviado: input.communicationId }],
              },
              select: { id: true, type: true, description: true, codigoCompleto: true, codigoAbreviado: true },
            });
            if (!communication) throw new AgentToolUserError("No validated communication matched that reference in this plant.");
            query = `${communication.type}: ${communication.description}`;
            sourceReference = { type: "safety communication", code: communication.codigoCompleto ?? communication.codigoAbreviado };
          }
          if (input.sewoId) {
            const sewo = await prisma.sEWO.findFirst({
              where: {
                plantId: ctx.plantId,
                deletedAt: null,
                status: { in: [SEWOStatus.APPROVED, SEWOStatus.CLOSED] },
                OR: [{ id: input.sewoId }, { codigoSewo: input.sewoId }],
              },
              select: { id: true, codigoSewo: true, eventClassification: true, whatText: true, whereText: true },
            });
            if (!sewo) throw new AgentToolUserError("No approved S-EWO matched that reference in this plant.");
            query = `${sewo.eventClassification ?? "Safety incident"}. ${sewo.whatText ?? ""} ${sewo.whereText ?? ""}`;
            sourceReference = { type: "S-EWO", code: sewo.codigoSewo };
          }
          const result = await searchApprovedKnowledge(ctx, query ?? "", { limit: 5 });
          return { searchedSource: sourceReference, ...result };
        },
      }),
    }),
    tool({
      name: "get_incident_root_causes",
      description: "Get the original cause assessments for one approved historical incident. Use documentId, or incidentCode with plantCode if needed to disambiguate across plants. Keep CONFIRMED causes separate from REJECTED and UNCERTAIN assessments, and cite the page.",
      parameters: referenceInput,
      execute: async (input) => runAgentTool({
        ctx,
        toolName: "get_incident_root_causes",
        toolInput: input,
        allowedRoles: INCIDENT_KNOWLEDGE_READ_ROLES,
        run: async () => {
          const document = await findApprovedIncident(ctx, input);
          const causes = document.record!.causes.map((cause) => ({
            code: sanitizeIncidentKnowledgeText(cause.originalCauseCode),
            label: sanitizeIncidentKnowledgeText(cause.originalCauseLabel),
            category: sanitizeIncidentKnowledgeText(cause.normalizedCategory),
            description: sanitizeIncidentKnowledgeText(cause.description),
            assessmentStatus: cause.assessmentStatus,
            page: cause.sourcePage,
          }));
          return {
            incident: incidentCitation(ctx, document),
            confirmedRootCauses: causes.filter((cause) => cause.assessmentStatus === IncidentKnowledgeCauseAssessment.CONFIRMED),
            otherAssessments: causes.filter((cause) => cause.assessmentStatus !== IncidentKnowledgeCauseAssessment.CONFIRMED),
          };
        },
      }),
    }),
    tool({
      name: "get_incident_corrective_actions",
      description: "Get documented corrective or preventive actions for one approved historical incident. Use documentId, or incidentCode with plantCode if needed to disambiguate across plants. Keep planned and actual closure dates separate from action status.",
      parameters: referenceInput,
      execute: async (input) => runAgentTool({
        ctx,
        toolName: "get_incident_corrective_actions",
        toolInput: input,
        allowedRoles: INCIDENT_KNOWLEDGE_READ_ROLES,
        run: async () => {
          const document = await findApprovedIncident(ctx, input);
          return {
            incident: incidentCitation(ctx, document),
            actions: document.record!.actions.map((action) => ({
              description: sanitizeIncidentKnowledgeText(action.description),
              type: sanitizeIncidentKnowledgeText(action.actionType),
              status: action.status,
              plannedClosureDate: action.plannedClosureDate?.toISOString().slice(0, 10) ?? null,
              actualClosureDate: action.actualClosureDate?.toISOString().slice(0, 10) ?? null,
              page: action.sourcePage,
            })),
          };
        },
      }),
    }),
    tool({
      name: "get_incident_lessons_learned",
      description: "Get lessons learned recorded for one approved historical incident. Use documentId, or incidentCode with plantCode if needed to disambiguate across plants. Cite its source page when available.",
      parameters: referenceInput,
      execute: async (input) => runAgentTool({
        ctx,
        toolName: "get_incident_lessons_learned",
        toolInput: input,
        allowedRoles: INCIDENT_KNOWLEDGE_READ_ROLES,
        run: async () => {
          const document = await findApprovedIncident(ctx, input);
          return {
            incident: incidentCitation(ctx, document),
            lesson: sanitizeIncidentKnowledgeText(document.record!.lessonsLearned),
            page: document.record!.evidences.find((evidence) => evidence.fieldName === "lessonsLearned")?.sourcePage ?? null,
          };
        },
      }),
    }),
  ];
}
