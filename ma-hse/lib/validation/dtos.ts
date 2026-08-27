import { ActionCategory, ActionManualOrigin, ActionPriority, AlertRuleTriggerType, CommunicationImprovementSubtype, CommunicationType, CompetenceAssessmentMethod, CompetenceAssessmentResult, CompetenceCategory, ExternalCompanyApprovalStatus, ExternalCompanyDocumentType, ExternalWorkerDocumentType, FireChecklistFrequency, FireChecklistItemValue, FireEquipmentCategory, FireEquipmentTagType, FireExtinguishingAgent, MapFeatureType, MapLayerSourceType, MapSourceFileType, MasterDataEntityType, MasterDataTranslationField, RoleCode, SEWOStatus, TrainingResult } from "@prisma/client";
import { z } from "zod";
import {
  SMAT_ATTACHMENT_LIMITS,
  validateSmatAttachmentCollection,
  validateSmatAttachmentFile,
} from "@/lib/smat-attachments";

const optionalUuid = z.string().uuid().optional().nullable();
const recordLevelInput = z.enum(["N1", "N2", "N3", "N4"]);
const noDigits = /\d/;
const futureCommunicationDatetimeMessage = "A data e hora da comunicação não podem ser posteriores ao momento atual.";

const communicationInputShape = z.object({
    type: z.nativeEnum(CommunicationType),
    level: recordLevelInput.optional().nullable(),
    eventDatetime: z.coerce.date(),
    reporterName: z.string().trim().min(2).refine((value) => !noDigits.test(value), {
      message: "Reporter name cannot contain numbers",
    }),
    reporterEmployeeNo: z.string().min(1).optional(),
    targetText: z.string().optional(),
    targetEmployeeNo: z.string().optional(),
    targetEmployeeId: optionalUuid,
    involvedEmployeeIds: z.array(z.string().uuid()).optional(),
    shiftId: optionalUuid,
    areaId: optionalUuid,
    lineId: optionalUuid,
    workstationId: optionalUuid,
    equipmentId: optionalUuid,
    riskThemeId: z.string().uuid().optional(),
    unsafeActTypeId: optionalUuid,
    unsafeConditionTypeId: optionalUuid,
    nearMissTypeId: optionalUuid,
    improvementSubtype: z.nativeEnum(CommunicationImprovementSubtype).optional().nullable(),
    description: z.string().min(5),
    suggestedAction: z.string().optional(),
    severityPotential: z.enum(["LOW", "MED", "HIGH"]).optional(),
    isContractor: z.boolean().optional(),
    bodyPartId: optionalUuid,
    injuryTypeId: optionalUuid,
    isFatal: z.boolean().optional(),
    initialLostDays: z.number().int().min(0).optional(),
    hasLeave: z.boolean().optional(),
    returnDate: z.coerce.date().optional(),
    attachments: z
      .array(
        z.object({
          fileKey: z.string().min(3),
          fileName: z.string().min(1),
          originalName: z.string().min(1).optional(),
          contentType: z.string().min(3),
          size: z.number().int().nonnegative().optional(),
        }),
      )
      .optional(),
    quickAction: z
      .object({
        title: z.string().min(3),
        description: z.string().min(5),
        ownerUserId: z.string().uuid(),
        level: recordLevelInput.optional().nullable(),
        priority: z.nativeEnum(ActionPriority),
        dueDate: z.coerce.date().optional(),
      })
      .optional(),
  });

type CommunicationValidationValue = z.infer<typeof communicationInputShape>;

function sanitizeFirstAidUnsafeActType<
  T extends { type: CommunicationType; unsafeActTypeId?: string | null },
>(value: T): T {
  if (value.type !== CommunicationType.FIRST_AID || value.unsafeActTypeId === undefined) {
    return value;
  }

  const sanitized = { ...value };
  delete sanitized.unsafeActTypeId;
  return sanitized;
}

