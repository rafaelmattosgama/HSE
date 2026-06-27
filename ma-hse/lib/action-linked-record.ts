type LinkedCommunicationRecord = {
  id: string;
  description?: string | null;
  codigoCompleto?: string | null;
  codigoAbreviado?: string | null;
};

type LinkedSewoRecord = {
  id: string;
  howText?: string | null;
  codigoSewo?: string | null;
};

type LinkedSmatRecord = {
  id: string;
  auditDate?: Date | string | null;
  auditorName?: string | null;
  areaExamined?: string | null;
  locationExamined?: string | null;
  notes?: string | null;
};

type LinkedSmatActionLink = {
  smatAudit?: LinkedSmatRecord | null;
};

export type ActionLinkedRecordInput = {
  sourceType?: string | null;
  communicationId?: string | null;
  sewoId?: string | null;
  communication?: LinkedCommunicationRecord | null;
  sewo?: LinkedSewoRecord | null;
  smatLinks?: LinkedSmatActionLink[] | null;
};

function cleanDisplayValue(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "-";
}

export function getActionLinkedRecordDescription(action: ActionLinkedRecordInput) {
  if ((action.sourceType === "COMMUNICATION" || action.communicationId) && action.communication) {
    return cleanDisplayValue(action.communication.description);
  }

  if ((action.sourceType === "SEWO" || action.sewoId) && action.sewo) {
    return cleanDisplayValue(action.sewo.howText);
  }

  const smatAudit = action.smatLinks?.[0]?.smatAudit;
  if ((action.sourceType === "SMAT" || smatAudit) && smatAudit) {
    return cleanDisplayValue(smatAudit.notes ?? smatAudit.locationExamined ?? smatAudit.areaExamined);
  }

  return "-";
}

function formatSmatCode(smatAudit?: LinkedSmatRecord | null) {
  if (!smatAudit) return "-";

  const rawDate = smatAudit.auditDate instanceof Date
    ? smatAudit.auditDate.toISOString()
    : smatAudit.auditDate;
  const date = rawDate ? rawDate.slice(0, 10) : "-";
  const auditor = cleanDisplayValue(smatAudit.auditorName);
  return `SMAT | ${date} | ${auditor}`;
}

export function getActionLinkedRecordCodes(action: ActionLinkedRecordInput) {
  return {
    communicationCode: action.communication
      ? cleanDisplayValue(action.communication.codigoCompleto ?? action.communication.codigoAbreviado)
      : "-",
    sewoCode: action.sewo
      ? cleanDisplayValue(action.sewo.codigoSewo)
      : "-",
    smatCode: formatSmatCode(action.smatLinks?.[0]?.smatAudit),
  };
}
