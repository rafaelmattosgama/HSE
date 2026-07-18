import { CommunicationType, ReportType } from "@prisma/client";

export const RECORD_CODE_TYPES = ["UA", "UC", "NM", "FA", "IN", "5S", "IMP"] as const;

export type RecordCodeType = typeof RECORD_CODE_TYPES[number];

const COMMUNICATION_TYPE_CODES: Partial<Record<CommunicationType, RecordCodeType>> = {
  [CommunicationType.UNSAFE_ACT]: "UA",
  [CommunicationType.UNSAFE_CONDITION]: "UC",
  [CommunicationType.NEAR_MISS]: "NM",
  [CommunicationType.FIRST_AID]: "FA",
  [CommunicationType.ACCIDENT]: "IN",
  [CommunicationType.FIVE_S_IMPROVEMENT]: "5S",
  [CommunicationType.IMPROVEMENT_SUGGESTION]: "IMP",
};

export function isRecordCodeType(value: string): value is RecordCodeType {
  return (RECORD_CODE_TYPES as readonly string[]).includes(value);
}

export function getCommunicationRecordType(type: CommunicationType | string | null | undefined) {
  if (!type) return null;
  return COMMUNICATION_TYPE_CODES[type as CommunicationType] ?? null;
}

export function getReportRecordType(_type: ReportType | string): RecordCodeType {
  void _type;
  return "IN";
}

export function normalizeCodigoFabrica(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(/[^A-Za-z0-9]+/g, "")
    .toUpperCase();

  if (!normalized) {
    throw new Error("codigoFabrica is required");
  }

  return normalized;
}

export function normalizeAno(value: number) {
  if (!Number.isInteger(value) || value < 2000 || value > 9999) {
    throw new Error("ano must be a valid four digit year");
  }

  return value;
}

export function normalizeNumeroSequencial(value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("numeroSequencial must be a positive integer");
  }

  return value;
}

export function formatNumeroSequencial(value: number) {
  return String(normalizeNumeroSequencial(value)).padStart(2, "0");
}

export function gerarCodigoCompleto(
  tipo: RecordCodeType,
  codigoFabrica: string,
  ano: number,
  numeroSequencial: number,
) {
  if (!isRecordCodeType(tipo)) {
    throw new Error("tipo must be one of UA, UC, NM, FA, IN, 5S or IMP");
  }

  const factoryCode = normalizeCodigoFabrica(codigoFabrica);
  const year = normalizeAno(ano);
  const sequence = formatNumeroSequencial(numeroSequencial);
  return `${tipo}_${factoryCode}_${year}_${sequence}`;
}

export function gerarCodigoAbreviado(ano: number, numeroSequencial: number) {
  const year = normalizeAno(ano);
  const sequence = formatNumeroSequencial(numeroSequencial);
  return `#${year}${sequence}`;
}

export function gerarCodigoSewo(
  codigoFabrica: string,
  tipoComunicacao: RecordCodeType,
  ano: number,
  numeroSequencial: number,
) {
  if (!isRecordCodeType(tipoComunicacao)) {
    throw new Error("tipoComunicacao must be one of UA, UC, NM, FA, IN, 5S or IMP");
  }

  const factoryCode = normalizeCodigoFabrica(codigoFabrica);
  const year = normalizeAno(ano);
  const sequence = formatNumeroSequencial(numeroSequencial);
  return `sewo_${factoryCode}${tipoComunicacao}${year}${sequence}`;
}

export function getReadableCommunicationCode(record: {
  codigoCompleto?: string | null;
  codigoAbreviado?: string | null;
  id: string;
}) {
  return record.codigoCompleto ?? record.codigoAbreviado ?? record.id;
}

export function getReadableSewoCode(record: {
  codigoSewo?: string | null;
  id: string;
}) {
  return record.codigoSewo ?? record.id;
}
