import { createHash } from "node:crypto";
import {
  ActionStatus,
  IncidentKnowledgeActionStatus,
  IncidentKnowledgeCauseAssessment,
  IncidentKnowledgeEvidenceStatus,
  IncidentKnowledgeExtractionStatus,
  IncidentKnowledgeReviewStatus,
  IncidentKnowledgeSourceType,
  Prisma,
  SEWOStatus,
} from "@prisma/client";
import { getReadableSewoCode } from "@/lib/record-code";
import { formatSewoOccurrenceType, getSewoTemplateRecord } from "@/lib/services/sewo-validation-service";
import { sanitizeIncidentKnowledgeEmbeddingText, sanitizeIncidentKnowledgeText } from "@/lib/services/incident-knowledge-privacy";
import { prisma } from "@/lib/prisma";

const ACTION_STATUS_MAP: Record<ActionStatus, IncidentKnowledgeActionStatus> = {
  [ActionStatus.OPEN]: IncidentKnowledgeActionStatus.PLANNED,
  [ActionStatus.ONGOING]: IncidentKnowledgeActionStatus.IN_PROGRESS,
  [ActionStatus.CLOSED]: IncidentKnowledgeActionStatus.COMPLETED,
};

const TYPE_ALIASES: Record<string, string[]> = {
  UA: ["unsafeact"],
  UC: ["unsafecondition"],
  NM: ["nearmiss"],
  FA: ["firstaid"],
  IN: ["accident", "injury"],
  "5S": ["5s"],
  IMP: ["improvement"],
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown) {
  return typeof value === "string" ? sanitizeIncidentKnowledgeEmbeddingText(value) : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compact(value: string | null | undefined) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

function hasNumberToken(text: string, value: number) {
  const padded = String(value).padStart(2, "0");
  const pattern = new RegExp(`(?:^|\\D)0?${value}(?:\\D|$)`);
  return text.includes(padded) || pattern.test(text);
}

function documentDateMatchesMonth(document: { incidentDate: Date | null; record: { incidentDate: Date | null } | null }, sewo: CurrentSewo) {
  const sourceDate = document.record?.incidentDate ?? document.incidentDate;
  if (!sourceDate) return false;
  return sourceDate.getUTCFullYear() === sewo.analysisDate.getUTCFullYear()
    && sourceDate.getUTCMonth() === sewo.analysisDate.getUTCMonth();
}

function matchesHistoricalReference(document: {
  incidentDate: Date | null;
  incidentType: string | null;
  sourceReference: string | null;
  originalFilename: string | null;
  record: { incidentCode: string | null; incidentDate: Date | null } | null;
}, sewo: CurrentSewo) {
  if (!documentDateMatchesMonth(document, sewo) || !sewo.numeroSequencial) return false;

  const text = `${document.sourceReference ?? ""} ${document.originalFilename ?? ""} ${document.record?.incidentCode ?? ""}`;
  const flat = compact(text);
  const plantCode = compact(sewo.plant.code || sewo.codigoFabrica);
  const code = sewo.tipo?.toUpperCase() ?? "";
  const aliases = TYPE_ALIASES[code] ?? [compact(document.incidentType)];
  const hasType = aliases.some((alias) => alias && flat.includes(compact(alias)));
  return Boolean(plantCode)
    && flat.includes(plantCode)
    && flat.includes(String(sewo.analysisDate.getUTCFullYear()))
    && hasNumberToken(text, sewo.numeroSequencial)
    && hasType;
}

function causeRows(sewo: CurrentSewo) {
  const template = getSewoTemplateRecord(sewo.templateData);
  const rootDetails = Array.isArray(template.rootCauseDetails)
    ? template.rootCauseDetails.filter(isPlainRecord).flatMap((entry) => {
        const label = getString(entry.label);
        if (!label) return [];
        return [{
          originalCauseCode: null,
          originalCauseLabel: safeText(label),
          originalTaxonomyVersion: String(sewo.causeCatalogVersion.version),
          normalizedCauseCode: null,
          normalizedCategory: null,
          description: safeText(getString(entry.comment)),
          assessmentStatus: entry.isRootCause === true
            ? IncidentKnowledgeCauseAssessment.CONFIRMED
            : IncidentKnowledgeCauseAssessment.UNCERTAIN,
          sourcePage: null,
          sourceSection: "Approved S-EWO root cause analysis",
        }];
      })
    : [];

  if (rootDetails.length) return rootDetails;

  return sewo.causeSelections.filter((selection) => selection.selected).map((selection) => ({
    originalCauseCode: null,
    originalCauseLabel: safeText(selection.causeItem.label),
    originalTaxonomyVersion: String(sewo.causeCatalogVersion.version),
    normalizedCauseCode: null,
    normalizedCategory: safeText(selection.causeItem.category.name),
    description: safeText(selection.comment),
    assessmentStatus: selection.isRootCause
      ? IncidentKnowledgeCauseAssessment.CONFIRMED
      : IncidentKnowledgeCauseAssessment.UNCERTAIN,
    sourcePage: null,
    sourceSection: "Approved S-EWO cause selection",
  }));
}

function actionRows(sewo: CurrentSewo) {
  const actions = new Map<string, CurrentSewo["actions"][number]>();
  sewo.actions.forEach((action) => actions.set(action.id, action));
  sewo.actionLinks.forEach(({ action }) => actions.set(action.id, action));
  return [...actions.values()].map((action) => ({
    description: [safeText(action.title), safeText(action.description)].filter(Boolean).join(" — "),
    actionType: action.category,
    responsible: null,
    plannedClosureDate: action.dueDate,
    actualClosureDate: action.closedAt,
    status: ACTION_STATUS_MAP[action.status],
    sourcePage: null,
    sourceSection: "Approved S-EWO linked action",
    linkedActionId: action.id,
  })).filter((action) => action.description.trim().length > 0);
}

function toKnowledgeFields(sewo: CurrentSewo) {
  const template = getSewoTemplateRecord(sewo.templateData);
  const incidentCode = getReadableSewoCode(sewo);
  const incidentType = formatSewoOccurrenceType({
    communicationType: sewo.communication?.type,
    templateEventType: template.eventType,
    eventClassification: sewo.eventClassification,
  });
  const department = getString(template.involvedWorkerDepartment);
  const workstation = getString(template.whereText) ?? sewo.whereText ?? sewo.communication?.workstation?.name ?? sewo.communication?.area?.name ?? sewo.area?.name ?? sewo.line?.name;
  const equipment = sewo.whichText || sewo.communication?.equipment?.name || null;
  const operationType = sewo.eventClassification || getString(template.eventType);
  const occurrenceDescription = sewo.communication?.description ?? null;
  const occurrenceMechanism = sewo.howText;
  const immediateCorrectiveAction = sewo.immediateCorrectiveActionText;
  const causes = causeRows(sewo);
  const actions = actionRows(sewo);
  const evidenceValues = [
    ["incidentCode", incidentCode],
    ["incidentDate", sewo.analysisDate.toISOString().slice(0, 10)],
    ["department", department],
    ["workstation", workstation],
    ["equipment", equipment],
    ["operationType", operationType],
    ["occurrenceDescription", occurrenceDescription],
    ["occurrenceMechanism", occurrenceMechanism],
    ["immediateCorrectiveAction", immediateCorrectiveAction],
    ...causes.map((cause, index) => [`cause-${index + 1}`, [cause.originalCauseLabel, cause.description].filter(Boolean).join(" — ")]),
    ...actions.map((action, index) => [`action-${index + 1}`, action.description]),
  ] as Array<[string, string | null]>;

  return {
    incidentCode,
    incidentType: sanitizeIncidentKnowledgeText(incidentType),
    incidentDate: sewo.analysisDate,
    department: safeText(department),
    workstation: safeText(workstation),
    equipment: safeText(equipment),
    shift: safeText(sewo.shift?.name),
    operationType: safeText(operationType),
    occurrenceDescription: safeText(occurrenceDescription),
    occurrenceMechanism: safeText(occurrenceMechanism),
    injuryType: null,
    bodyPart: null,
    consequence: null,
    immediateCorrectiveAction: safeText(immediateCorrectiveAction),
    lessonsLearned: null,
    previousRelatedOccurrences: null,
    sifPsifClassification: safeText(isPlainRecord(template.sifPsifDecision) ? getString(template.sifPsifDecision.result) : null),
    causes,
    actions,
    evidence: evidenceValues.flatMap(([fieldName, value]) => {
      const extractedValue = safeText(value);
      return extractedValue ? [{
        fieldName,
        extractedValue,
        supportingExcerpt: extractedValue,
        sourcePage: null,
        sourceSection: "Approved S-EWO operational record",
        confidence: 1,
        validationStatus: IncidentKnowledgeEvidenceStatus.CONFIRMED,
      }] : [];
    }),
  };
}

function fingerprintKnowledgeFields(fields: ReturnType<typeof toKnowledgeFields>) {
  return createHash("sha256").update(JSON.stringify(fields)).digest("hex");
}

function auditFingerprint(changes: Prisma.JsonValue | null | undefined) {
  if (!isPlainRecord(changes) || typeof changes.sourceFingerprint !== "string") return null;
  return changes.sourceFingerprint;
}

function isKnowledgeEligible(sewo: { status: SEWOStatus; approvedAt: Date | null; approvedByUserId: string | null; deletedAt: Date | null }) {
  return !sewo.deletedAt
    && (sewo.status === SEWOStatus.APPROVED || sewo.status === SEWOStatus.CLOSED)
    && Boolean(sewo.approvedAt || sewo.approvedByUserId);
}

const SEWO_INCLUDE = {
  plant: { select: { code: true } },
  communication: { select: {
    type: true,
    description: true,
    area: { select: { name: true } },
    workstation: { select: { name: true } },
    equipment: { select: { name: true } },
  } },
  area: { select: { name: true } },
  line: { select: { name: true } },
  shift: { select: { name: true } },
  causeCatalogVersion: { select: { version: true } },
  causeSelections: { select: {
    selected: true,
    isRootCause: true,
    comment: true,
    causeItem: { select: { label: true, category: { select: { name: true } } } },
  } },
  actions: { select: { id: true, title: true, description: true, category: true, status: true, dueDate: true, closedAt: true } },
  actionLinks: { select: { action: { select: { id: true, title: true, description: true, category: true, status: true, dueDate: true, closedAt: true } } } },
} satisfies Prisma.SEWOInclude;

type CurrentSewo = Prisma.SEWOGetPayload<{ include: typeof SEWO_INCLUDE }>;

async function findHistoricalDuplicate(sewo: CurrentSewo) {
  const year = sewo.analysisDate.getUTCFullYear();
  const monthStart = new Date(Date.UTC(year, sewo.analysisDate.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(year, sewo.analysisDate.getUTCMonth() + 1, 1));
  const code = getReadableSewoCode(sewo);
  const historical = await prisma.incidentKnowledgeDocument.findMany({
    where: {
      plantId: sewo.plantId,
      sourceType: IncidentKnowledgeSourceType.HISTORICAL_PDF,
      reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
      archivedAt: null,
      OR: [
        { sourceReference: code },
        { originalFilename: code },
        { record: { is: { incidentCode: code } } },
        { incidentDate: { gte: monthStart, lt: nextMonth } },
        { record: { is: { incidentDate: { gte: monthStart, lt: nextMonth } } } },
      ],
    },
    select: {
      id: true,
      incidentDate: true,
      incidentType: true,
      sourceReference: true,
      originalFilename: true,
      extractionStatus: true,
      record: { select: { incidentCode: true, incidentDate: true } },
    },
    take: 500,
  });

  const exactCode = compact(code);
  const exactMatches = historical.filter((document) => [document.sourceReference, document.originalFilename, document.record?.incidentCode]
    .some((reference) => reference && compact(reference) === exactCode));
  const candidates = exactMatches.length
    ? exactMatches
    : historical.filter((document) => matchesHistoricalReference(document, sewo));
  if (candidates.length === 1) return { document: candidates[0], ambiguous: false };
  return { document: null, ambiguous: candidates.length > 1 };
}

export async function revokeSewoIncidentKnowledge(sewoId: string, plantId: string, actorUserId?: string | null) {
  const document = await prisma.incidentKnowledgeDocument.findFirst({
    where: { sourceSewoId: sewoId, plantId },
    select: { id: true, sourceType: true, reviewStatus: true, extractionStatus: true },
  });
  if (!document) return false;

  // A linked historical PDF has its own HSE approval; a later operational S-EWO decision must not revoke it.
  if (document.sourceType === IncidentKnowledgeSourceType.HISTORICAL_PDF) return false;

  const revokedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const current = await tx.incidentKnowledgeDocument.findFirst({
      where: { id: document.id, plantId, sourceSewoId: sewoId, sourceType: IncidentKnowledgeSourceType.CURRENT_SEWO },
      select: { id: true, reviewStatus: true, extractionStatus: true },
    });
    if (!current) return;

    await tx.incidentKnowledgeChunk.deleteMany({ where: { documentId: current.id, plantId } });
    await tx.incidentKnowledgeDocument.update({
      where: { id: current.id },
      data: {
        reviewStatus: IncidentKnowledgeReviewStatus.REJECTED,
        extractionStatus: IncidentKnowledgeExtractionStatus.REJECTED,
        indexedAt: null,
        archivedAt: revokedAt,
      },
    });
    await tx.incidentKnowledgeAudit.create({
      data: {
        plantId,
        documentId: current.id,
        actorUserId: actorUserId ?? null,
        operation: "CURRENT_SEWO_PUBLICATION_REVOKED",
        changes: { reviewStatus: IncidentKnowledgeReviewStatus.REJECTED, archivedAt: revokedAt.toISOString() },
        stateBefore: { reviewStatus: current.reviewStatus, extractionStatus: current.extractionStatus },
        stateAfter: { reviewStatus: IncidentKnowledgeReviewStatus.REJECTED, extractionStatus: IncidentKnowledgeExtractionStatus.REJECTED },
      },
    });
  });
  return true;
}