function validateCommunicationPayload(
  value: CommunicationValidationValue,
  ctx: z.RefinementCtx,
  options: { requireUnsafeActType: boolean },
) {
    const baseRequired = ["eventDatetime", "reporterName", "description"] as const;
    baseRequired.forEach((field) => {
      if (!value[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} is required`,
          path: [field],
        });
      }
    });

    if (value.eventDatetime && value.eventDatetime.getTime() > Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: futureCommunicationDatetimeMessage,
        path: ["eventDatetime"],
      });
    }

    const requiresInvolvedWorker = value.type === CommunicationType.UNSAFE_ACT || value.type === CommunicationType.NEAR_MISS;
    const hasInvolvedEmployees = (value.involvedEmployeeIds?.length ?? 0) > 0;

    if (requiresInvolvedWorker && !value.targetText && !value.targetEmployeeId && !value.targetEmployeeNo && !hasInvolvedEmployees) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "This communication requires involved worker information",
        path: ["targetText"],
      });
    }

    if (options.requireUnsafeActType && value.type === CommunicationType.UNSAFE_ACT && !value.unsafeActTypeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unsafe act type is required",
        path: ["unsafeActTypeId"],
      });
    }

    if (value.type === CommunicationType.FIRST_AID || value.type === CommunicationType.ACCIDENT) {
      if (!value.targetEmployeeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Involved worker is required",
          path: ["targetEmployeeId"],
        });
      }

      if (!value.bodyPartId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Body part affected is required",
          path: ["bodyPartId"],
        });
      }

      if (value.isFatal && value.returnDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Fatal injuries cannot have a return date",
          path: ["returnDate"],
        });
      }
    }

    const fiveSSubtypes: CommunicationImprovementSubtype[] = [
      CommunicationImprovementSubtype.FIVE_S_AREA_IMPROVEMENT,
      CommunicationImprovementSubtype.FIVE_S_DISORGANIZATION,
    ];
    const suggestionSubtypes: CommunicationImprovementSubtype[] = [
      CommunicationImprovementSubtype.IMPROVEMENT_SAFETY,
      CommunicationImprovementSubtype.IMPROVEMENT_HEALTH,
      CommunicationImprovementSubtype.IMPROVEMENT_ENVIRONMENT,
    ];

    if (value.type === CommunicationType.FIVE_S_IMPROVEMENT) {
      if (!value.improvementSubtype || !fiveSSubtypes.includes(value.improvementSubtype)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Improvement subtype is required",
          path: ["improvementSubtype"],
        });
      }
    }

    if (value.type === CommunicationType.IMPROVEMENT_SUGGESTION) {
      if (!value.improvementSubtype || !suggestionSubtypes.includes(value.improvementSubtype)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Improvement subtype is required",
          path: ["improvementSubtype"],
        });
      }
    }
}

export const createCommunicationInput = communicationInputShape
  .superRefine((value, ctx) => {
    validateCommunicationPayload(value, ctx, { requireUnsafeActType: true });
  })
  .transform(sanitizeFirstAidUnsafeActType);

export const createPublicReportCommunicationInput = communicationInputShape
  .superRefine((value, ctx) => {
    validateCommunicationPayload(value, ctx, { requireUnsafeActType: false });
  });

export const updateCommunicationInput = communicationInputShape.omit({
  attachments: true,
  quickAction: true,
}).superRefine((value, ctx) => {
  validateCommunicationPayload(value, ctx, { requireUnsafeActType: true });
}).transform(sanitizeFirstAidUnsafeActType);

export const validateCommunicationInput = z.object({
  isValid: z.boolean(),
  notes: z.string().min(2),
  status: z.enum(["VALID_OPEN", "REJECTED", "INVALID"]).optional(),
});

export const manualCloseCommunicationInput = z.object({
  reason: z.string().min(5),
});

export const manualCloseSewoInput = z.object({
  reason: z.string().min(5),
});

export const reopenEntityInput = z.object({
  reason: z.string().min(5),
});

export const createActionInput = z.object({
  sourceType: z.enum(["COMMUNICATION", "SEWO", "SMAT", "MANUAL", "COMPETENCE", "FIRE_SAFETY_EQUIPMENT"]),
  manualOrigin: z.nativeEnum(ActionManualOrigin).optional(),
  level: recordLevelInput.optional().nullable(),
  communicationId: z.string().uuid().optional(),
  sewoId: z.string().uuid().optional(),
  smatAuditId: z.string().uuid().optional(),
  competenceWorkerId: z.string().uuid().optional(),
  competenceTypeId: z.string().uuid().optional(),
  fireEquipmentId: z.string().uuid().optional(),
  category: z.nativeEnum(ActionCategory),
  priority: z.nativeEnum(ActionPriority),
  title: z.string().min(3),
  description: z.string().min(5),
  ownerUserId: z.string().uuid(),
  coOwnerIds: z.array(z.string().uuid()).optional(),
  dueDate: z.coerce.date().optional(),
}).superRefine((value, ctx) => {
  if (value.sourceType === "MANUAL" && !value.manualOrigin) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Manual action origin is required",
      path: ["manualOrigin"],
    });
  }

  if (value.sourceType === "COMMUNICATION" && !value.communicationId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Communication is required",
      path: ["communicationId"],
    });
  }

  if (value.sourceType === "SEWO" && !value.sewoId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "S-EWO is required",
      path: ["sewoId"],
    });
  }

  if (value.sourceType === "SMAT" && !value.smatAuditId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "SMAT is required",
      path: ["smatAuditId"],
    });
  }

  if (value.sourceType === "COMPETENCE" && (!value.competenceWorkerId || !value.competenceTypeId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Competence worker and competence type are required",
      path: ["competenceWorkerId"],
    });
  }

  if (value.sourceType === "FIRE_SAFETY_EQUIPMENT" && !value.fireEquipmentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Fire equipment is required",
      path: ["fireEquipmentId"],
    });
  }
});

export const updateActionInput = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  ownerUserId: z.string().uuid(),
  priority: z.nativeEnum(ActionPriority),
  category: z.nativeEnum(ActionCategory),
  level: recordLevelInput.optional().nullable(),
  dueDate: z.coerce.date().optional(),
});

const smatObservationInput = z.object({
  category: z.enum(["A", "B", "C", "D", "E", "F"]),
  description: z.string().min(2),
});

const smatAttachmentInput = z
  .object({
    fileKey: z.string().min(3),
    fileName: z.string().min(1),
    contentType: z.string().min(3),
    caption: z.string().trim().max(SMAT_ATTACHMENT_LIMITS.maxCaptionLength).optional(),
    size: z.number().int().nonnegative().optional(),
  })
  .superRefine((attachment, ctx) => {
    const message = validateSmatAttachmentFile({
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      size: attachment.size ?? 1,
    });

    if (message) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
      });
    }
  });

export const createSMATAuditInput = z.object({
  communicationId: z.string().uuid().optional().nullable(),
  auditorName: z.string().min(2),
  auditDate: z.coerce.date(),
  startTimeText: z.string().max(10).optional(),
  endTimeText: z.string().max(10).optional(),
  areaExamined: z.string().max(200).optional(),
  locationExamined: z.string().max(200).optional(),
  peopleObservedCount: z.number().int().min(0).default(0),
  peopleInvolvedCount: z.number().int().min(0).default(0),
  peopleSafeCount: z.number().int().min(0).default(0),
  peopleUnsafeCount: z.number().int().min(0).default(0),
  workConditionsSafeCount: z.number().int().min(0).default(0),
  workConditionsUnsafeCount: z.number().int().min(0).default(0),
  reactionsPositiveCount: z.number().int().min(0).default(0),
  reactionsNegativeCount: z.number().int().min(0).default(0),
  safeActs: z.array(smatObservationInput).default([]),
  safeConditions: z.array(smatObservationInput).default([]),
  unsafeActs: z.array(smatObservationInput).default([]),
  unsafeConditions: z.array(smatObservationInput).default([]),
  answer1: z.string().optional(),
  answer2: z.string().optional(),
  answer3: z.string().optional(),
  answer4: z.string().optional(),
  answer5: z.string().optional(),
  answer6: z.string().optional(),
  notes: z.string().optional(),
  attachments: z
    .array(smatAttachmentInput)
    .superRefine((attachments, ctx) => {
      const message = validateSmatAttachmentCollection(attachments.map((attachment) => ({ size: attachment.size ?? 0 })));
      if (message) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message,
        });
      }
    })
    .default([]),
  actionPlans: z
    .array(
      z.object({
        title: z.string().min(3),
        description: z.string().min(5),
        ownerUserId: z.string().uuid(),
        priority: z.nativeEnum(ActionPriority),
        dueDate: z.coerce.date().optional(),
      }),
    )
    .default([]),
});

export const closeActionInput = z.object({
  closureComment: z.string().min(5),
  closedAt: z.coerce.date(),
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

export const bulkCloseActionInput = z.object({
  actionIds: z.array(z.string().uuid()).min(1),
  closureComment: z.string().min(5),
  closedAt: z.coerce.date(),
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

export const createSEWOInput = z.object({
  communicationId: z.string().uuid().optional().nullable(),
  eventClassification: z.string().min(2),
  areaId: z.string().uuid().optional(),
  lineId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  analysisDate: z.coerce.date(),
  whatText: z.string().min(2),
  whereText: z.string().min(2),
  whoText: z.string().min(2),
  usualWorkYesNo: z.boolean(),
  whichText: z.string().optional(),
  howText: z.string().min(2),
  immediateCorrectiveActionText: z.string().trim().optional().default(""),
  templateData: z.record(z.string(), z.unknown()).optional(),
  attachments: z
    .array(
      z.object({
        fileKey: z.string().min(3),
        fileName: z.string().min(1),
        contentType: z.string().min(3),
        caption: z.string().trim().max(200).optional().nullable(),
      }),
    )
    .optional(),
  actionPlans: z
    .array(
      z.object({
        category: z.nativeEnum(ActionCategory),
        priority: z.nativeEnum(ActionPriority),
        title: z.string().min(3),
        description: z.string().min(5),
        ownerUserId: z.string().uuid(),
        dueDate: z.coerce.date().optional(),
      }),
    )
    .default([]),
  causeCatalogVersionId: z.string().uuid(),
  causeSelections: z
    .array(
      z.object({
        causeItemId: z.string().uuid(),
        selected: z.boolean(),
        isRootCause: z.boolean(),
        comment: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
  status: z.nativeEnum(SEWOStatus).optional(),
});

export const updateSEWOInput = createSEWOInput;

export const deleteSEWOInput = z.object({
  updatedAt: z.coerce.date(),
});

export const approveSEWOInput = z.object({
  approved: z.boolean(),
  approvalComment: z.string().min(3),
  shareReport: z.boolean().optional(),
});

export const changeSewoDecisionInput = z.object({
  approved: z.boolean(),
  approvalComment: z.string().min(3),
});

export const updateAlertRuleInput = z.object({
  name: z.string().min(2),
  isActive: z.boolean().default(true),
  triggerType: z.nativeEnum(AlertRuleTriggerType),
  thresholdCount: z.number().int().positive(),
  windowDays: z.number().int().positive(),
  consecutiveCount: z.number().int().positive().optional(),
  sameWorkstation: z.boolean().default(true),
  sameEquipment: z.boolean().default(true),
  sameRiskTheme: z.boolean().default(true),
  sameWorker: z.boolean().default(false),
});

export const updateRepeatabilityAlertConfigInput = z.object({
  workerWeeklyLevel1Enabled: z.boolean().default(true),
  workerWeeklyLevel1Threshold: z.number().int().positive(),
  workerWeeklyLevel2Enabled: z.boolean().default(true),
  workerWeeklyLevel2Threshold: z.number().int().positive(),
  workstationNearMissWeeklyEnabled: z.boolean().default(true),
  workstationNearMissWeeklyThreshold: z.number().int().positive(),
});

export const uploadAttachmentInput = z.object({
  plantCode: z.string().min(2),
  contentType: z.string().min(3),
  folder: z.enum(["communications", "actions", "sewo", "maps", "smat", "fire-equipment"]),
});

export const createPlantUserInput = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  language: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]).default("en"),
  role: z.nativeEnum(RoleCode),
  password: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().min(8, "Password must be at least 8 characters").optional(),
  ),
  isActive: z.boolean().default(true),
}).refine((data) => data.role !== RoleCode.N0_ADMIN, {
  message: "N0_ADMIN role cannot be assigned through the application. N0 users can only be created via script.",
  path: ["role"],
});

export const updatePlantUserInput = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  language: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]).default("en"),
  role: z.nativeEnum(RoleCode),
  password: z.preprocess(
    (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
    z.string().min(8, "Password must be at least 8 characters").optional(),
  ),
  isActive: z.boolean().default(true),
}).refine((data) => data.role !== RoleCode.N0_ADMIN, {
  message: "N0_ADMIN role cannot be assigned through the application. N0 users can only be created via script.",
  path: ["role"],
});

export const contractorRegisterInput = z.object({
  invitationToken: z.string().min(10),
  contactName: z.string().min(2),
  password: z.string().min(8),
  email: z.string().email(),
  companyName: z.string().min(2),
  address: z.string().min(3),
  phone: z.string().min(3),
  taxId: z.string().min(3),
  socialSecurityId: z.string().min(3),
});

export const contractorLoginInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const contractorInvitationInput = z.object({
  email: z.string().email(),
  requiredDocuments: z.array(z.nativeEnum(ExternalCompanyDocumentType)).default([
    ExternalCompanyDocumentType.ANEXO_D,
    ExternalCompanyDocumentType.RISK_ASSESSMENT,
    ExternalCompanyDocumentType.WORK_ACCIDENT_INSURANCE,
    ExternalCompanyDocumentType.CIVIL_LIABILITY_INSURANCE,
    ExternalCompanyDocumentType.SOCIAL_SECURITY_CLEARANCE,
    ExternalCompanyDocumentType.TAX_AUTHORITY_CLEARANCE,
  ]),
});

export const contractorCompanyDocumentInput = z.object({
  type: z.nativeEnum(ExternalCompanyDocumentType),
  fileKey: z.string().min(3),
  fileName: z.string().min(1),
  contentType: z.string().min(3),
  validUntil: z.coerce.date().optional(),
});

export const contractorWorkerInput = z.object({
  name: z.string().min(2),
  birthDate: z.coerce.date(),
});

export const contractorWorkerDocumentInput = z.object({
  workerId: z.string().uuid(),
  type: z.nativeEnum(ExternalWorkerDocumentType),
  fileKey: z.string().min(3),
  fileName: z.string().min(1),
  contentType: z.string().min(3),
  validUntil: z.coerce.date().optional(),
});

export const contractorApprovalInput = z.object({
  approvalStatus: z.nativeEnum(ExternalCompanyApprovalStatus),
  approvalComment: z.string().optional(),
});

export const contractorToggleActiveInput = z.object({
  isActive: z.boolean(),
});

export const contractorCompanyUpdateInput = z
  .object({
    isActive: z.boolean().optional(),
    sponsorUserId: z.string().uuid().nullable().optional(),
  })
  .refine((value) => value.isActive !== undefined || value.sponsorUserId !== undefined, {
    message: "At least one field must be provided",
  });

export const createMapDocumentInput = z.object({
  title: z.string().min(2),
  fileKey: z.string().min(3),
  fileName: z.string().min(1),
  contentType: z.string().min(3),
  fileType: z.nativeEnum(MapSourceFileType),
  importedLayerNames: z.array(z.string().min(1)).optional(),
  selectedLayerNames: z.array(z.string().min(1)).optional(),
});

export const createMapLayerInput = z.object({
  documentId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  description: z.string().optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/, "Use a 6-digit hex color"),
  icon: z.string().max(8).optional(),
  sourceType: z.nativeEnum(MapLayerSourceType).default(MapLayerSourceType.MANUAL),
  isVisibleDefault: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  metadataJson: z.record(z.string(), z.any()).optional(),
});

export const createMapFeatureInput = z.object({
  layerId: z.string().uuid().optional().nullable(),
  featureType: z.nativeEnum(MapFeatureType),
  label: z.string().min(1),
  icon: z.string().max(8).optional(),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/, "Use a 6-digit hex color").optional(),
  positionX: z.number().min(0).max(100),
  positionY: z.number().min(0).max(100),
  areaId: z.string().uuid().optional().nullable(),
  workstationId: z.string().uuid().optional().nullable(),
  communicationId: z.string().uuid().optional().nullable(),
  metadataJson: z.record(z.string(), z.any()).optional(),
});

export const updateMapFeatureInput = z.object({
  label: z.string().min(1).optional(),
  icon: z.string().max(8).optional().nullable(),
  color: z.string().regex(/^#([0-9a-fA-F]{6})$/, "Use a 6-digit hex color").optional().nullable(),
  positionX: z.number().min(0).max(100).optional(),
  positionY: z.number().min(0).max(100).optional(),
  layerId: z.string().uuid().optional().nullable(),
  metadataJson: z.record(z.string(), z.any()).optional(),
});

export const createMasterDataItemInput = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(["area", "workstation", "equipment", "nearMissType", "unsafeActType", "unsafeConditionType", "injuryType"]),
  code: z.string().min(1),
  name: z.string().min(2),
  category: z.string().optional(),
});

export const deleteMasterDataItemInput = z.object({
  type: z.enum(["area", "workstation", "equipment", "nearMissType", "unsafeActType", "unsafeConditionType", "injuryType"]),
  id: z.string().uuid().optional(),
  deleteAll: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (!value.deleteAll && !value.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["id"],
      message: "Item id is required when deleteAll is false",
    });
  }
});

export const communicationListExportInput = z.object({
  rows: z.array(z.object({
    code: z.string(),
    event: z.string(),
    level: z.string(),
    type: z.string(),
    status: z.string(),
    reporter: z.string(),
    department: z.string(),
    location: z.string(),
    description: z.string().optional().default(""),
  })).max(200),
});

export const actionListExportInput = z.object({
  rows: z.array(z.object({
    action: z.string(),
    level: z.string(),
    local: z.string(),
    source: z.string(),
    priority: z.string(),
    status: z.string(),
    owner: z.string(),
    due: z.string(),
    description: z.string().optional().default(""),
  })).max(200),
});

export const fireEquipmentListExportInput = z.object({
  rows: z.array(z.object({
    code: z.string(),
    type: z.string(),
    location: z.string(),
    status: z.string(),
    quarterlyState: z.string(),
    annualState: z.string(),
    hasOpenNonConformity: z.string(),
    tag: z.string(),
  })).max(3000),
});

export const competenceMatrixExportInput = z.object({
  columns: z.array(z.object({
    key: z.string().trim().min(1).max(80),
    header: z.string().trim().min(1).max(160),
  })).min(1).max(60),
  rows: z.array(z.record(z.string(), z.string())).max(3000),
});

export const upsertProfessionalRiskInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(40),
  category: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(160),
});

export const deleteProfessionalRiskInput = z.object({
  id: z.string().uuid(),
});

export const upsertUnsafeActTypeInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(40),
  category: z.string().trim().min(1).max(80),
  name: z.string().trim().min(2).max(160),
});

export const deleteUnsafeActTypeInput = z.object({
  id: z.string().uuid(),
});

export const upsertCompetenceTypeInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  category: z.nativeEnum(CompetenceCategory),
  requiresTraining: z.boolean().default(true),
  requiresAssessment: z.boolean().default(true),
  requiresAuthorization: z.boolean().default(true),
  validityMonths: z.coerce.number().int().positive().max(120).default(12),
  refresherMonths: z.coerce.number().int().positive().max(120).nullable().optional(),
  legalReference: z.string().trim().max(160).nullable().optional(),
  displayOrder: z.coerce.number().int().min(0).default(0),
});

export const deleteCompetenceTypeInput = z.object({
  id: z.string().uuid(),
});

export const upsertFireEquipmentTypeInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(160),
  category: z.nativeEnum(FireEquipmentCategory),
  codePrefix: z.string().trim().min(1).max(10).regex(/^[A-Z0-9]+$/, "Use uppercase letters and digits only"),
  legalReference: z.string().trim().max(160).nullable().optional(),
  displayOrder: z.coerce.number().int().min(0).default(0),
});

export const deleteFireEquipmentTypeInput = z.object({
  id: z.string().uuid(),
});

export const createFireEquipmentInput = z.object({
  fireEquipmentTypeId: z.string().uuid(),
  // Typed by the user, not auto-generated — the service validates it's
  // unique within the plant (see fire-equipment-service.ts's create()).
  internalCode: z.string().trim().min(1).max(60),
  // The add-equipment form's "Área" field now sources its options from
  // Workstation master data, not Area — workstationId is the only location
  // FK the form can populate. areaId stays on the model for equipment
  // created before this change; the service never writes it going forward.
  workstationId: optionalUuid,
  locationDescription: z.string().trim().max(300).nullable().optional(),
  // Only persisted when the selected type is the extinguisher — the service
  // drops it silently for any other type (see fire-equipment-service.ts).
  extinguishingAgent: z.nativeEnum(FireExtinguishingAgent).nullable().optional(),
  locationPhotoFileKey: z.string().trim().min(1).max(500).nullable().optional(),
  installedAt: z.coerce.date().nullable().optional(),
  manufactureDate: z.coerce.date().nullable().optional(),
});

// Same shape as createFireEquipmentInput — editing an equipment record
// touches the same fields creating it does. internalCode uniqueness is
// re-checked excluding the equipment's own row (fire-equipment-service.ts).
export const updateFireEquipmentInput = createFireEquipmentInput;

export const decommissionFireEquipmentInput = z.object({
  reason: z.string().trim().max(300).nullable().optional(),
});

// §3.5/§7.4: overallResult is never part of this input — it's always
// calculated in fire-equipment-service.ts from itemResponses. performedByUserId
// isn't part of it either — it's always the caller (§2.4), even for an
// annual maintenance registered a posteriori from an external provider's
// report (externalProviderName/externalCertificateFileKey capture that case).
export const createFireChecklistExecutionInput = z.object({
  fireEquipmentId: z.string().uuid(),
  frequency: z.nativeEnum(FireChecklistFrequency),
  performedAt: z.coerce.date().optional(),
  externalProviderName: z.string().trim().max(160).nullable().optional(),
  externalCertificateFileKey: z.string().trim().min(1).max(500).nullable().optional(),
  observations: z.string().trim().max(2000).nullable().optional(),
  itemResponses: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        value: z.nativeEnum(FireChecklistItemValue),
        numericValue: z.coerce.number().nullable().optional(),
        textValue: z.string().trim().max(500).nullable().optional(),
        notes: z.string().trim().max(500).nullable().optional(),
      }),
    )
    .min(1, "At least one checklist item response is required"),
  attachments: z
    .array(
      z.object({
        fileKey: z.string().trim().min(3),
        fileName: z.string().trim().min(1),
      }),
    )
    .optional(),
});

// §5.6/§3.3: unassignReason only ever applies when there's a current active
// tag being replaced — the service ignores it on a first-time assignment.
export const assignFireEquipmentTagInput = z.object({
  tagType: z.nativeEnum(FireEquipmentTagType).default(FireEquipmentTagType.NFC_AND_QR),
  unassignReason: z.string().trim().max(300).nullable().optional(),
  // Reuse an already-existing physical tag's code instead of generating a
  // fresh random one — validated for global uniqueness in
  // fire-equipment-tag-service.ts (tagCode has no plant scoping).
  tagCode: z.string().trim().min(1).max(60).nullable().optional(),
});

// §5.3/§5.1: the Web-NFC scan-and-bind path — sent ONCE, after the client
// already knows whether the physical write succeeded (see
// fire-equipment-tag-service.ts's bindByUid for why). tagCode is generated
// client-side before the write, so it's supplied here rather than minted
// server-side.
export const bindFireEquipmentTagByUidInput = z.object({
  tagUid: z.string().trim().min(1).max(120),
  tagCode: z.string().trim().min(1).max(60),
  chipType: z.string().trim().max(80).nullable().optional(),
  writeSucceeded: z.boolean(),
  // Must match the equipment currently holding the conflicting active
  // assignment — proof the caller already saw the conflict and explicitly
  // chose to transfer, never inferred (§5.1 rule 3).
  transferFromEquipmentId: z.string().uuid().optional(),
});

export const tagLookupInput = z.object({
  tagUid: z.string().trim().min(1).max(120),
});

export const enrollCompetenceWorkersInput = z.object({
  workers: z.array(z.object({
    employeeDirectoryId: z.string().uuid(),
    areaId: z.string().uuid(),
  })).min(1, "Select at least one employee"),
});

export const registerTrainingInput = z.object({
  competenceWorkerId: z.string().uuid(),
  competenceTypeId: z.string().uuid(),
  provider: z.string().trim().max(160).nullable().optional(),
  trainerName: z.string().trim().max(160).nullable().optional(),
  completedAt: z.coerce.date(),
  durationHours: z.coerce.number().positive().max(999).nullable().optional(),
  certificateNumber: z.string().trim().max(80).nullable().optional(),
  certificateExpiresAt: z.coerce.date().nullable().optional(),
  result: z.nativeEnum(TrainingResult).default(TrainingResult.PASSED),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const registerAssessmentInput = z.object({
  competenceWorkerId: z.string().uuid(),
  competenceTypeId: z.string().uuid(),
  trainingRecordId: z.string().uuid().nullable().optional(),
  assessedAt: z.coerce.date(),
  assessorName: z.string().trim().max(160).nullable().optional(),
  method: z.nativeEnum(CompetenceAssessmentMethod).default(CompetenceAssessmentMethod.PRACTICAL_TEST),
  result: z.nativeEnum(CompetenceAssessmentResult),
  score: z.coerce.number().int().min(0).max(100).nullable().optional(),
  observations: z.string().trim().max(2000).nullable().optional(),
});

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export const grantAuthorizationInput = z.object({
  competenceWorkerId: z.string().uuid(),
  competenceTypeId: z.string().uuid(),
  trainingRecordId: z.string().uuid().nullable().optional(),
  assessmentId: z.string().uuid().nullable().optional(),
  validFrom: z.coerce.date(),
  restrictions: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, ctx) => {
  // minor fix: unbounded validFrom accepted 1990 or 2090 alike. Bounds are
  // computed at validation time (not baked into the schema at module load),
  // so "around today" does not drift over a long-running process's uptime.
  const now = Date.now();
  if (value.validFrom.getTime() < now - ONE_YEAR_MS || value.validFrom.getTime() > now + ONE_YEAR_MS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validFrom"],
      message: "validFrom must be within one year of today",
    });
  }
});

export const suspendAuthorizationInput = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const revokeAuthorizationInput = z.object({
  reason: z.string().trim().min(1).max(500),
});

export const reactivateAuthorizationInput = z.object({
  note: z.string().trim().max(500).nullable().optional(),
});

export const setCompetenceWorkerRequirementInput = z.object({
  competenceTypeId: z.string().uuid(),
  isRequired: z.boolean(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export const updateCompetenceWorkerRoleInput = z.object({
  roleName: z.string().trim().min(1).max(160).nullable(),
});

export const createWorkerInput = z.object({
  id: z.string().uuid().optional(),
  employeeNo: z.string().min(1),
  name: z.string().min(2),
  dept: z.string().optional(),
});

export const deleteWorkerInput = z.object({
  id: z.string().uuid().optional(),
  deleteAll: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (!value.deleteAll && !value.id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["id"],
      message: "Worker id is required when deleteAll is false",
    });
  }
});

export const upsertMasterDataTranslationInput = z.object({
  entityType: z.nativeEnum(MasterDataEntityType),
  entityId: z.string().uuid(),
  field: z.nativeEnum(MasterDataTranslationField),
  locale: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]),
  value: z.string().trim().min(1).max(240),
});

// Additive only — the floating window only ever sends newly uploaded
// documents, never a full replace list, so existing attachments are left
// untouched by every save (see occupational-health-service.ts's upsert()).
const occupationalHealthAttachmentInput = z.object({
  fileKey: z.string().min(3),
  fileName: z.string().min(1),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
});

export const upsertOccupationalHealthWorkerInput = z.object({
  employeeNo: z.string().min(1),
  name: z.string().min(2),
  birthDate: z.coerce.date(),
  workstationId: z.string().uuid().optional().nullable(),
  gender: z.enum(["MALE", "FEMALE"]),
  hireDate: z.coerce.date(),
  roleStartDate: z.coerce.date(),
  roleName: z.string().optional(),
  nationality: z.string().optional(),
  examDate: z.coerce.date(),
  validUntil: z.coerce.date().optional().nullable(),
  status: z.enum(["VALID", "EXPIRED", "DUE_SOON", "PENDING"]).default("VALID"),
  observation: z.string().optional(),
  isActive: z.boolean().default(true),
  newAttachments: z.array(occupationalHealthAttachmentInput).optional(),
});

export const createCorporatePlantInput = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  timezone: z.string().min(2),
  defaultLanguage: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]),
  n1: z.object({
    email: z.string().email(),
    name: z.string().min(2),
    language: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]).optional(),
  }),
  n2: z.object({
    email: z.string().email(),
    name: z.string().min(2),
    language: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]).optional(),
  }),
  n3: z.object({
    email: z.string().email(),
    name: z.string().min(2),
    language: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]).optional(),
  }),
});

export const updateCorporatePlantLanguageInput = z.object({
  plantId: z.string().uuid(),
  defaultLanguage: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]),
});

export const updateCorporatePlantInput = z.object({
  plantId: z.string().uuid(),
  code: z.string().min(2),
  name: z.string().min(2),
  timezone: z.string().min(2),
  defaultLanguage: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]),
  isActive: z.boolean().default(true),
});

export const changePasswordInput = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(8, "Please confirm the new password"),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Password confirmation does not match",
      });
    }

    if (value.currentPassword === value.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "New password must be different from current password",
      });
    }
  });

export const updateOwnProfileInput = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120, "Name is too long"),
  language: z.enum(["pt", "it", "en", "pl", "de", "ro", "fr"]),
});

export const updateOnboardingProgressInput = z.object({
  step: z.number().int().min(0).max(1000),
});

const nullableMonthlyNumber = z
  .union([z.number().nonnegative(), z.null()])
  .optional()
  .transform((value) => (typeof value === "number" ? value : null));

export const updatePlantMonthlyInputsInput = z.object({
  year: z.number().int().min(2000).max(2100),
  months: z
    .array(
      z.object({
        month: z.number().int().min(1).max(12),
        workerCount: z.union([z.number().int().nonnegative(), z.null()]).optional().transform((value) => (typeof value === "number" ? value : null)),
        hoursWorked: nullableMonthlyNumber,
        standardHours: nullableMonthlyNumber,
        spillsNumber: z.union([z.number().int().nonnegative(), z.null()]).optional().transform((value) => (typeof value === "number" ? value : null)),
        electricityFromGridMwh: nullableMonthlyNumber,
        selfProducedEnergyMwh: nullableMonthlyNumber,
        heatingM3: nullableMonthlyNumber,
        waterConsumedNetworkM3: nullableMonthlyNumber,
        waterConsumedCapturedM3: nullableMonthlyNumber,
        compressedAirConsumedM3: nullableMonthlyNumber,
        compressedAirConsumedMwh: nullableMonthlyNumber,
        ewc150101PaperCardboardPackagingTons: nullableMonthlyNumber,
        ewc150102PlasticPackagingTons: nullableMonthlyNumber,
        ewc150103WoodTons: nullableMonthlyNumber,
        ewc160117FerrousMetalsTons: nullableMonthlyNumber,
        ewc160118NonFerrousMetalsCopperTons: nullableMonthlyNumber,
        ewc170117ConstructionWasteTons: nullableMonthlyNumber,
        ewc200111Tons: nullableMonthlyNumber,
        ewc200136ElectricalElectronicEquipmentTons: nullableMonthlyNumber,
        ewc200139PlasticTons: nullableMonthlyNumber,
        ewc200301UnsortedUrbanWasteTons: nullableMonthlyNumber,
        hazardousWasteTons: nullableMonthlyNumber,
        recycledWasteTons: nullableMonthlyNumber,
      }),
    )
    .length(12),
  indicatorConfig: z
    .array(
      z.object({
        id: z.string().min(1),
        section: z.string().min(1),
        subsection: z.string().nullable().optional(),
        label: z.string().min(1),
        legacyKey: z.string().nullable().optional(),
        enabled: z.boolean(),
        col2Label: z.string().nullable().optional(),
        col2Value: z.string().nullable().optional(),
        col2Options: z.array(z.string()).default([]),
        col3Unit: z.string().nullable().optional(),
        col3Options: z.array(z.string()).default([]),
        distanceKm: z.string().nullable().optional(),
        valueMode: z.enum(["manual", "computed"]).default("manual"),
      }),
    )
    .default([]),
  customRows: z
    .array(
      z.object({
        id: z.string().min(1),
        section: z.string().min(1),
        subsection: z.string().nullable().optional(),
        label: z.string().min(1),
        enabled: z.boolean(),
        col2Label: z.string().nullable().optional(),
        col2Value: z.string().nullable().optional(),
        col2Options: z.array(z.string()).default([]),
        col3Unit: z.string().nullable().optional(),
        col3Options: z.array(z.string()).default([]),
        distanceKm: z.string().nullable().optional(),
        valueMode: z.enum(["manual", "computed"]).default("manual"),
        months: z.array(nullableMonthlyNumber).length(12),
      }),
    )
    .default([]),
});

export type CreateCommunicationInput = z.infer<typeof createCommunicationInput>;
export type UpdateCommunicationInput = z.infer<typeof updateCommunicationInput>;
export type ValidateCommunicationInput = z.infer<typeof validateCommunicationInput>;
export type ManualCloseCommunicationInput = z.infer<typeof manualCloseCommunicationInput>;
export type ManualCloseSewoInput = z.infer<typeof manualCloseSewoInput>;
export type CreateActionInput = z.infer<typeof createActionInput>;
export type CreateSMATAuditInput = z.infer<typeof createSMATAuditInput>;
export type CloseActionInput = z.infer<typeof closeActionInput>;
export type BulkCloseActionInput = z.infer<typeof bulkCloseActionInput>;
export type ReopenActionInput = z.infer<typeof reopenEntityInput>;
export type CreateSEWOInput = z.infer<typeof createSEWOInput>;
export type UpdateSEWOInput = z.infer<typeof updateSEWOInput>;
export type DeleteSEWOInput = z.infer<typeof deleteSEWOInput>;
export type ApproveSEWOInput = z.infer<typeof approveSEWOInput>;
export type ChangeSewoDecisionInput = z.infer<typeof changeSewoDecisionInput>;
export type UpdateActionInput = z.infer<typeof updateActionInput>;
export type UpdateAlertRuleInput = z.infer<typeof updateAlertRuleInput>;
export type UpdateRepeatabilityAlertConfigInput = z.infer<typeof updateRepeatabilityAlertConfigInput>;
export type UploadAttachmentInput = z.infer<typeof uploadAttachmentInput>;
export type ContractorRegisterInput = z.infer<typeof contractorRegisterInput>;
export type ContractorLoginInput = z.infer<typeof contractorLoginInput>;
export type ContractorInvitationInput = z.infer<typeof contractorInvitationInput>;
export type ContractorCompanyDocumentInput = z.infer<typeof contractorCompanyDocumentInput>;
export type ContractorWorkerInput = z.infer<typeof contractorWorkerInput>;
export type ContractorWorkerDocumentInput = z.infer<typeof contractorWorkerDocumentInput>;
export type ContractorApprovalInput = z.infer<typeof contractorApprovalInput>;
export type ContractorToggleActiveInput = z.infer<typeof contractorToggleActiveInput>;
export type CreateMapDocumentInput = z.infer<typeof createMapDocumentInput>;
export type CreateMapLayerInput = z.infer<typeof createMapLayerInput>;
export type CreateMapFeatureInput = z.infer<typeof createMapFeatureInput>;
export type UpdateMapFeatureInput = z.infer<typeof updateMapFeatureInput>;
export type CreatePlantUserInput = z.infer<typeof createPlantUserInput>;
export type UpdatePlantUserInput = z.infer<typeof updatePlantUserInput>;
export type CreateMasterDataItemInput = z.infer<typeof createMasterDataItemInput>;
export type UpsertProfessionalRiskInput = z.infer<typeof upsertProfessionalRiskInput>;
export type UpsertUnsafeActTypeInput = z.infer<typeof upsertUnsafeActTypeInput>;
export type UpsertCompetenceTypeInput = z.infer<typeof upsertCompetenceTypeInput>;
export type DeleteCompetenceTypeInput = z.infer<typeof deleteCompetenceTypeInput>;
export type UpsertFireEquipmentTypeInput = z.infer<typeof upsertFireEquipmentTypeInput>;
export type DeleteFireEquipmentTypeInput = z.infer<typeof deleteFireEquipmentTypeInput>;
export type CreateFireEquipmentInput = z.infer<typeof createFireEquipmentInput>;
export type UpdateFireEquipmentInput = z.infer<typeof updateFireEquipmentInput>;
export type DecommissionFireEquipmentInput = z.infer<typeof decommissionFireEquipmentInput>;
export type CreateFireChecklistExecutionInput = z.infer<typeof createFireChecklistExecutionInput>;
export type AssignFireEquipmentTagInput = z.infer<typeof assignFireEquipmentTagInput>;
export type BindFireEquipmentTagByUidInput = z.infer<typeof bindFireEquipmentTagByUidInput>;
export type TagLookupInput = z.infer<typeof tagLookupInput>;
export type EnrollCompetenceWorkersInput = z.infer<typeof enrollCompetenceWorkersInput>;
export type RegisterTrainingInput = z.infer<typeof registerTrainingInput>;
export type RegisterAssessmentInput = z.infer<typeof registerAssessmentInput>;
export type GrantAuthorizationInput = z.infer<typeof grantAuthorizationInput>;
export type SuspendAuthorizationInput = z.infer<typeof suspendAuthorizationInput>;
export type RevokeAuthorizationInput = z.infer<typeof revokeAuthorizationInput>;
export type ReactivateAuthorizationInput = z.infer<typeof reactivateAuthorizationInput>;
export type SetCompetenceWorkerRequirementInput = z.infer<typeof setCompetenceWorkerRequirementInput>;
export type UpdateCompetenceWorkerRoleInput = z.infer<typeof updateCompetenceWorkerRoleInput>;
export type CreateWorkerInput = z.infer<typeof createWorkerInput>;
export type UpsertOccupationalHealthWorkerInput = z.infer<typeof upsertOccupationalHealthWorkerInput>;
export type CreateCorporatePlantInput = z.infer<typeof createCorporatePlantInput>;
export type UpdateCorporatePlantLanguageInput = z.infer<typeof updateCorporatePlantLanguageInput>;
export type UpdateCorporatePlantInput = z.infer<typeof updateCorporatePlantInput>;
export type ChangePasswordInput = z.infer<typeof changePasswordInput>;
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileInput>;
export type UpdateOnboardingProgressInput = z.infer<typeof updateOnboardingProgressInput>;
export type UpdatePlantMonthlyInputsInput = z.infer<typeof updatePlantMonthlyInputsInput>;
