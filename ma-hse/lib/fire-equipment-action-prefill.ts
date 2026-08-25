import { FireChecklistFrequency, FireChecklistResult } from "@prisma/client";
import type { FireEquipmentUiDictionary } from "@/lib/ui-language";

export type FireEquipmentActionCategory = "CORRECTIVE";
export type FireEquipmentActionPriority = "LOW" | "MEDIUM" | "HIGH";

export type FireEquipmentActionContext = {
  equipmentInternalCode: string;
  equipmentTypeName: string;
  areaName: string | null;
};

/**
 * §9's own trigger list is narrower than Competences' §8: only a
 * non-conformity or an overdue periodicity opens "Criar Ação" — there is no
 * DUE_SOON/preventive trigger here, so category is always CORRECTIVE.
 * nokItems is optional/may be empty: the equipment-list row entry point only
 * knows hasOpenNonConformity (a boolean, §6's own simplification pending
 * §9's own Action linkage), not which items failed — that item-level detail
 * is only available from the equipment profile's execution history.
 */
export type FireEquipmentActionReason =
  | {
      kind: "NON_CONFORMITY";
      overallResult: FireChecklistResult;
      nokItems: Array<{ label: string; isCritical: boolean; notes: string | null }>;
    }
  | {
      kind: "OVERDUE";
      frequency: FireChecklistFrequency;
      dueDate: Date | string | null;
    };

export type FireEquipmentActionPrefill = {
  category: FireEquipmentActionCategory;
  priority: FireEquipmentActionPriority;
  title: string;
  description: string;
};

function toDateLabel(value: Date | string | null, labels: FireEquipmentUiDictionary) {
  if (!value) return labels.actionUnknownDate;
  return new Date(value).toLocaleDateString();
}

function frequencyLabel(frequency: FireChecklistFrequency, labels: FireEquipmentUiDictionary) {
  return frequency === FireChecklistFrequency.QUARTERLY ? labels.profileQuarterlyLabel : labels.profileAnnualLabel;
}

/**
 * §9 of the fire-equipment module spec — "Criar Ação a partir de uma não
 * conformidade ou atraso". category/priority/title/description are always
 * computed here, never a free client field, mirroring
 * computeCompetenceActionPrefill's own precedent (§8 of the Competences
 * module). ownerUserId stays the one field chosen by whoever creates the
 * action; dueDate is left to the server's SLA calculation (never guessed
 * here), matching the EXPIRED/OVERDUE branch of the Competences prefill.
 */
export function computeFireEquipmentActionPrefill(
  context: FireEquipmentActionContext,
  reason: FireEquipmentActionReason,
  labels: FireEquipmentUiDictionary,
): FireEquipmentActionPrefill {
  if (reason.kind === "NON_CONFORMITY") {
    const priority: FireEquipmentActionPriority = reason.overallResult === FireChecklistResult.FAILED ? "HIGH" : "MEDIUM";
    const title = `${context.equipmentInternalCode} — ${context.equipmentTypeName} — ${labels.actionReasonNonConformity}`;
    const descriptionLines = [
      `${labels.columnType}: ${context.equipmentTypeName}`,
      context.areaName ? `${labels.fieldArea}: ${context.areaName}` : null,
      reason.nokItems.length > 0
        ? reason.nokItems
            .map((item) => `${labels.executionItemValueNok}: ${item.label}${item.isCritical ? ` (${labels.executionCriticalBadge})` : ""}${item.notes ? ` — ${item.notes}` : ""}`)
            .join("\n")
        : labels.actionNonConformityNoDetail,
    ].filter((line): line is string => Boolean(line));

    return {
      category: "CORRECTIVE",
      priority,
      title,
      description: descriptionLines.join("\n"),
    };
  }

  const title = `${context.equipmentInternalCode} — ${context.equipmentTypeName} — ${labels.actionReasonOverduePrefix} ${frequencyLabel(reason.frequency, labels)}`;
  const descriptionLines = [
    `${labels.columnType}: ${context.equipmentTypeName}`,
    context.areaName ? `${labels.fieldArea}: ${context.areaName}` : null,
    `${labels.cellOverdueSince.replace("{date}", toDateLabel(reason.dueDate, labels))}`,
  ].filter((line): line is string => Boolean(line));

  return {
    category: "CORRECTIVE",
    priority: "HIGH",
    title,
    description: descriptionLines.join("\n"),
  };
}
