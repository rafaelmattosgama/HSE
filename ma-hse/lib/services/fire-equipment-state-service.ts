import { FireChecklistFrequency, FireChecklistItemValue, FireChecklistResult, FireComplianceCellState, FireEquipmentStatus } from "@prisma/client";
import { addMonths, differenceInCalendarDays } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/**
 * §6 of docs/modulo-equipamentos-seguranca-incendio.md. Evaluated top to
 * bottom, first matching step wins — do not reorder the steps below.
 */
export const FIRE_EQUIPMENT_TIMEZONE = "Europe/Lisbon";

const CYCLE_MONTHS: Record<FireChecklistFrequency, number> = {
  [FireChecklistFrequency.QUARTERLY]: 3,
  [FireChecklistFrequency.ANNUAL]: 12,
};

export type ComputeFireCompliancePeriodicityInput = {
  now: Date;
  equipmentStatus: FireEquipmentStatus;
  frequency: FireChecklistFrequency;
  lastExecutionAt: Date | null;
  lastExecutionId: string | null;
  warningWindowDays: number;
};

export type ComputedFireCompliancePeriodicity = {
  state: FireComplianceCellState;
  dueDate: Date | null;
  lastExecutionId: string | null;
};

function daysUntil(target: Date, zonedToday: Date): number {
  return differenceInCalendarDays(toZonedTime(target, FIRE_EQUIPMENT_TIMEZONE), zonedToday);
}

export function computeFireCompliancePeriodicity(
  input: ComputeFireCompliancePeriodicityInput,
): ComputedFireCompliancePeriodicity {
  // Step 1
  if (input.equipmentStatus !== FireEquipmentStatus.ACTIVE) {
    return { state: FireComplianceCellState.NOT_APPLICABLE, dueDate: null, lastExecutionId: null };
  }

  // Steps 2-3
  if (!input.lastExecutionAt) {
    return { state: FireComplianceCellState.NEVER_DONE, dueDate: null, lastExecutionId: null };
  }

  // Step 4 — intervaloDa(QUARTERLY) = 3 months ; intervaloDa(ANNUAL) = 12 months
  const dueDate = addMonths(input.lastExecutionAt, CYCLE_MONTHS[input.frequency]);
  const zonedToday = toZonedTime(input.now, FIRE_EQUIPMENT_TIMEZONE);
  const daysToDue = daysUntil(dueDate, zonedToday);

  // Step 5
  if (daysToDue < 0) {
    return { state: FireComplianceCellState.OVERDUE, dueDate, lastExecutionId: input.lastExecutionId };
  }

  // Step 6 — warningWindowDays comes from SystemParameter (proportional to
  // the cycle, never the Competences module's 90-day literal — see §6's own
  // note: 90 days would leave a 90-day quarterly cycle permanently amber).
  if (daysToDue <= input.warningWindowDays) {
    return { state: FireComplianceCellState.DUE_SOON, dueDate, lastExecutionId: input.lastExecutionId };
  }

  // Step 7
  return { state: FireComplianceCellState.VALID, dueDate, lastExecutionId: input.lastExecutionId };
}

export type FireChecklistItemResponseForResult = {
  isCritical: boolean;
  value: FireChecklistItemValue;
};

/**
 * §3.5: overallResult is always derived here, never accepted as a free field
 * from the client — FAILED wins over PASSED_WITH_OBSERVATIONS regardless of
 * how many non-critical items also failed.
 */
export function calculateFireChecklistOverallResult(responses: FireChecklistItemResponseForResult[]): FireChecklistResult {
  const hasCriticalNok = responses.some((response) => response.isCritical && response.value === FireChecklistItemValue.NOK);
  if (hasCriticalNok) return FireChecklistResult.FAILED;

  const hasNonCriticalNok = responses.some((response) => !response.isCritical && response.value === FireChecklistItemValue.NOK);
  if (hasNonCriticalNok) return FireChecklistResult.PASSED_WITH_OBSERVATIONS;

  return FireChecklistResult.PASSED;
}
