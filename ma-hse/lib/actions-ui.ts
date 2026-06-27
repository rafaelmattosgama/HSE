export const BASE_ACTIONS_UI = {
  table: {
    local: "Local",
    allLocations: "All locations",
    status: "Status",
    allStatuses: "All statuses",
    owner: "Owner",
    allOwners: "All owners",
    dueFrom: "Due from",
    dueTo: "Due to",
    dateOrder: "Date order",
    dueDateAscending: "Due date ascending",
    dueDateDescending: "Due date descending",
    bulkClosureComment: "Bulk closure comment",
    bulkClosurePlaceholder: "What was done to close the selected actions?",
    closureDate: "Closure date",
    photosDocuments: "Photos / documents",
    closing: "Closing...",
    closeSelected: "Close selected",
    bulkHelp: "Select multiple actions in the list and close them together. Attachments are optional.",
    shownCount: "{count} action(s) shown. {openCount} open action(s).",
    exportExcel: "Export Excel",
    exportPdf: "Export PDF",
    exporting: "Exporting...",
    select: "Select",
    action: "Action",
    source: "Source",
    priority: "Priority",
    due: "Due",
    open: "Open",
    delete: "Delete",
    deleting: "Deleting...",
    hide: "Hide",
    openClose: "Open / close",
    openOnly: "Open",
    linkedRecords: "Linked records",
    manualOrigin: "Manual origin",
    communication: "Communication",
    sewo: "S-EWO",
    smat: "SMAT",
    evidenceAttached: "Evidence already attached",
    closeAction: "Close action",
    describeClosure: "Describe what was done.",
    alreadyClosed: "This action is already closed.",
    noRows: "No actions were found for the selected filters.",
    selectAtLeastOne: "Select at least one action.",
    closureCommentMin: "Write at least 5 characters in the closure comment.",
    bulkClosureCommentMin: "Write at least 5 characters in the bulk closure comment.",
    selectClosureDate: "Select a closure date.",
    closeFailed: "Failed to close action",
    bulkCloseFailed: "Failed to close selected actions",
    deleteFailed: "Failed to delete action",
    exportFailed: "Failed to export actions.",
    confirmDelete: "Delete this action? This action cannot be undone.",
  },
  detail: {
    title: "Action Detail",
    main: "Main",
    lifecycle: "Lifecycle",
    fieldTitle: "Title",
    fieldStatus: "Status",
    fieldPriority: "Priority",
    fieldCategory: "Category",
    fieldSourceType: "Source type",
    fieldOwner: "Owner",
    fieldDueDate: "Due date",
    fieldCreatedAt: "Created at",
    fieldUpdatedAt: "Updated at",
    fieldClosureDate: "Closure date",
    fieldClosedAt: "Closed at",
    fieldClosedBy: "Closed by",
    fieldReopenedAt: "Reopened at",
    fieldReopenedBy: "Reopened by",
    description: "Action",
    linkedRecordDescription: "Communication description",
    linkedRecords: "Linked records",
    manualOrigin: "Manual origin",
    communication: "Communication",
    sewo: "S-EWO",
    smat: "SMAT",
    coOwners: "Co-owners",
    evidence: "Evidence",
    comments: "Comments",
    closureComment: "Closure comment",
    reopenReason: "Reopen reason",
    backToActions: "Back to actions",
  },
  statusLabels: {
    OPEN: "Open",
    ONGOING: "Ongoing",
    CLOSED: "Closed",
  },
  priorityLabels: {
    LOW: "Low",
    MEDIUM: "Medium",
    HIGH: "High",
  },
  categoryLabels: {
    CORRECTIVE: "Corrective",
    PREVENTIVE: "Preventive",
    IMPROVEMENT: "Improvement",
  },
  sourceTypeLabels: {
    MANUAL: "Manual",
    COMMUNICATION: "Communication",
    SEWO: "S-EWO",
    SMAT: "SMAT",
  },
  manualOriginLabels: {
    AUDITS: "Audits",
    EXTERNAL_VERIFICATIONS: "External verifications",
    OTHER: "Other",
  },
} as const;

type WidenStrings<T> = {
  [Key in keyof T]: T[Key] extends string
    ? string
    : T[Key] extends Record<string, unknown>
      ? WidenStrings<T[Key]>
      : T[Key];
};

export type ActionsUi = WidenStrings<typeof BASE_ACTIONS_UI>;

export function formatLocalizedActionStatus(
  status: string,
  ui: Pick<ActionsUi, "statusLabels">,
) {
  return ui.statusLabels[status as keyof ActionsUi["statusLabels"]] ?? status;
}

export function formatLocalizedActionPriority(
  priority: string,
  ui: Pick<ActionsUi, "priorityLabels">,
) {
  return ui.priorityLabels[priority as keyof ActionsUi["priorityLabels"]] ?? priority;
}

export function formatLocalizedActionCategory(
  category: string,
  ui: Pick<ActionsUi, "categoryLabels">,
) {
  return ui.categoryLabels[category as keyof ActionsUi["categoryLabels"]] ?? category;
}

export function formatLocalizedActionSourceType(
  sourceType: string,
  ui: Pick<ActionsUi, "sourceTypeLabels">,
) {
  return ui.sourceTypeLabels[sourceType as keyof ActionsUi["sourceTypeLabels"]] ?? sourceType;
}

export function formatLocalizedActionManualOrigin(
  manualOrigin: string | null | undefined,
  ui: Pick<ActionsUi, "manualOriginLabels">,
) {
  if (!manualOrigin) return "-";
  return ui.manualOriginLabels[manualOrigin as keyof ActionsUi["manualOriginLabels"]] ?? manualOrigin;
}
