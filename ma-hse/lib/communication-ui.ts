export const BASE_COMMUNICATION_UI = {
  validationQueue: {
    allTypes: "All types",
    reporter: "Reporter",
    department: "Department",
    location: "Location",
    date: "Date",
    openEdit: "Open / Edit",
  },
  validationActions: {
    title: "Validation",
    defaultNotes: "Reviewed by safety",
    validate: "Validate",
    validateCommunication: "Validate communication",
    reject: "Reject",
    rejectCommunication: "Reject communication",
    confirmReject: "Reject and delete this communication? This action cannot be undone.",
    saved: "Validation saved",
    rejectedDeleted: "Communication rejected and deleted",
    failed: "Validation failed",
    reporterReviewRequired: "Open the communication and select a valid reporter before validating.",
    classificationRequired: "Open the communication and complete the required classification fields before validating.",
  },
  detailPage: {
    attachments: "Attachments",
    noAttachments: "No attachments.",
    linkedRecords: "Linked records",
    actions: "Actions",
    sewoRecords: "S-EWO records",
    backToCommunications: "Back to communications",
    backToValidation: "Back to validation",
  },
  detailEditor: {
    communicationRecord: "Communication record",
    reporterFromPlantWorkers: "Reporter from plant workers",
    department: "Department",
    location: "Location",
    equipment: "Equipment",
    severityPotential: "Severity potential",
    unsafeActType: "Unsafe act type",
    unsafeConditionType: "Unsafe condition type",
    nearMissType: "Near miss type",
    involvedWorker: "Involved worker",
    injuryType: "Injury type",
    contractorInvolved: "Contractor involved",
    lostDays: "Lost days",
    fatalInjury: "Fatal injury",
    suggestedAction: "Suggested action",
    low: "Low",
    medium: "Medium",
    high: "High",
    saving: "Saving...",
    saveCommunication: "Save communication",
    updatedSuccessfully: "Communication updated successfully.",
    updateFailed: "Failed to update communication",
    editingRestricted: "Editing is available only when the user has the required N1, N2 or N3 permissions for the current workflow state.",
  },
  createActionQuick: {
    newLinkedAction: "New linked action",
    newAction: "New action",
    manualAction: "Manual action",
    linkedToCommunication: "Linked to communication",
    linkedCommunication: "Linked communication",
    selectCommunication: "Select communication",
    noLinkMessage: "This action will be created without links to communication, S-EWO or SMAT.",
    title: "Title",
    description: "Description",
    owner: "Owner",
    createAction: "Create action",
    actionCreated: "Action created",
    failedCreatingAction: "Failed creating action",
    categoryLabels: {
      CORRECTIVE: "Corrective",
      PREVENTIVE: "Preventive",
      IMPROVEMENT: "Improvement",
    },
    priorityLabels: {
      LOW: "Low",
      MEDIUM: "Medium",
      HIGH: "High",
    },
  },
  communicationTypeLabels: {
    UNSAFE_ACT: "Unsafe Act",
    UNSAFE_CONDITION: "Unsafe Condition",
    NEAR_MISS: "Near Miss",
    FIRST_AID: "First Aid",
    ACCIDENT: "Injury",
  },
  communicationStatusLabels: {
    SUBMITTED: "To Do",
    PENDING_VALIDATION: "Pending Validation",
    VALID_OPEN: "To Do",
    ONGOING: "On Going",
    CLOSED: "Closed",
    REJECTED: "Reject",
    INVALID: "Reject",
  },
  actionStatusLabels: {
    OPEN: "Open",
    ONGOING: "Ongoing",
    CLOSED: "Closed",
  },
} as const;

type WidenStrings<T> = {
  [Key in keyof T]: T[Key] extends string
    ? string
    : T[Key] extends Record<string, unknown>
      ? WidenStrings<T[Key]>
      : T[Key];
};

export type CommunicationUi = WidenStrings<typeof BASE_COMMUNICATION_UI>;
