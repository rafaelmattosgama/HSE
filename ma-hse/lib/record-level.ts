import type { RecordLevel } from "@prisma/client";

export const RECORD_LEVELS: RecordLevel[] = ["N1", "N2", "N3", "N4"];

export function formatRecordLevel(level?: RecordLevel | string | null) {
  return level ?? "-";
}