export async function synchronizeApprovedSewoToIncidentKnowledge(input: { sewoId: string; plantId: string; actorUserId?: string | null }) {
  const sewo = await prisma.sEWO.findFirst({
    where: { id: input.sewoId, plantId: input.plantId },
    include: SEWO_INCLUDE,
  }) as CurrentSewo | null;
  if (!sewo || !isKnowledgeEligible(sewo)) {
    await revokeSewoIncidentKnowledge(input.sewoId, input.plantId, input.actorUserId ?? sewo?.approvedByUserId);
    return { documentId: null, shouldIndex: false, reason: sewo ? "not_approved" : "missing" };
  }

  const existingSource = await prisma.incidentKnowledgeDocument.findFirst({
    where: { sourceSewoId: sewo.id, plantId: sewo.plantId },
    select: { id: true, sourceType: true, reviewStatus: true, archivedAt: true, extractionStatus: true, documentVersion: true },
  });
  if (existingSource?.sourceType === IncidentKnowledgeSourceType.HISTORICAL_PDF) {
    if (existingSource.reviewStatus !== IncidentKnowledgeReviewStatus.APPROVED || existingSource.archivedAt) {
      await prisma.incidentKnowledgeDocument.update({ where: { id: existingSource.id }, data: { sourceSewoId: null } });
    } else {
      return {
        documentId: existingSource.id,
        shouldIndex: existingSource.extractionStatus !== IncidentKnowledgeExtractionStatus.INDEXED,
        linkedHistorical: true,
      };
    }
  }

  const fields = toKnowledgeFields(sewo);
  const sourceFingerprint = fingerprintKnowledgeFields(fields);
  const duplicate = await findHistoricalDuplicate(sewo);
  if (duplicate.document) {
    const linked = await prisma.$transaction(async (tx) => {
      const latestSewo = await tx.sEWO.findFirst({
        where: {
          id: sewo.id,
          plantId: sewo.plantId,
          deletedAt: null,
          status: { in: [SEWOStatus.APPROVED, SEWOStatus.CLOSED] },
          OR: [{ approvedAt: { not: null } }, { approvedByUserId: { not: null } }],
        },
        select: { id: true },
      });
      if (!latestSewo) return false;
      const linkedCount = await tx.incidentKnowledgeDocument.updateMany({
        where: { id: duplicate.document!.id, plantId: sewo.plantId, sourceSewoId: null, reviewStatus: IncidentKnowledgeReviewStatus.APPROVED, archivedAt: null },
        data: { sourceSewoId: sewo.id },
      });
      let historicalLinked = linkedCount.count === 1;
      if (linkedCount.count !== 1) {
        const currentLink = await tx.incidentKnowledgeDocument.findFirst({ where: { sourceSewoId: sewo.id }, select: { id: true } });
        historicalLinked = currentLink?.id === duplicate.document!.id;
      }
      if (!historicalLinked) return false;
      if (existingSource?.sourceType === IncidentKnowledgeSourceType.CURRENT_SEWO) {
        const archivedAt = new Date();
        await tx.incidentKnowledgeChunk.deleteMany({ where: { documentId: existingSource.id, plantId: sewo.plantId } });
        await tx.incidentKnowledgeDocument.update({
          where: { id: existingSource.id },
          data: {
            reviewStatus: IncidentKnowledgeReviewStatus.REJECTED,
            extractionStatus: IncidentKnowledgeExtractionStatus.REJECTED,
            archivedAt,
            indexedAt: null,
          },
        });
        await tx.incidentKnowledgeAudit.create({
          data: {
            plantId: sewo.plantId,
            documentId: existingSource.id,
            actorUserId: input.actorUserId ?? sewo.approvedByUserId,
            operation: "CURRENT_SEWO_DUPLICATE_ARCHIVED",
            changes: { reason: "matched_approved_historical_pdf", linkedDocumentId: duplicate.document!.id },
            stateAfter: { reviewStatus: IncidentKnowledgeReviewStatus.REJECTED, archivedAt: archivedAt.toISOString() },
          },
        });
      }
      await tx.incidentKnowledgeAudit.create({
        data: {
          plantId: sewo.plantId,
          documentId: duplicate.document!.id,
          actorUserId: input.actorUserId ?? sewo.approvedByUserId,
          operation: "CURRENT_SEWO_LINKED_TO_HISTORICAL_DOCUMENT",
          changes: { sourceSewoId: sewo.id, deduplicated: true },
        },
      });
      return duplicate.document!.id;
    });
    return linked
      ? { documentId: linked, shouldIndex: duplicate.document.extractionStatus !== IncidentKnowledgeExtractionStatus.INDEXED, linkedHistorical: true }
      : { documentId: null, shouldIndex: false, reason: "not_approved" };
  }

  if (duplicate.ambiguous) {
    await prisma.incidentKnowledgeAudit.create({
      data: {
        plantId: sewo.plantId,
        actorUserId: sewo.approvedByUserId,
        operation: "CURRENT_SEWO_SYNC_REVIEW_REQUIRED",
        changes: { reason: "multiple_historical_documents_match", sourceType: IncidentKnowledgeSourceType.CURRENT_SEWO },
      },
    });
    return { documentId: null, shouldIndex: false, reason: "ambiguous_historical_match" };
  }

  if (existingSource?.sourceType === IncidentKnowledgeSourceType.CURRENT_SEWO
    && existingSource.reviewStatus === IncidentKnowledgeReviewStatus.APPROVED
    && !existingSource.archivedAt) {
    const lastSync = await prisma.incidentKnowledgeAudit.findFirst({
      where: { documentId: existingSource.id, operation: "CURRENT_SEWO_SYNCED" },
      orderBy: { createdAt: "desc" },
      select: { changes: true },
    });
    if (auditFingerprint(lastSync?.changes) === sourceFingerprint) {
      return {
        documentId: existingSource.id,
        shouldIndex: existingSource.extractionStatus !== IncidentKnowledgeExtractionStatus.INDEXED,
        documentVersion: existingSource.documentVersion,
        unchanged: true,
      };
    }
  }

  const documentId = await prisma.$transaction(async (tx) => {
    const latestSewo = await tx.sEWO.findFirst({
      where: {
        id: sewo.id,
        plantId: sewo.plantId,
        deletedAt: null,
        status: { in: [SEWOStatus.APPROVED, SEWOStatus.CLOSED] },
        OR: [{ approvedAt: { not: null } }, { approvedByUserId: { not: null } }],
      },
      select: { id: true },
    });
    if (!latestSewo) return null;

    const currentDocument = await tx.incidentKnowledgeDocument.upsert({
      where: { sourceSewoId: sewo.id },
      create: {
        plantId: sewo.plantId,
        sourceType: IncidentKnowledgeSourceType.CURRENT_SEWO,
        sourceReference: fields.incidentCode,
        sourceSewoId: sewo.id,
        documentVersion: 1,
        incidentDate: fields.incidentDate,
        incidentType: fields.incidentType,
        extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED,
        reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
        reviewedById: sewo.approvedByUserId,
        reviewedAt: sewo.approvedAt,
      },
      update: {
        sourceReference: fields.incidentCode,
        documentVersion: { increment: 1 },
        incidentDate: fields.incidentDate,
        incidentType: fields.incidentType,
        extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED,
        reviewStatus: IncidentKnowledgeReviewStatus.APPROVED,
        reviewedById: sewo.approvedByUserId,
        reviewedAt: sewo.approvedAt,
        archivedAt: null,
        indexedAt: null,
        lastError: null,
      },
      select: { id: true },
    });

    const record = await tx.incidentKnowledgeRecord.upsert({
      where: { documentId: currentDocument.id },
      create: {
        documentId: currentDocument.id,
        plantId: sewo.plantId,
        incidentCode: fields.incidentCode,
        incidentDate: fields.incidentDate,
        department: fields.department,
        workstation: fields.workstation,
        equipment: fields.equipment,
        shift: fields.shift,
        operationType: fields.operationType,
        occurrenceDescription: fields.occurrenceDescription,
        occurrenceMechanism: fields.occurrenceMechanism,
        injuryType: fields.injuryType,
        bodyPart: fields.bodyPart,
        consequence: fields.consequence,
        immediateCorrectiveAction: fields.immediateCorrectiveAction,
        lessonsLearned: fields.lessonsLearned,
        previousRelatedOccurrences: fields.previousRelatedOccurrences,
        sifPsifClassification: fields.sifPsifClassification,
        reviewedAt: sewo.approvedAt,
      },
      update: {
        incidentCode: fields.incidentCode,
        incidentDate: fields.incidentDate,
        department: fields.department,
        workstation: fields.workstation,
        equipment: fields.equipment,
        shift: fields.shift,
        operationType: fields.operationType,
        occurrenceDescription: fields.occurrenceDescription,
        occurrenceMechanism: fields.occurrenceMechanism,
        injuryType: fields.injuryType,
        bodyPart: fields.bodyPart,
        consequence: fields.consequence,
        immediateCorrectiveAction: fields.immediateCorrectiveAction,
        lessonsLearned: fields.lessonsLearned,
        previousRelatedOccurrences: fields.previousRelatedOccurrences,
        sifPsifClassification: fields.sifPsifClassification,
        reviewedAt: sewo.approvedAt,
      },
      select: { id: true },
    });

    await tx.incidentKnowledgeEvidence.deleteMany({ where: { incidentRecordId: record.id } });
    await tx.incidentKnowledgeCause.deleteMany({ where: { incidentRecordId: record.id } });
    await tx.incidentKnowledgeAction.deleteMany({ where: { incidentRecordId: record.id } });
    if (fields.evidence.length) {
      await tx.incidentKnowledgeEvidence.createMany({ data: fields.evidence.map((evidence) => ({ incidentRecordId: record.id, ...evidence })) });
    }
    if (fields.causes.length) {
      await tx.incidentKnowledgeCause.createMany({ data: fields.causes.map((cause) => ({ incidentRecordId: record.id, ...cause })) });
    }
    if (fields.actions.length) {
      await tx.incidentKnowledgeAction.createMany({ data: fields.actions.map((action) => ({ incidentRecordId: record.id, ...action })) });
    }
    await tx.incidentKnowledgeChunk.deleteMany({ where: { documentId: currentDocument.id, plantId: sewo.plantId } });
    await tx.incidentKnowledgeAudit.create({
      data: {
        plantId: sewo.plantId,
        documentId: currentDocument.id,
        actorUserId: input.actorUserId ?? sewo.approvedByUserId,
        operation: "CURRENT_SEWO_SYNCED",
        changes: { sourceType: IncidentKnowledgeSourceType.CURRENT_SEWO, causeCount: fields.causes.length, actionCount: fields.actions.length, sourceFingerprint },
        stateAfter: { reviewStatus: IncidentKnowledgeReviewStatus.APPROVED, extractionStatus: IncidentKnowledgeExtractionStatus.APPROVED, documentVersion: { incremented: true } },
      },
    });
    return currentDocument.id;
  });

  return { documentId, shouldIndex: Boolean(documentId), linkedHistorical: false };
}

