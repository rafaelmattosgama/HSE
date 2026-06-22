import { afterEach, describe, expect, it, vi } from "vitest";
import { CommunicationImprovementSubtype, CommunicationStatus, CommunicationType } from "@prisma/client";

const prismaMock = vi.hoisted(() => ({
  communication: {
    findUniqueOrThrow: vi.fn(),
  },
}));

const storageMock = vi.hoisted(() => ({
  StorageService: {
    getObjectBuffer: vi.fn(),
  },
}));

const communicationUiMock = vi.hoisted(() => ({
  getLocalizedCommunicationUi: vi.fn(),
}));

const FakePdfDocument = vi.hoisted(() => class FakePdfDocument {
  y = 40;
  page = {
    width: 595,
    height: 842,
    margins: {
      top: 40,
      bottom: 40,
    },
  };

  private handlers = new Map<string, Array<(value?: Buffer) => void>>();
  private payload = {
    texts: [] as string[],
    imageCount: 0,
  };

  on(event: string, handler: (value?: Buffer) => void) {
    const current = this.handlers.get(event) ?? [];
    current.push(handler);
    this.handlers.set(event, current);
    return this;
  }

  roundedRect() {
    return this;
  }

  rect() {
    return this;
  }

  strokeColor() {
    return this;
  }

  lineWidth() {
    return this;
  }

  stroke() {
    return this;
  }

  fill() {
    return this;
  }

  fillAndStroke() {
    return this;
  }

  fillColor() {
    return this;
  }

  fontSize() {
    return this;
  }

  font() {
    return this;
  }

  moveDown(lines = 1) {
    this.y += 14 * lines;
    return this;
  }

  addPage() {
    this.y = this.page.margins.top;
    return this;
  }

  heightOfString(value: string) {
    return Math.max(16, String(value).split("\n").length * 16);
  }

  text(value: string, _x?: number, y?: number) {
    this.payload.texts.push(String(value));
    if (typeof y === "number") {
      this.y = y + 18;
    } else {
      this.y += 18;
    }
    return this;
  }

  image() {
    this.payload.imageCount += 1;
    return this;
  }

  end() {
    const chunk = Buffer.from(JSON.stringify(this.payload));
    for (const handler of this.handlers.get("data") ?? []) {
      handler(chunk);
    }
    for (const handler of this.handlers.get("end") ?? []) {
      handler();
    }
  }
});

vi.mock("@/lib/services/pdfkit-helper", () => ({
  createPdfDocument: vi.fn(() => new FakePdfDocument()),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/services/storage-service", () => storageMock);
vi.mock("@/lib/services/communication-ui-localization", () => communicationUiMock);

import { CommunicationReportExportService } from "@/lib/services/communication-report-export";

const communicationUi = {
  communicationTypeLabels: {
    FIVE_S_IMPROVEMENT: "Melhoria 5S's",
  },
  communicationStatusLabels: {
    VALID_OPEN: "Por tratar",
  },
  actionStatusLabels: {
    OPEN: "Aberta",
  },
};

describe("CommunicationReportExportService", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("builds a 5S communication report with QR photo attachments", async () => {
    communicationUiMock.getLocalizedCommunicationUi.mockResolvedValue(communicationUi);
    storageMock.StorageService.getObjectBuffer.mockResolvedValue(Buffer.from("image-1"));
    prismaMock.communication.findUniqueOrThrow.mockResolvedValue({
      id: "comm-1",
      codigoCompleto: "5S_MAAP_2026_01",
      codigoAbreviado: null,
      type: CommunicationType.FIVE_S_IMPROVEMENT,
      status: CommunicationStatus.VALID_OPEN,
      eventDatetime: new Date("2026-05-27T12:00:00.000Z"),
      createdAt: new Date("2026-05-27T12:01:00.000Z"),
      updatedAt: new Date("2026-05-27T12:02:00.000Z"),
      validatedAt: null,
      manuallyClosedAt: null,
      level: null,
      reporterName: "Operator Test",
      reporterEmployeeNo: "001",
      targetText: null,
      targetEmployeeNo: null,
      improvementSubtype: CommunicationImprovementSubtype.FIVE_S_AREA_IMPROVEMENT,
      description: "5S improvement from public QR form with photo.",
      suggestedAction: "Organize the work area.",
      severityPotential: null,
      plant: {
        code: "maap",
        name: "MA Automotive Portugal",
      },
      reporterUser: null,
      targetEmployee: null,
      involvedEmployees: [],
      shift: null,
      area: {
        name: "Production",
      },
      line: null,
      workstation: {
        name: "PT17",
      },
      equipment: null,
      riskTheme: null,
      unsafeActType: null,
      unsafeConditionType: null,
      nearMissType: null,
      attachments: [
        {
          fileName: "five-s-photo.jpg",
          contentType: "image/jpeg",
          fileKey: "photo-1",
        },
      ],
      actions: [],
      validatedByUser: null,
      manuallyClosedByUser: null,
    });

    const pdf = await CommunicationReportExportService.buildPdf("comm-1", { locale: "pt" });
    const rendered = JSON.parse(pdf.toString()) as {
      texts: string[];
      imageCount: number;
    };

    expect(prismaMock.communication.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "comm-1",
      },
    }));
    expect(storageMock.StorageService.getObjectBuffer).toHaveBeenCalledWith({ key: "photo-1" });
    expect(rendered.imageCount).toBe(1);
    expect(rendered.texts).toContain("Comunicacao de Seguranca - Summary Report");
    expect(rendered.texts).toContain("Referencia: 5S_MAAP_2026_01");
    expect(rendered.texts).toContain("Melhoria 5S's");
    expect(rendered.texts).toContain("5S improvement from public QR form with photo.");
    expect(rendered.texts).toContain("five-s-photo.jpg");
  });
});
