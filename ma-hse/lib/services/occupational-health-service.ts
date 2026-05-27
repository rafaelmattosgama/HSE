import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import { createPdfDocument } from "@/lib/services/pdfkit-helper";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  calculateAgeOnDate,
  calculateOccupationalHealthExamValidUntil,
} from "@/lib/occupational-health-validity";
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
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getNormalizedRowValues(row: ExcelJS.Row) {
  return Array.from(row.values as unknown[]).map(normalizeHeader);
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

function buildFixedColumnHeaderMap() {
  return new Map<string, number>([
    ["n interno", 1],
    ["nome", 2],
    ["data de nascimento", 3],
    ["idade", 4],
    ["categoria profissional", 5],
    ["funcao", 6],
    ["posto trabalho", 7],
    ["genero", 8],
    ["nacionalidade", 9],
    ["data de admissao", 10],
    ["data de admissao a funcao", 11],
    ["data ultimo exame", 12],
    ["data de validade", 13],
    ["estado", 14],
    ["observacoes", 15],
  ]);
}

function looksLikeLegacyExport(sheet: ExcelJS.Worksheet) {
  const firstRowValues = getNormalizedRowValues(sheet.getRow(1)).filter(Boolean);
  if (!firstRowValues.length) return false;
  return firstRowValues.every((value) => value.includes("dados medicina do trabalho"));
}

function mapWorker(row: OccupationalHealthWorkerRow): OccupationalHealthWorkerView {
  const validUntil = calculateOccupationalHealthExamValidUntil({
    birthDate: row.birthDate,
    examDate: row.examDate,
  });

  return {
    id: row.id,
    employeeNo: row.employeeNo,
    name: row.name,
    birthDate: row.birthDate.toISOString(),
    age: calculateAgeOnDate(row.birthDate),
    workstationId: row.workstationId,
    workstationName: row.workstationName,
    gender: row.gender === "FEMALE" ? "FEMALE" : "MALE",
    hireDate: row.hireDate.toISOString(),
    roleStartDate: row.roleStartDate.toISOString(),
    roleName: row.roleName,
    nationality: row.nationality,
    examDate: row.examDate.toISOString(),
    validUntil: validUntil.toISOString(),
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
    const validUntil = calculateOccupationalHealthExamValidUntil({
      birthDate: input.birthDate,
      examDate: input.examDate,
    });

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
        ${validUntil}, ${input.status}, ${input.observation?.trim() || null}, ${input.isActive},
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
    let dataStartRow = 0;

    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 12); rowNumber += 1) {
      const values = getNormalizedRowValues(sheet.getRow(rowNumber));
      if (values.includes("nome") && values.includes("data de nascimento")) {
        headerRowNumber = rowNumber;
        headerMap = new Map(values.map((value, index) => [value, index]));
        dataStartRow = rowNumber + 1;
        break;
      }
    }

    if (!headerRowNumber) {
      if (!looksLikeLegacyExport(sheet)) {
        throw new Error("Could not find a valid header row in the Excel file");
      }

      headerMap = buildFixedColumnHeaderMap();
      dataStartRow = 3;
    }

    let imported = 0;
    let skipped = 0;
    for (let rowNumber = dataStartRow; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const employeeNo = row.getCell(getHeaderIndex(headerMap, "n interno", "numero interno") ?? 1).value;
      const name = row.getCell(getHeaderIndex(headerMap, "nome") ?? 2).value;

      if (!employeeNo || !name) continue;

      const employeeNoText = String(employeeNo).trim();
      const nameText = String(name).trim();
      if (!employeeNoText || !nameText || normalizeHeader(employeeNoText).includes("interno")) continue;

      const normalizedEmployeeNo = normalizeHeader(employeeNoText);
      const normalizedName = normalizeHeader(nameText);
      if (
        normalizedEmployeeNo === "required" ||
        normalizedEmployeeNo === "auto" ||
        normalizedName === "required" ||
        normalizedName === "auto" ||
        normalizedEmployeeNo.includes("use datas") ||
        normalizedEmployeeNo.includes("preencha os dados")
      ) {
        continue;
      }

      const birthDate = parseExcelDate(row.getCell(getHeaderIndex(headerMap, "data de nascimento") ?? 3).value);
      const hireDate = parseExcelDate(
        row.getCell(getHeaderIndex(headerMap, "data de admissao") ?? 10).value,
      );
      const parsedRoleStartDate = parseExcelDate(
        row.getCell(getHeaderIndex(headerMap, "data de admissao a funcao") ?? 11).value,
      );
      const examDate = parseExcelDate(
        row.getCell(getHeaderIndex(headerMap, "data ultimo exame") ?? 12).value,
      );

      if (!birthDate || !hireDate || !examDate) {
        skipped += 1;
        continue;
      }

      const roleStartDate = parsedRoleStartDate ?? hireDate;
      const workstationName = String(row.getCell(getHeaderIndex(headerMap, "posto trabalho", "posto de trabalho") ?? 7).value ?? "").trim();
      const workstationId = await findWorkstationId(plantId, workstationName);

      await this.upsert(plantId, {
        employeeNo: employeeNoText,
        name: nameText,
        birthDate,
        workstationId,
        gender: parseGender(row.getCell(getHeaderIndex(headerMap, "genero") ?? 8).value),
        hireDate,
        roleStartDate,
        roleName: String(row.getCell(getHeaderIndex(headerMap, "funcao", "categoria profissional") ?? 6).value ?? "").trim() || undefined,
        nationality: String(row.getCell(getHeaderIndex(headerMap, "nacionalidade") ?? 9).value ?? "").trim() || undefined,
        examDate,
        validUntil: undefined,
        status: parseStatus(row.getCell(getHeaderIndex(headerMap, "estado") ?? 14).value),
        observation: String(row.getCell(getHeaderIndex(headerMap, "observacoes") ?? 15).value ?? "").trim() || undefined,
        isActive: true,
      });

      imported += 1;
    }

    return { imported, skipped };
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
      { key: "employeeNo", width: 18 },
      { key: "name", width: 30 },
      { key: "birthDate", width: 18 },
      { key: "age", width: 10 },
      { key: "professionalCategory", width: 24 },
      { key: "roleName", width: 24 },
      { key: "workstationName", width: 24 },
      { key: "gender", width: 14 },
      { key: "nationality", width: 18 },
      { key: "hireDate", width: 18 },
      { key: "roleStartDate", width: 20 },
      { key: "examDate", width: 22 },
      { key: "validUntil", width: 18 },
      { key: "status", width: 14 },
      { key: "observation", width: 40 },
    ];
    sheet.getRow(2).values = [
      "N.º Interno",
      "Nome",
      "Data de Nascimento",
      "Idade",
      "Categoria profissional",
      "Função",
      "Posto trabalho",
      "Género",
      "Nacionalidade",
      "Data de Admissão",
      "Data de Admissão à função",
      "Data Ultimo exame",
      "Data de Validade",
      "Estado",
      "Observações",
    ];
    sheet.getRow(2).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    sheet.views = [{ state: "frozen", ySplit: 2 }];

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

    const doc = createPdfDocument({ margin: 36, size: "A4" });
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

  async buildImportTemplate(plantId: string, plantCode: string) {
    const workbook = new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet("Medicina do Trabalho");
    sheet.mergeCells("A1:O1");
    sheet.getCell("A1").value = `Template Medicina do Trabalho - ${plantCode.toUpperCase()}`;
    sheet.getCell("A1").font = { bold: true, size: 13, color: { argb: "FFFFFFFF" } };
    sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    sheet.columns = [
      { width: 18 },
      { width: 30 },
      { width: 18 },
      { width: 10 },
      { width: 24 },
      { width: 24 },
      { width: 24 },
      { width: 14 },
      { width: 18 },
      { width: 18 },
      { width: 20 },
      { width: 22 },
      { width: 18 },
      { width: 14 },
      { width: 40 },
    ];
    sheet.getCell("A2").value = "Preencha os dados nas linhas abaixo. Mantenha esta folha como a primeira do ficheiro.";
    sheet.mergeCells("A2:O2");
    sheet.getCell("A2").font = { italic: true, color: { argb: "FF475569" } };
    sheet.getRow(4).values = [
      "N.º Interno",
      "Nome",
      "Data de Nascimento",
      "Idade",
      "Categoria profissional",
      "Função",
      "Posto trabalho",
      "Género",
      "Nacionalidade",
      "Data de Admissão",
      "Data de Admissão à função",
      "Data Ultimo exame",
      "Data de Validade",
      "Estado",
      "Observações",
    ];
    sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(4).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    sheet.getRow(5).values = [
      "",
      "Required",
      "Required",
      "Auto",
      "Optional",
      "Optional",
      "Optional",
      "Required",
      "Optional",
      "Required",
      "Optional",
      "Required",
      "Auto",
      "Optional",
      "Optional",
    ];
    sheet.getRow(5).font = { italic: true, color: { argb: "FF475569" } };
    sheet.getRow(5).alignment = { vertical: "top", wrapText: true };
    sheet.getCell("A6").value = "Use datas no formato YYYY-MM-DD. Os campos Idade e Data de Validade sao calculados automaticamente.";
    sheet.mergeCells("A6:O6");
    sheet.getCell("A6").font = { italic: true, color: { argb: "FF475569" } };
    sheet.addRows([
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ]);
    sheet.views = [{ state: "frozen", ySplit: 6 }];

    const referenceSheet = workbook.addWorksheet("Reference");
    referenceSheet.columns = [
      { header: "Field", key: "field", width: 22 },
      { header: "Accepted values / notes", key: "value", width: 50 },
    ];
    referenceSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    referenceSheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF002663" } };
    referenceSheet.addRows([
      { field: "Género", value: "Masculino or Feminino" },
      { field: "Data de Validade", value: "Automatically calculated from current age: over 50 = 1 year; up to 50 = 2 years" },
      { field: "Estado", value: "VALID, EXPIRED, DUE_SOON or PENDING" },
      { field: "Posto trabalho", value: "Must match an existing workstation name from the list below" },
    ]);

    const workstations = await prisma.workstation.findMany({
      where: { plantId, isActive: true },
      orderBy: [{ name: "asc" }],
      select: { code: true, name: true },
    });

    referenceSheet.addRow({});
    referenceSheet.addRow({ field: "Active workstations", value: "" });
    const headerRow = referenceSheet.addRow({ field: "Code", value: "Name" });
    headerRow.font = { bold: true };
    for (const workstation of workstations) {
      referenceSheet.addRow({ field: workstation.code, value: workstation.name });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  },
};
