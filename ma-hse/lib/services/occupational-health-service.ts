import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { UpsertOccupationalHealthWorkerInput } from "@/lib/validation/dtos";

type OccupationalHealthWorkerRow = {
  id: string;
  plantId: string;
  employeeNo: string;
  name: string;
  birthDate: Date;
  workstationId: string | null;
  workstationName: string | null;
  gender: string;
  hireDate: Date;
  roleStartDate: Date;
  roleName: string | null;
  nationality: string | null;
  examDate: Date;
  validUntil: Date | null;
  status: string;
  observation: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type OccupationalHealthWorkerView = {
  id: string;
  employeeNo: string;
  name: string;
  birthDate: string;
  age: number;
  workstationId: string | null;
  workstationName: string | null;
  gender: "MALE" | "FEMALE";
  hireDate: string;
  roleStartDate: string;
  roleName: string | null;
  nationality: string | null;
  examDate: string;
  validUntil: string | null;
  status: string;
  observation: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

function calculateAge(birthDate: Date) {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age;
}

function pdfBufferFromDocument(doc: InstanceType<typeof PDFDocument>) {
  return new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.end();
  });
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getHeaderIndex(headerMap: Map<string, number>, ...keys: string[]) {
  for (const key of keys) {
    const index = headerMap.get(normalizeHeader(key));
    if (typeof index === "number") return index;
  }
  return undefined;
}

function parseExcelDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseGender(value: unknown): "MALE" | "FEMALE" {
  const normalized = normalizeHeader(value);
  return normalized.startsWith("f") ? "FEMALE" : "MALE";
}

function parseStatus(value: unknown): "VALID" | "EXPIRED" | "DUE_SOON" | "PENDING" {
  const normalized = normalizeHeader(value);
  if (normalized.includes("expir")) return "EXPIRED";
  if (normalized.includes("soon") || normalized.includes("breve")) return "DUE_SOON";
  if (normalized.includes("pend")) return "PENDING";
  return "VALID";
}

function mapWorker(row: OccupationalHealthWorkerRow): OccupationalHealthWorkerView {
  return {
    id: row.id,
    employeeNo: row.employeeNo,
    name: row.name,
    birthDate: row.birthDate.toISOString(),
    age: calculateAge(row.birthDate),
    workstationId: row.workstationId,
    workstationName: row.workstationName,
    gender: row.gender === "FEMALE" ? "FEMALE" : "MALE",
    hireDate: row.hireDate.toISOString(),
    roleStartDate: row.roleStartDate.toISOString(),
    roleName: row.roleName,
    nationality: row.nationality,
    examDate: row.examDate.toISOString(),
    validUntil: row.validUntil?.toISOString() ?? null,
    status: row.status,
    observation: row.observation,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findWorkstationId(plantId: string, workstationName: string) {
  if (!workstationName.trim()) return null;
  const workstation = await prisma.workstation.findFirst({
    where: {
      plantId,
      name: {
        equals: workstationName.trim(),
        mode: "insensitive",
      },
    },
    select: { id: true },
  });
  return workstation?.id ?? null;
}

export const OccupationalHealthService = {
  async list(plantId: string) {
    const rows = await prisma.$queryRaw<OccupationalHealthWorkerRow[]>(Prisma.sql`
      SELECT
        ohw."id",
        ohw."plantId",
        ohw."employeeNo",
        ohw."name",
        ohw."birthDate",
        ohw."workstationId",
        ws."name" as "workstationName",
        ohw."gender",
        ohw."hireDate",
        ohw."roleStartDate",
        ohw."roleName",
        ohw."nationality",
        ohw."examDate",
        ohw."validUntil",
        ohw."status",
        ohw."observation",
        ohw."isActive",
        ohw."createdAt",
        ohw."updatedAt"
      FROM "OccupationalHealthWorker" ohw
      LEFT JOIN "Workstation" ws ON ws."id" = ohw."workstationId"
      WHERE ohw."plantId" = ${plantId}
      ORDER BY ohw."name" ASC
    `);

    return rows.map(mapWorker);
  },

  async upsert(plantId: string, input: UpsertOccupationalHealthWorkerInput, workerId?: string) {
    const existing = workerId
      ? await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id"
          FROM "OccupationalHealthWorker"
          WHERE "id" = ${workerId} AND "plantId" = ${plantId}
          LIMIT 1
        `)
      : [];

    const id = existing[0]?.id ?? workerId ?? randomUUID();

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "OccupationalHealthWorker" (
        "id", "plantId", "employeeNo", "name", "birthDate", "workstationId", "gender",
        "hireDate", "roleStartDate", "roleName", "nationality", "examDate", "validUntil",
        "status", "observation", "isActive", "createdAt", "updatedAt"
      )
      VALUES (
        ${id}, ${plantId}, ${input.employeeNo.trim()}, ${input.name.trim()}, ${input.birthDate},
        ${input.workstationId ?? null}, ${input.gender}, ${input.hireDate}, ${input.roleStartDate},
        ${input.roleName?.trim() || null}, ${input.nationality?.trim() || null}, ${input.examDate},
        ${input.validUntil ?? null}, ${input.status}, ${input.observation?.trim() || null}, ${input.isActive},
        NOW(), NOW()
      )
      ON CONFLICT ("id") DO UPDATE SET
        "employeeNo" = EXCLUDED."employeeNo",
        "name" = EXCLUDED."name",
        "birthDate" = EXCLUDED."birthDate",
        "workstationId" = EXCLUDED."workstationId",
        "gender" = EXCLUDED."gender",
        "hireDate" = EXCLUDED."hireDate",
        "roleStartDate" = EXCLUDED."roleStartDate",
        "roleName" = EXCLUDED."roleName",
        "nationality" = EXCLUDED."nationality",
        "examDate" = EXCLUDED."examDate",
        "validUntil" = EXCLUDED."validUntil",
        "status" = EXCLUDED."status",
        "observation" = EXCLUDED."observation",
        "isActive" = EXCLUDED."isActive",
        "updatedAt" = NOW()
    `);

    const [row] = await prisma.$queryRaw<OccupationalHealthWorkerRow[]>(Prisma.sql`
      SELECT
        ohw."id",
        ohw."plantId",
        ohw."employeeNo",
        ohw."name",
        ohw."birthDate",
        ohw."workstationId",
        ws."name" as "workstationName",
        ohw."gender",
        ohw."hireDate",
        ohw."roleStartDate",
        ohw."roleName",
        ohw."nationality",
        ohw."examDate",
        ohw."validUntil",
        ohw."status",
        ohw."observation",
        ohw."isActive",
        ohw."createdAt",
        ohw."updatedAt"
      FROM "OccupationalHealthWorker" ohw
      LEFT JOIN "Workstation" ws ON ws."id" = ohw."workstationId"
      WHERE ohw."id" = ${id}
      LIMIT 1
    `);

    return mapWorker(row);
  },

  async setActive(plantId: string, workerId: string, isActive: boolean) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "OccupationalHealthWorker"
      SET "isActive" = ${isActive}, "updatedAt" = NOW()
      WHERE "id" = ${workerId} AND "plantId" = ${plantId}
    `);
  },

  async importFromExcel(plantId: string, fileBuffer: Uint8Array) {
    const workbook = new ExcelJS.Workbook();
    await ((workbook.xlsx as unknown) as { load: (input: Uint8Array) => Promise<void> }).load(fileBuffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new Error("Excel file does not contain any worksheet");
    }

    let headerRowNumber = 0;
    let headerMap = new Map<string, number>();

    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 10); rowNumber += 1) {
      const values = (sheet.getRow(rowNumber).values as unknown[]).map(normalizeHeader);
      if (values.includes("nome") && values.includes("data de nascimento")) {
        headerRowNumber = rowNumber;
        headerMap = new Map(values.map((value, index) => [value, index]));
        break;
      }
    }

    if (!headerRowNumber) {
      throw new Error("Could not find a valid header row in the Excel file");
    }

    let imported = 0;
    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const employeeNo = row.getCell(getHeaderIndex(headerMap, "N.º Interno", "N.o Interno", "Nº Interno") ?? 1).value;
      const name = row.getCell(getHeaderIndex(headerMap, "Nome") ?? 2).value;

      if (!employeeNo || !name) continue;

      const employeeNoText = String(employeeNo).trim();
      const nameText = String(name).trim();
      if (!employeeNoText || !nameText || normalizeHeader(employeeNoText).includes("interno")) continue;

      const birthDate = parseExcelDate(row.getCell(getHeaderIndex(headerMap, "Data de Nascimento") ?? 3).value);
      const hireDate = parseExcelDate(
        row.getCell(getHeaderIndex(headerMap, "Data de Admissão", "Data de Admissao") ?? 10).value,
      );
      const parsedRoleStartDate = parseExcelDate(
        row.getCell(getHeaderIndex(headerMap, "Data de Admisão à função", "Data de Admissao à função", "Data de Admissao a funcao") ?? 11).value,
      );
      const examDate = parseExcelDate(
        row.getCell(getHeaderIndex(headerMap, "Data Ultimo exame", "Data Ultimo exame ") ?? 12).value,
      );

      if (!birthDate || !hireDate || !examDate) continue;

      const roleStartDate = parsedRoleStartDate ?? hireDate;
      const workstationName = String(row.getCell(getHeaderIndex(headerMap, "Posto trabalho", "Posto de trabalho") ?? 7).value ?? "").trim();
      const workstationId = await findWorkstationId(plantId, workstationName);

      await this.upsert(plantId, {
        employeeNo: employeeNoText,
        name: nameText,
        birthDate,
        workstationId,
        gender: parseGender(row.getCell(getHeaderIndex(headerMap, "Género", "Genero") ?? 8).value),
        hireDate,
        roleStartDate,
        roleName: String(row.getCell(getHeaderIndex(headerMap, "Função", "Funcao", "Categoria profissional") ?? 6).value ?? "").trim() || undefined,
        nationality: String(row.getCell(getHeaderIndex(headerMap, "Nacionalidade") ?? 9).value ?? "").trim() || undefined,
        examDate,
        validUntil: parseExcelDate(row.getCell(getHeaderIndex(headerMap, "Data de Validade", "Proximo exame") ?? 13).value) ?? undefined,
        status: parseStatus(row.getCell(getHeaderIndex(headerMap, "Estado") ?? 14).value),
        observation: String(row.getCell(getHeaderIndex(headerMap, "Observações", "Observacoes") ?? 15).value ?? "").trim() || undefined,
        isActive: true,
      });

      imported += 1;
    }

    return { imported };
  },

  async buildExport(plantId: string, plantCode: string) {
    const workers = await this.list(plantId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Medicina do Trabalho");
    sheet.mergeCells("A1:O1");
    sheet.getCell("A1").value = "Dados Medicina do Trabalho";
    sheet.getCell("A1").font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    sheet.columns = [
      { header: "N.º Interno", key: "employeeNo", width: 18 },
      { header: "Nome", key: "name", width: 30 },
      { header: "Data de Nascimento", key: "birthDate", width: 18 },
      { header: "Idade", key: "age", width: 10 },
      { header: "Categoria profissional ", key: "professionalCategory", width: 24 },
      { header: "Função", key: "roleName", width: 24 },
      { header: "Posto trabalho", key: "workstationName", width: 24 },
      { header: "Género", key: "gender", width: 14 },
      { header: "Nacionalidade", key: "nationality", width: 18 },
      { header: "Data de Admissão", key: "hireDate", width: 18 },
      { header: "Data de Admisão à função", key: "roleStartDate", width: 20 },
      { header: "Data Ultimo exame ", key: "examDate", width: 22 },
      { header: "Data de Validade", key: "validUntil", width: 18 },
      { header: "Estado", key: "status", width: 14 },
      { header: "Observações", key: "observation", width: 40 },
    ];
    sheet.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };

    workers.forEach((worker) => {
      sheet.addRow({
        employeeNo: worker.employeeNo,
        name: worker.name,
        birthDate: worker.birthDate.slice(0, 10),
        age: worker.age,
        professionalCategory: worker.roleName ?? "-",
        roleName: worker.roleName ?? "-",
        workstationName: worker.workstationName ?? "-",
        gender: worker.gender === "MALE" ? "Masculino" : "Feminino",
        nationality: worker.nationality ?? "-",
        hireDate: worker.hireDate.slice(0, 10),
        roleStartDate: worker.roleStartDate.slice(0, 10),
        examDate: worker.examDate.slice(0, 10),
        validUntil: worker.validUntil?.slice(0, 10) ?? "-",
        status: worker.isActive ? worker.status : "INACTIVE",
        observation: worker.observation ?? "-",
      });
    });

    sheet.eachRow((row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });

    const xlsxBuffer = await workbook.xlsx.writeBuffer();

    const doc = new PDFDocument({ margin: 36, size: "A4" });
    doc.fontSize(18).text(`Medicina do Trabalho - ${plantCode.toUpperCase()}`);
    doc.moveDown(0.5);
    doc.fontSize(10).text(`Generated on ${new Date().toISOString().slice(0, 10)}`);
    doc.moveDown();

    if (workers.length === 0) {
      doc.fontSize(11).text("No workers registered.");
    } else {
      workers.forEach((worker, index) => {
        if (index > 0) doc.moveDown(0.5);
        doc.fontSize(11).text(`${worker.employeeNo} | ${worker.name}`, { underline: true });
        doc.fontSize(9).text(
          `Age: ${worker.age} | Exam: ${worker.examDate.slice(0, 10)} | Valid until: ${worker.validUntil?.slice(0, 10) ?? "-"} | Status: ${worker.isActive ? worker.status : "INACTIVE"}`,
        );
        doc.text(
          `Role: ${worker.roleName ?? "-"} | Workstation: ${worker.workstationName ?? "-"} | Gender: ${worker.gender === "MALE" ? "Masculino" : "Feminino"}`,
        );
        doc.text(`Nationality: ${worker.nationality ?? "-"} | Observation: ${worker.observation ?? "-"}`);
      });
    }

    const pdf = await pdfBufferFromDocument(doc);

    return {
      pdf,
      xlsx: Buffer.from(xlsxBuffer as ArrayBuffer),
    };
  },
};
