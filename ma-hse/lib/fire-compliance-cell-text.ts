import { FireComplianceCellState } from "@prisma/client";
import type { FireEquipmentUiDictionary } from "@/lib/ui-language";

type CellLike = {
  state: FireComplianceCellState | string;
  dueDate: Date | string | null;
};

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString();
}

/** §4: cell text is dynamic (date / days), never a static label alone. */
export function formatFireComplianceCellText(cell: CellLike, labels: FireEquipmentUiDictionary): string {
  switch (cell.state) {
    case FireComplianceCellState.VALID:
      return cell.dueDate ? labels.cellValidUntil.replace("{date}", formatDate(cell.dueDate)) : labels.stateValid;
    case FireComplianceCellState.DUE_SOON: {
      if (!cell.dueDate) return labels.stateDueSoon;
      const days = Math.max(0, Math.ceil((new Date(cell.dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
      return labels.cellDueInDays.replace("{days}", String(days));
    }
    case FireComplianceCellState.OVERDUE:
      return cell.dueDate ? labels.cellOverdueSince.replace("{date}", formatDate(cell.dueDate)) : labels.stateOverdue;
    case FireComplianceCellState.NEVER_DONE:
      return labels.stateNeverChecked;
    case FireComplianceCellState.NOT_APPLICABLE:
      return labels.stateOutOfService;
    default:
      return cell.state;
  }
}
