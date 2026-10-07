import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseSafetyKpiWorkbook, SafetyKpiExcelError } from "@/lib/safety-kpi-history/excel";
import { aggregateSafetyKpiMonths, type SafetyKpiMonth } from "@/lib/safety-kpi-history/aggregation";

const headers = ["Plant", "Year", "Month", "Hours Worked", "Employees", "Accidents", "Lost Days", "Serious Injury", "Minor Injury", "First Aids", "Near Miss", "Unsafe Condition", "Unsafe Act", "Frequency Rate (Source)", "Gravity Rate (Source)", "Source", "Notes"];
const valid = ["MAAP", 2026, 1, 18000, 121, 0, 0, 0, 0, 1, 2, 10, 20, 0, 0, "HISTORICAL_IMPORT", "ok"];
async function bytes(rows: unknown[][], options: { sheet?: string; headers?: string[] } = {}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(options.sheet ?? "KPI_Import");
  sheet.addRow(options.headers ?? headers);
  rows.forEach(row => sheet.addRow(row));
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("historical safety KPI workbook parser", () => {
  it("parses normalized headers, numeric strings and ignores blank rows", async () => {
    const normalizedHeaders = headers.map((header, index) => index % 2 ? `  ${header.toUpperCase()}  ` : header.toLowerCase());
    const rows = await parseSafetyKpiWorkbook(await bytes([["MAAP", "2026", "1", "18000", "121", "0", "0", "0", "0", "1", "2", "10", "20", "0", "0", "HISTORICAL_IMPORT", ""], []], { headers: normalizedHeaders }));
    expect(rows).toHaveLength(1);
    expect(rows[0].normalized).toMatchObject({ plantCode: "maap", year: 2026, month: 1, hoursWorked: "18000", employees: 121 });
    expect(rows[0].recordKey).toBe("MAAP|2026-01");
    expect(rows[0].errors).toEqual([]);
  });

  it("rejects a workbook without KPI_Import", async () => {
    await expect(parseSafetyKpiWorkbook(await bytes([valid], { sheet: "Other" }))).rejects.toMatchObject({ code: "MISSING_SHEET" } satisfies Partial<SafetyKpiExcelError>);
  });

  it("reports all missing required headers clearly", async () => {
    await expect(parseSafetyKpiWorkbook(await bytes([valid.slice(0, 2)], { headers: ["Plant", "Year"] }))).rejects.toMatchObject({ code: "MISSING_HEADERS" } satisfies Partial<SafetyKpiExcelError>);
  });

  it("marks every occurrence of a duplicate record key", async () => {
    const rows = await parseSafetyKpiWorkbook(await bytes([valid, [...valid]]));
    expect(rows.map(row => row.duplicateFile)).toEqual([true, true]);
  });

  it("reads a workbook whose comment relationships use package-absolute targets", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("KPI_Import");
    sheet.addRow(headers);
    sheet.addRow(valid);
    sheet.getCell("A1").note = "Template guidance comment";
    const zip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
    const relPath = Object.keys(zip.files).find(path => /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/i.test(path));
    expect(relPath).toBeDefined();
    const rel = await zip.file(relPath!)!.async("string");
    zip.file(relPath!, rel.replace(/Target="\.\.\/comments\//, 'Target="/xl/comments/'));
    const bytesWithAbsoluteCommentTarget = await zip.generateAsync({ type: "uint8array" });

    const rows = await parseSafetyKpiWorkbook(bytesWithAbsoluteCommentTarget);
    expect(rows).toHaveLength(1);
    expect(rows[0].normalized).toMatchObject({ plantCode: "maap", year: 2026, month: 1 });
    expect(rows[0].errors).toEqual([]);
  });

  it("imports the 53-row acceptance dataset and reproduces every annual control total", async () => {
    const controls = [
      { year: 2022, months: 12, hours: "209659", employeeSum: 1521, employees: "126.75", accidents: 2, lostDays: 64, serious: 1, minor: 1, firstAids: 20, nearMiss: 14, unsafeCondition: 196, unsafeAct: 36, frequency: "9.5392995292", gravity: "305.2575849355" },
      { year: 2023, months: 12, hours: "269056", employeeSum: 1690, employees: "140.8333333333", accidents: 1, lostDays: 20, serious: 0, minor: 1, firstAids: 19, nearMiss: 54, unsafeCondition: 131, unsafeAct: 148, frequency: "3.7166983825", gravity: "74.3339676499" },
      { year: 2024, months: 12, hours: "235912.25", employeeSum: 1653, employees: "137.75", accidents: 0, lostDays: 0, serious: 0, minor: 0, firstAids: 16, nearMiss: 33, unsafeCondition: 261, unsafeAct: 405, frequency: "0", gravity: "0" },
      { year: 2025, months: 12, hours: "234121", employeeSum: 1599, employees: "133.25", accidents: 1, lostDays: 18, serious: 0, minor: 1, firstAids: 15, nearMiss: 29, unsafeCondition: 435, unsafeAct: 689, frequency: "4.2712956121", gravity: "76.8833210178" },
      { year: 2026, months: 5, hours: "93418", employeeSum: 605, employees: "121", accidents: 0, lostDays: 0, serious: 0, minor: 0, firstAids: 6, nearMiss: 10, unsafeCondition: 366, unsafeAct: 462, frequency: "0", gravity: "0" },
    ];
    const spreadInteger = (total: number, count: number) => Array.from({ length: count }, (_, index) => Math.floor(total / count) + (index < total % count ? 1 : 0));
    const spreadDecimal = (total: string, count: number) => {
      const cents = Math.round(Number(total) * 100);
      return spreadInteger(cents, count).map(value => (value / 100).toFixed(2));
    };
    const workbookRows = controls.flatMap(control => {
      const values = {
        hours: spreadDecimal(control.hours, control.months),
        employees: spreadInteger(control.employeeSum, control.months),
        accidents: spreadInteger(control.accidents, control.months),
        lostDays: spreadInteger(control.lostDays, control.months),
        serious: spreadInteger(control.serious, control.months),
        minor: spreadInteger(control.minor, control.months),
        firstAids: spreadInteger(control.firstAids, control.months),
        nearMiss: spreadInteger(control.nearMiss, control.months),
        unsafeCondition: spreadInteger(control.unsafeCondition, control.months),
        unsafeAct: spreadInteger(control.unsafeAct, control.months),
      };
      return Array.from({ length: control.months }, (_, index) => [
        "MAAP", control.year, index + 1, values.hours[index], values.employees[index],
        values.accidents[index], values.lostDays[index], values.serious[index], values.minor[index],
        values.firstAids[index], values.nearMiss[index], values.unsafeCondition[index], values.unsafeAct[index],
        "", "", "HISTORICAL_IMPORT", "Acceptance control",
      ]);
    });

    const parsed = await parseSafetyKpiWorkbook(await bytes(workbookRows));
    expect(parsed).toHaveLength(53);
    expect(parsed.every(row => row.errors.length === 0 && !row.duplicateFile)).toBe(true);
    const months: SafetyKpiMonth[] = parsed.map(({ normalized }) => ({
      plantId: "plant-maap", plantCode: normalized.plantCode, year: normalized.year, month: normalized.month,
      source: "HISTORICAL", hoursWorked: normalized.hoursWorked, employees: normalized.employees,
      accidents: normalized.accidents, lostDays: normalized.lostDays, seriousInjury: normalized.seriousInjury,
      minorInjury: normalized.minorInjury, firstAids: normalized.firstAids, nearMiss: normalized.nearMiss,
      unsafeCondition: normalized.unsafeCondition, unsafeAct: normalized.unsafeAct,
    }));

    for (const control of controls) {
      const annual = aggregateSafetyKpiMonths(months.filter(row => row.year === control.year));
      expect(annual).toMatchObject({
        months: control.months, hoursWorked: control.hours, employees: control.employees,
        accidents: control.accidents, lostDays: String(control.lostDays), seriousInjury: control.serious,
        minorInjury: control.minor, firstAids: control.firstAids, nearMiss: control.nearMiss,
        unsafeCondition: control.unsafeCondition, unsafeAct: control.unsafeAct,
      });
      expect(annual.frequencyRate).toBe(control.frequency);
      expect(annual.gravityRate).toBe(control.gravity);
    }
  });
});
