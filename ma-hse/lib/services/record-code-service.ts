import { Prisma, type CommunicationType, type ReportType } from "@prisma/client";
import {
  gerarCodigoAbreviado,
  gerarCodigoCompleto,
  gerarCodigoSewo,
  getCommunicationRecordType,
  getReportRecordType,
  normalizeAno,
  normalizeCodigoFabrica,
  type RecordCodeType,
} from "@/lib/record-code";
import { prisma } from "@/lib/prisma";

type PrismaClientOrTransaction = typeof prisma | Prisma.TransactionClient;

type SequenceEntityType = "COMMUNICATION" | "SEWO" | "REPORT";

async function nextSequence(tx: PrismaClientOrTransaction, input: {
  entityType: SequenceEntityType;
  tipo: RecordCodeType;
  codigoFabrica: string;
  ano: number;
}) {
  try {
    const updated = await tx.recordCodeSequence.update({
      where: {
        entityType_tipo_codigoFabrica_ano: {
          entityType: input.entityType,
          tipo: input.tipo,
          codigoFabrica: input.codigoFabrica,
          ano: input.ano,
        },
      },
      data: {
        currentValue: {
          increment: 1,
        },
      },
      select: {
        currentValue: true,
      },
    });

    return updated.currentValue;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      try {
        const created = await tx.recordCodeSequence.create({
          data: {
            entityType: input.entityType,
            tipo: input.tipo,
            codigoFabrica: input.codigoFabrica,
            ano: input.ano,
            currentValue: 1,
          },
          select: {
            currentValue: true,
          },
        });

        return created.currentValue;
      } catch (createError) {
        if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === "P2002") {
          return nextSequence(tx, input);
        }

        throw createError;
      }
    }

    throw error;
  }
}

async function allocateBaseCode(tx: PrismaClientOrTransaction, input: {
  entityType: SequenceEntityType;
  tipo: RecordCodeType;
  codigoFabrica: string;
  ano: number;
}) {
  const tipo = input.tipo;
  const codigoFabrica = normalizeCodigoFabrica(input.codigoFabrica);
  const ano = normalizeAno(input.ano);
  const numeroSequencial = await nextSequence(tx, {
    entityType: input.entityType,
    tipo,
    codigoFabrica,
    ano,
  });

  return {
    tipo,
    codigoFabrica,
    ano,
    numeroSequencial,
  };
}

export const RecordCodeService = {
  async allocateCommunicationCode(tx: PrismaClientOrTransaction, input: {
    communicationType: CommunicationType;
    codigoFabrica: string;
    eventDatetime: Date;
  }) {
    const tipo = getCommunicationRecordType(input.communicationType);
    if (!tipo) return null;

    const base = await allocateBaseCode(tx, {
      entityType: "COMMUNICATION",
      tipo,
      codigoFabrica: input.codigoFabrica,
      ano: input.eventDatetime.getUTCFullYear(),
    });

    return {
      ...base,
      codigoCompleto: gerarCodigoCompleto(base.tipo, base.codigoFabrica, base.ano, base.numeroSequencial),
      codigoAbreviado: gerarCodigoAbreviado(base.ano, base.numeroSequencial),
    };
  },

  async allocateSewoCode(tx: PrismaClientOrTransaction, input: {
    communicationType: CommunicationType | string | null | undefined;
    codigoFabrica: string;
    analysisDate: Date;
  }) {
    const tipo = getCommunicationRecordType(input.communicationType);
    if (!tipo) return null;

    const base = await allocateBaseCode(tx, {
      entityType: "SEWO",
      tipo,
      codigoFabrica: input.codigoFabrica,
      ano: input.analysisDate.getUTCFullYear(),
    });

    return {
      ...base,
      codigoSewo: gerarCodigoSewo(base.codigoFabrica, base.tipo, base.ano, base.numeroSequencial),
    };
  },

  async allocateReportCode(tx: PrismaClientOrTransaction, input: {
    reportType: ReportType | string;
    codigoFabrica: string;
    periodStart: Date;
  }) {
    const base = await allocateBaseCode(tx, {
      entityType: "REPORT",
      tipo: getReportRecordType(input.reportType),
      codigoFabrica: input.codigoFabrica,
      ano: input.periodStart.getUTCFullYear(),
    });

    return {
      ...base,
      codigoCompleto: gerarCodigoCompleto(base.tipo, base.codigoFabrica, base.ano, base.numeroSequencial),
      codigoAbreviado: gerarCodigoAbreviado(base.ano, base.numeroSequencial),
    };
  },
};
