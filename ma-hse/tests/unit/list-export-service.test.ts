import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ListExportService } from "@/lib/services/list-export-service";

async function readWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await ((workbook.xlsx as unknown) as { load: (input: Uint8Array) => Promise<void> }).load(new Uint8Array(buffer));
  return workbook;
}

describe("ListExportService", () => {
  it("builds communication Excel exports with only the provided visible rows", async () => {
    const workbook = await readWorkbook(await ListExportService.buildCommunicationsXlsx([
      {
        code: "NM_PT11_2026_01",
        event: "2026-05-31 08:00",
        level: "N2",
        type: "Near Miss",
        status: "On Going",
        reporter: "Ana Silva",
        department: "Production",
        location: "Line 1",
        description: "Reported oil spill near the conveyor.",
      },
    ]));

    const sheet = workbook.getWorksheet("Communications");
    expect(sheet?.rowCount).toBe(2);
    expect(sheet?.getRow(1).values).toEqual([
      undefined,
      "Code",
      "Event",
      "Level",
      "Type",
      "Status",
      "Reporter",
      "Department",
      "Location",
      "Description",
    ]);
    expect(sheet?.getRow(2).values).toEqual([
      undefined,
      "NM_PT11_2026_01",
      "2026-05-31 08:00",
      "N2",
      "Near Miss",
      "On Going",
      "Ana Silva",
      "Production",
      "Line 1",
      "Reported oil spill near the conveyor.",
    ]);
  });

  it("builds action PDF exports from the provided filtered rows", async () => {
    const pdf = await ListExportService.buildActionsPdf([
      {
        action: "PL01-0001 | Guard machine",
        level: "N4",
        local: "Packing",
        source: "Manual",
        priority: "HIGH",
        status: "OPEN",
        owner: "Joao Costa",
        due: "2026-06-10",
        description: "Install additional protection and verify access points.",
      },
    ]);

    expect(pdf.length).toBeGreaterThan(100);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("keeps localized master data and headers in the selected export language", async () => {
    const workbook = await readWorkbook(await ListExportService.buildCommunicationsXlsx([
      {
        code: "UC_PT11_2026_01",
        event: "2026-06-01 09:00",
        level: "N3",
        type: "Condição perigosa",
        status: "Por tratar",
        reporter: "Ana Silva",
        department: "Produção",
        location: "Armazém de produto acabado",
        description: "Piso escorregadio.",
      },
    ], { locale: "pt" }));

    const sheet = workbook.getWorksheet("Comunicações");
    expect(sheet?.getRow(1).values).toContain("Departamento");
    expect(sheet?.getRow(2).values).toContain("Produção");
    expect(sheet?.getRow(2).values).toContain("Armazém de produto acabado");
  });
});
