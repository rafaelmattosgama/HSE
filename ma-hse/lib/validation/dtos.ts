import { ActionCategory, ActionPriority, AlertRuleTriggerType, CommunicationType, RoleCode, SEWOStatus } from "@prisma/client";
import { z } from "zod";

const optionalUuid = z.string().uuid().optional().nullable();

export const createCommunicationInput = z
  .object({
    type: z.nativeEnum(CommunicationType),
    eventDatetime: z.coerce.date(),
    reporterName: z.string().min(2),
    reporterEmployeeNo: z.string().min(1).optional(),
    targetText: z.string().optional(),
    targetEmployeeNo: z.string().optional(),
    targetEmployeeId: optionalUuid,
    areaId: optionalUuid,
    lineId: optionalUuid,
    workstationId: optionalUuid,
    equipmentId: optionalUuid,
    riskThemeId: z.string().uuid(),
    unsafeActTypeId: optionalUuid,
    unsafeConditionTypeId: optionalUuid,
    nearMissTypeId: optionalUuid,
    description: z.string().min(5),
    severityPotential: z.enum(["LOW", "MED", "HIGH"]).optional(),
    isContractor: z.boolean().optional(),
    bodyPartId: optionalUuid,
    injuryTypeId: optionalUuid,
    hasLeave: z.boolean().optional(),
    returnDate: z.coerce.date().optional(),
    attachments: z
      .array(
        z.object({
          fileKey: z.string().min(3),
          fileName: z.string().min(1),
          contentType: z.string().min(3),
        }),
      )
      .optional(),
    quickAction: z
      .object({
        title: z.string().min(3),
        description: z.string().min(5),
        ownerUserId: z.string().uuid(),
        priority: z.nativeEnum(ActionPriority),
        dueDate: z.coerce.date().optional(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    const baseRequired = ["eventDatetime", "reporterName", "riskThemeId", "description"] as const;
    baseRequired.forEach((field) => {
      if (!value[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${field} is required`,
          path: [field],
        });
      }
    });

    if (
      value.type === CommunicationType.UNSAFE_ACT &&
      !value.targetText &&
      !value.targetEmployeeId &&
      !value.targetEmployeeNo
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Unsafe Act requires target worker information",
        path: ["targetText"],
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

      if (!value.injuryTypeId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Injury type is required",
          path: ["injuryTypeId"],
        });
      }
    }
  });

export const validateCommunicationInput = z.object({
  isValid: z.boolean(),
  notes: z.string().min(2),
  status: z.enum(["VALID_OPEN", "REJECTED", "INVALID"]).optional(),
});

export const manualCloseCommunicationInput = z.object({
  reason: z.string().min(5),
});

export const reopenEntityInput = z.object({
  reason: z.string().min(5),
});

export const createActionInput = z.object({
  sourceType: z.enum(["COMMUNICATION", "SEWO", "MANUAL"]),
  communicationId: z.string().uuid().optional(),
  sewoId: z.string().uuid().optional(),
  category: z.nativeEnum(ActionCategory),
  priority: z.nativeEnum(ActionPriority),
  title: z.string().min(3),
  description: z.string().min(5),
  ownerUserId: z.string().uuid(),
  coOwnerIds: z.array(z.string().uuid()).optional(),
  dueDate: z.coerce.date().optional(),
});

export const closeActionInput = z.object({
  closureComment: z.string().min(5),
  evidence: z
    .array(
      z.object({
        fileKey: z.string().min(3),
        fileName: z.string().min(1),
        contentType: z.string().min(3),
      }),
    )
    .min(1),
});

export const createSEWOInput = z.object({
  communicationId: z.string().uuid(),
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
  immediateCorrectiveActionText: z.string().min(2),
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
    .min(1),
  status: z.nativeEnum(SEWOStatus).optional(),
});

export const approveSEWOInput = z.object({
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

export const issuePresignedUploadInput = z.object({
  plantCode: z.string().min(2),
  fileName: z.string().min(1),
  contentType: z.string().min(3),
  folder: z.enum(["communications", "actions", "sewo"]),
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
});

export const createMasterDataItemInput = z.object({
  type: z.enum(["area", "workstation"]),
  code: z.string().min(1),
  name: z.string().min(2),
});

export const createWorkerInput = z.object({
  employeeNo: z.string().min(1),
  name: z.string().min(2),
  dept: z.string().optional(),
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

export type CreateCommunicationInput = z.infer<typeof createCommunicationInput>;
export type ValidateCommunicationInput = z.infer<typeof validateCommunicationInput>;
export type ManualCloseCommunicationInput = z.infer<typeof manualCloseCommunicationInput>;
export type CreateActionInput = z.infer<typeof createActionInput>;
export type CloseActionInput = z.infer<typeof closeActionInput>;
export type ReopenActionInput = z.infer<typeof reopenEntityInput>;
export type CreateSEWOInput = z.infer<typeof createSEWOInput>;
export type ApproveSEWOInput = z.infer<typeof approveSEWOInput>;
export type UpdateAlertRuleInput = z.infer<typeof updateAlertRuleInput>;
export type IssuePresignedUploadInput = z.infer<typeof issuePresignedUploadInput>;
export type CreatePlantUserInput = z.infer<typeof createPlantUserInput>;
export type CreateMasterDataItemInput = z.infer<typeof createMasterDataItemInput>;
export type CreateWorkerInput = z.infer<typeof createWorkerInput>;
export type CreateCorporatePlantInput = z.infer<typeof createCorporatePlantInput>;
export type ChangePasswordInput = z.infer<typeof changePasswordInput>;
