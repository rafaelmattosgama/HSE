import { IncidentKnowledgeCauseAssessment, IncidentKnowledgeReviewStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { fail, ok } from "@/lib/api";
import { INCIDENT_KNOWLEDGE_VIEW_ROLES } from "@/lib/incident-knowledge-access";
import { requirePlantAccess } from "@/lib/rbac/guards";
import { getPlantByCode } from "@/lib/plant";
import { prisma } from "@/lib/prisma";
import { createIncidentKnowledgeEmbeddings } from "@/lib/services/incident-knowledge-index-service";
import { isStandalonePersonName, sanitizeIncidentKnowledgeEmbeddingText, sanitizeIncidentKnowledgeText } from "@/lib/services/incident-knowledge-privacy";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  type: z.string().trim().max(100).optional(),
  department: z.string().trim().max(160).optional(),
  equipment: z.string().trim().max(160).optional(),
  causeCategory: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(25).default(10),
}).strict();

type VectorHit = { documentId: string; content: string; pageStart: number | null; score: number };
type SearchRecord = {
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
    workstation: string | null;
    equipment: string | null;
    operationType: string | null;
    occurrenceDescription: string | null;
    occurrenceMechanism: string | null;
    immediateCorrectiveAction: string | null;
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

function textCondition(value: string) {
  return { contains: value, mode: "insensitive" as const };
}

export async function GET(request: Request, context: { params: Promise<{ plantCode: string }> }) {
  const { plantCode } = await context.params;
  const auth = await requirePlantAccess(plantCode, INCIDENT_KNOWLEDGE_VIEW_ROLES);
  if ("error" in auth) return auth.error;

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse(Object.fromEntries(params.entries()));
  if (!parsed.success) return fail("INVALID_SEARCH", "The search filters are invalid.", 400);
  const filters = parsed.data;
  if (filters.from && filters.to && filters.from > filters.to) {
    return fail("INVALID_DATE_RANGE", "The start date must be before the end date.", 400);
  }

  const safeQuery = sanitizeIncidentKnowledgeEmbeddingText(filters.q)?.slice(0, 200) ?? "";
  const semanticQuery = isStandalonePersonName(filters.q) ? "" : safeQuery;
  const semanticSkippedForPrivacy = Boolean(safeQuery && !semanticQuery);
  if (!safeQuery && !filters.from && !filters.to && !filters.type && !filters.department && !filters.equipment && !filters.causeCategory) {
    return fail("SEARCH_TERM_REQUIRED", "Enter a search term or choose at least one filter.", 400);
  }

  const plant = await getPlantByCode(plantCode);
  const recordWhere: Prisma.IncidentKnowledgeRecordWhereInput = {};
  if (filters.department) recordWhere.department = textCondition(filters.department);
  if (filters.equipment) recordWhere.equipment = textCondition(filters.equipment);
  if (filters.causeCategory) {
    recordWhere.causes = {
      some: {
        assessmentStatus: IncidentKnowledgeCauseAssessment.CONFIRMED,
        OR: [
          { normalizedCategory: textCondition(filters.causeCategory) },
          { originalCauseLabel: textCondition(filters.causeCategory) },
          { normalizedCauseCode: textCondition(filters.causeCategory) },
          { originalCauseCode: textCondition(filters.causeCategory) },
        ],
      },
    };
  }

  const documentFilters: Prisma.IncidentKnowledgeDocumentWhereInput[] = [];
  if (filters.from || filters.to) {
    documentFilters.push({ incidentDate: {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
    } });
  }
  if (filters.type) documentFilters.push({ incidentType: textCondition(filters.type) });
  if (Object.keys(recordWhere).length) documentFilters.push({ record: { is: recordWhere } });
  const textSearchFilter: Prisma.IncidentKnowledgeDocumentWhereInput | null = safeQuery ? { OR: [
      { sourceReference: textCondition(safeQuery) },
      { incidentType: textCondition(safeQuery) },
      { record: { is: { OR: [
        { incidentCode: textCondition(safeQuery) },
        { department: textCondition(safeQuery) },
        { workstation: textCondition(safeQuery) },
        { equipment: textCondition(safeQuery) },
        { operationType: textCondition(safeQuery) },
        { occurrenceDescription: textCondition(safeQuery) },
        { occurrenceMechanism: textCondition(safeQuery) },
        { immediateCorrectiveAction: textCondition(safeQuery) },
        { lessonsLearned: textCondition(safeQuery) },
      ] } } },
      { record: { is: { causes: { some: { OR: [
        { originalCauseCode: textCondition(safeQuery) },
        { originalCauseLabel: textCondition(safeQuery) },
        { normalizedCauseCode: textCondition(safeQuery) },
        { normalizedCategory: textCondition(safeQuery) },
        { description: textCondition(safeQuery) },
      ] } } } } },
      { record: { is: { actions: { some: { description: textCondition(safeQuery) } } } } },
    ] } : null;

  const metadataWhere: Prisma.IncidentKnowledgeDocumentWhereInput = {
    archivedAt: null,
    reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
    AND: documentFilters,
  };
  const where: Prisma.IncidentKnowledgeDocumentWhereInput = textSearchFilter
    ? { ...metadataWhere, AND: [...documentFilters, textSearchFilter] }
    : metadataWhere;

  let vectorHits: VectorHit[] = [];
  let semanticUnavailable = false;
  if (semanticQuery) {
    try {
      const [queryVector] = await createIncidentKnowledgeEmbeddings([semanticQuery]);
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
        WHERE cause."incidentRecordId" = r."id"
          AND cause."assessmentStatus" = 'CONFIRMED'
          AND (cause."normalizedCategory" ILIKE ${`%${filters.causeCategory}%`}
            OR cause."originalCauseLabel" ILIKE ${`%${filters.causeCategory}%`}
            OR cause."normalizedCauseCode" ILIKE ${`%${filters.causeCategory}%`}
            OR cause."originalCauseCode" ILIKE ${`%${filters.causeCategory}%`})
      )`);

      vectorHits = await prisma.$queryRaw<VectorHit[]>(Prisma.sql`
        WITH candidate_hits AS (
          SELECT DISTINCT ON (c."documentId") c."documentId" AS "documentId", c."content" AS "content",
            c."pageStart" AS "pageStart", (1 - (c."embedding" <=> ${vector}::vector))::float8 AS "score"
          FROM "IncidentKnowledgeChunk" c
          INNER JOIN "IncidentKnowledgeDocument" d ON d."id" = c."documentId"
          INNER JOIN "IncidentKnowledgeRecord" r ON r."documentId" = d."id"
          WHERE ${Prisma.join(conditions, " AND ")}
          ORDER BY c."documentId", c."embedding" <=> ${vector}::vector
        )
        SELECT * FROM candidate_hits
        ORDER BY "score" DESC
        LIMIT ${filters.limit * 4}
      `);
      vectorHits = vectorHits.filter((hit) => hit.score >= 0.35);
    } catch {
      semanticUnavailable = true;
    }
  }

  const searchSelect: Prisma.IncidentKnowledgeDocumentSelect = {
      id: true,
      sourceType: true,
      plant: { select: { code: true, name: true } },
      incidentType: true,
      incidentDate: true,
      sourceReference: true,
      record: {
        select: {
          incidentCode: true,
          incidentDate: true,
          department: true,
          workstation: true,
          equipment: true,
          operationType: true,
          occurrenceDescription: true,
          occurrenceMechanism: true,
          immediateCorrectiveAction: true,
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
        },
      },
  };
  const textualDocuments = await prisma.incidentKnowledgeDocument.findMany({
    where,
    orderBy: [{ incidentDate: "desc" }, { createdAt: "desc" }],
    take: filters.limit * 3,
    select: searchSelect,
  }) as SearchRecord[];

  const vectorByDocument = new Map<string, VectorHit>();
  for (const hit of vectorHits) {
    const previous = vectorByDocument.get(hit.documentId);
    if (!previous || hit.score > previous.score) vectorByDocument.set(hit.documentId, hit);
  }
  const semanticDocumentIds = [...vectorByDocument.keys()];
  const vectorDocuments = semanticDocumentIds.length
    ? await prisma.incidentKnowledgeDocument.findMany({
        where: { ...metadataWhere, id: { in: semanticDocumentIds } },
        select: searchSelect,
      }) as SearchRecord[]
    : [];
  const documentById = new Map([...vectorDocuments, ...textualDocuments].map((document) => [document.id, document]));
  const resultIds = [...new Set([...vectorByDocument.keys(), ...textualDocuments.map((document) => document.id)])];
  const semanticRanks = new Map([...vectorByDocument.values()]
    .sort((left, right) => right.score - left.score)
    .map((hit, index) => [hit.documentId, index]));
  const fused = resultIds.map((id) => {
    const document = documentById.get(id);
    const semantic = vectorByDocument.get(id);
    const textIndex = textualDocuments.findIndex((item) => item.id === id);
    const semanticRank = semanticRanks.get(id) ?? -1;
    const score = (semantic ? 1 / (60 + semanticRank + 1) : 0) + (textIndex >= 0 ? 1 / (60 + textIndex + 1) : 0);
    return { id, document, semantic, textIndex, score };
  }).sort((left, right) => right.score - left.score).slice(0, filters.limit);
  const maxScore = fused[0]?.score ?? 1;

  const results = fused.flatMap((item) => {
    const document = item.document;
    const record = document?.record;
    if (!document || !record) return [];
    const summary = sanitizeIncidentKnowledgeText(record.occurrenceMechanism || record.occurrenceDescription || record.lessonsLearned) ?? "";
    const fallbackExcerpt = record.occurrenceMechanism || record.occurrenceDescription || record.lessonsLearned || "";
    const fallbackField = record.occurrenceMechanism ? "occurrenceMechanism" : record.occurrenceDescription ? "occurrenceDescription" : "lessonsLearned";
    const excerpts = item.semantic
      ? [{ text: sanitizeIncidentKnowledgeText(item.semantic.content) ?? "", page: item.semantic.pageStart }]
      : fallbackExcerpt
        ? [{ text: sanitizeIncidentKnowledgeText(fallbackExcerpt) ?? "", page: record.evidences.find((evidence) => evidence.fieldName === fallbackField)?.sourcePage ?? null }]
        : [];
    return [{
      documentId: document.id,
      sourceType: document.sourceType,
      plantCode: document.plant.code,
      plantName: document.sourceType === "HISTORICAL_PDF" ? "Base transversal" : document.plant.name,
      incidentCode: record.incidentCode,
      incidentDate: (record.incidentDate ?? document.incidentDate)?.toISOString().slice(0, 10) ?? null,
      incidentType: sanitizeIncidentKnowledgeText(document.incidentType),
      department: sanitizeIncidentKnowledgeText(record.department),
      equipment: sanitizeIncidentKnowledgeText(record.equipment),
      relevance: Math.round((item.score / maxScore) * 100),
      relevanceSources: [item.semantic ? "semantic" : null, item.textIndex >= 0 ? "text" : null].filter(Boolean),
      summary,
      excerpts,
      causes: record.causes.map((cause) => ({
        code: sanitizeIncidentKnowledgeText(cause.originalCauseCode),
        label: sanitizeIncidentKnowledgeText(cause.originalCauseLabel),
        category: sanitizeIncidentKnowledgeText(cause.normalizedCategory),
        description: sanitizeIncidentKnowledgeText(cause.description),
        assessmentStatus: cause.assessmentStatus,
        page: cause.sourcePage,
      })),
      actions: record.actions.map((action) => ({
        description: sanitizeIncidentKnowledgeText(action.description),
        type: sanitizeIncidentKnowledgeText(action.actionType),
        status: action.status,
        plannedDate: action.plannedClosureDate?.toISOString().slice(0, 10) ?? null,
        actualDate: action.actualClosureDate?.toISOString().slice(0, 10) ?? null,
        page: action.sourcePage,
      })),
      source: {
        documentId: document.id,
        reference: sanitizeIncidentKnowledgeText(document.sourceReference),
        href: `/app/corporate/knowledge-base?documentId=${encodeURIComponent(document.id)}`,
      },
    }];
  });

  await prisma.incidentKnowledgeAudit.create({
    data: {
      plantId: plant.id,
      actorUserId: auth.session.user.id,
      operation: "KNOWLEDGE_SEARCH_EXECUTED",
    changes: {
        queryProvided: Boolean(filters.q),
        filters: {
          from: filters.from ?? null,
          to: filters.to ?? null,
          type: filters.type ?? null,
          department: filters.department ?? null,
          equipment: filters.equipment ?? null,
          causeCategory: filters.causeCategory ?? null,
        },
        resultCount: results.length,
        semanticUnavailable,
        semanticSkippedForPrivacy,
      },
    },
  });

  return ok({
    results,
    semanticUnavailable,
    notice: semanticUnavailable
      ? "Semantic search is temporarily unavailable; showing text and structured matches."
      : semanticSkippedForPrivacy
        ? "Semantic search was skipped for privacy; showing local text and structured matches."
        : null,
    disclaimer: "Relevance ranks results for this query; it is not a probability or proof that incidents share a root cause.",
  });
}
