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

export type ActionLinkedRecordInput = {
  sourceType?: string | null;
  communicationId?: string | null;
  sewoId?: string | null;
  communication?: LinkedCommunicationRecord | null;
  sewo?: LinkedSewoRecord | null;
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

  return "-";
}

export function getActionLinkedRecordCodes(action: ActionLinkedRecordInput) {
  return {
    communicationCode: action.communication
      ? cleanDisplayValue(action.communication.codigoCompleto ?? action.communication.codigoAbreviado)
      : "-",
    sewoCode: action.sewo
      ? cleanDisplayValue(action.sewo.codigoSewo)
      : "-",
  };
}
