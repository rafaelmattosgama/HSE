import { CompetenceCellState } from "@prisma/client";
import { formatCompetenceBlockedReason, formatCompetenceCellText } from "@/lib/competence-cell-text";
import type { CompetencesUiDictionary } from "@/lib/ui-language";

export type CompetenceActionCategory = "CORRECTIVE" | "PREVENTIVE";
export type CompetenceActionPriority = "LOW" | "MEDIUM" | "HIGH";

export type CompetenceActionGapInput = {
  competenceTypeName: string;
  workerName: string;
  state: CompetenceCellState | string;
  isRequired: boolean;
  validUntil: Date | string | null;
  daysToExpiry: number | null;
  roleName: string | null;
  departmentName: string | null;
  blockedReason: string | null;
};

export type CompetenceActionPrefill = {
  category: CompetenceActionCategory;
  priority: CompetenceActionPriority;
  title: string;
  description: string;
  /** yyyy-mm-dd, or null to let the server compute today + SLA[priority] (§8). */
  dueDate: string | null;
};

function toDateInputValue(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

/**
 * §8 of docs/modulo-competencias-autorizacoes.md — the exact pre-fill table
 * for "Criar Ação a partir de uma lacuna". ownerUserId is deliberately not
 * computed here: it is the one field the doc calls out as always editable,
 * chosen from the plant's users by whoever creates the action.
 */
export function computeCompetenceActionPrefill(
  input: CompetenceActionGapInput,
  labels: CompetencesUiDictionary,
): CompetenceActionPrefill {
  const isCorrectiveState = input.state === CompetenceCellState.EXPIRED || input.state === CompetenceCellState.MISSING;
  const category: CompetenceActionCategory = isCorrectiveState ? "CORRECTIVE" : "PREVENTIVE";
  const priority: CompetenceActionPriority = isCorrectiveState && input.isRequired
    ? "HIGH"
    : input.state === CompetenceCellState.EXPIRING
      ? "MEDIUM"
      : "LOW";

  const stateLabel = formatCompetenceCellText(
    { state: input.state, validUntil: input.validUntil, daysToExpiry: input.daysToExpiry },
    labels,
  );

  const title = `${input.competenceTypeName} — ${stateLabel} — ${input.workerName}`;

  const descriptionLines = [
    stateLabel,
    input.roleName ? `${labels.profileRoleLabel}: ${input.roleName}` : null,
    input.departmentName ? `${labels.profileDeptLabel}: ${input.departmentName}` : null,
    input.blockedReason ? formatCompetenceBlockedReason(input.blockedReason, labels) : null,
    input.state === CompetenceCellState.MISSING ? labels.actionMissingDetail : null,
  ].filter((line): line is string => Boolean(line));

  const dueDate = input.state === CompetenceCellState.EXPIRING && input.validUntil
    ? toDateInputValue(input.validUntil)
    : null;

  return {
    category,
    priority,
    title,
    description: descriptionLines.join("\n"),
    dueDate,
  };
}
