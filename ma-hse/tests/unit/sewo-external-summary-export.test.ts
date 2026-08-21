import ExcelJS from "exceljs";
import { afterEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  sEWO: {
    findUniqueOrThrow: vi.fn(),
  },
  injuryType: {
    findFirst: vi.fn(),
  },
}));

const storageMock = vi.hoisted(() => ({
  StorageService: {
    getObjectBuffer: vi.fn(),
  },
}));

const localizationMock = vi.hoisted(() => ({
  getLocalizedSewoUi: vi.fn(),
}));

const translationMock = vi.hoisted(() => ({
  translateForViewer: vi.fn(),
}));

const validationMock = vi.hoisted(() => ({
  formatSewoOccurrenceType: vi.fn(),
  getSewoTemplateRecord: vi.fn((value: unknown) => {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }),
  getSifPsifResultFromTemplateData: vi.fn(),
}));

const FakePdfDocument = vi.hoisted(() => class FakePdfDocument {
  y = 40;
  pageCount = 1;
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

  circle() {
    return this;
  }

  polygon() {
    return this;
  }

  moveTo() {
    return this;
  }

  lineTo() {
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

  fillOpacity() {
    return this;
  }

  save() {
    return this;
  }

  rotate() {
    return this;
  }

  restore() {
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
    this.pageCount += 1;
    return this;
  }

  bufferedPageRange() {
    return { start: 0, count: this.pageCount };
  }

  switchToPage() {
    return this;
  }

  heightOfString(value: string) {
    return Math.max(16, String(value).split("\n").length * 16);
  }

  widthOfString(value: string) {
    return String(value).length * 5;
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
    const chunk = Buffer.from(JSON.stringify({ ...this.payload, pageCount: this.pageCount }));
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
vi.mock("@/lib/services/sewo-ui-localization", () => localizationMock);
vi.mock("@/lib/services/viewer-translation-service", () => translationMock);
vi.mock("@/lib/services/sewo-validation-service", () => validationMock);

import { SewoExportService } from "@/lib/services/sewo-export";

const ui = {
  locale: "en",
  summaryReportTitle: "S-EWO Summary Report",
  summaryReportReference: "S-EWO Reference",
  generatedOn: "Generated on",
  summaryReportGeneralInfo: "1. General Information",
  plant: "Plant",
  summaryReportOccurrenceDate: "Occurrence Date",
  summaryReportOccurrenceType: "Occurrence Type",
  summaryReportLocation: "Location / Workstation",
  summaryReportInjuryNature: "Nature of Injury",
  summaryReportNotApplicable: "Not applicable",
  summaryReportDescriptionSection: "2. Occurrence Description",
  description: "Description",
  summaryReportAnalysisSection: "3. Analysis",
  summaryReportClassification: "SIF / PSIF Classification",
  summaryReportRootCause: "Selected Root Cause",
  summaryReportActionPlanSection: "4. Action Plan",
  actionPlan: "Action Plan",
  actionStatusLabels: {
    OPEN: "Open",
    ONGOING: "Ongoing",
    CLOSED: "Closed",
  } as Record<string, string>,
  owner: "Owner",
  dueDate: "Due date",
  tableStatus: "Status",
  summaryReportPhotoEvidenceSection: "5. Photo Evidence",
  summaryTitle: "Summary",
  summaryStatus: "Status",
  tableDate: "Date",
  summaryPerformedBy: "Performed by",
  summaryCommunication: "Communication",
  eventClassification: "Event classification",
  area: "Area",
  workstation: "Workstation",
  shift: "Shift",
  involvedPerson: "Involved person",
  nature: "Nature",
  usualJob: "Usual job",
  whichOperation: "Which operation",
  validatedBy: "Validated by",
  reviewedAt: "Reviewed at",
  howDidTheAccidentHappen: "How did the accident happen?",
  immediateCorrectiveActionPlan: "Immediate corrective action plan",
  analysis: "Analysis",
  analysisText: "Analysis text",
  previousDetected: "Have previous UA / UC been detected?",
  previousDetectedDescription: "Describe previous detection",
  fiveWhy: "5 Why",
  noFiveWhyAnalysis: "No 5 Why analysis registered.",
  whyLabel: "Why",
  question: "Question",
  answerLabel: "Answer",
  sifPsifDecisionTree: "SIF / PSIF Decision Tree",
  actualSifQuestion: "Was it an actual SIF event?",
  sifPsifExposureQuestions: {
    suspendedLoad: "Suspended load",
    mobileEquipment: "Mobile equipment",
    energyIsolation: "Energy isolation",
    workAtHeight: "Work at height",
    movingEquipment: "Moving equipment",
    confinedSpace: "Confined space",
    significantMassEnergy: "Significant mass or energy",
  },
  repeatedSifPotentialQuestion: "Repeated SIF potential",
  oneWhatIfAwayQuestion: "One what-if away",
  noPsifExplanation: "No PSIF explanation",
  sifPsifResult: "SIF / PSIF result",
  rootCauseAnalysis: "Root Cause Analysis",
  rootCauses: "Root Causes",
  rootCause: "Root cause",
  noRootCauseDetails: "No root cause details registered.",
  noLinkedActions: "No linked actions.",
  title: "Title",
  field: "Field",
  value: "Value",
  cause: "Cause",
  comment: "Comment",
  noRecordsShort: "No records",
  yes: "Yes",
  no: "No",
  sewoStatusLabels: {
    DRAFT: "Draft",
    IN_APPROVAL: "Submitted",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    CLOSED: "Closed",
  } as Record<string, string>,
  sifResult: "SIF",
  psifResult: "PSIF",
  noPsifResult: "No PSIF",
  pendingResult: "Pending",
};

describe("SewoExportService.buildExternalSummaryExport", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("builds the summary report with main sections, actions and photos", async () => {
    localizationMock.getLocalizedSewoUi.mockResolvedValue({ ui });
    translationMock.translateForViewer.mockImplementation(async (_locale: string, texts: string[]) => texts);
    validationMock.formatSewoOccurrenceType.mockReturnValue("Near Miss");
    validationMock.getSifPsifResultFromTemplateData.mockReturnValue("PSIF");
    storageMock.StorageService.getObjectBuffer.mockResolvedValue(Buffer.from("image-1"));
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-1",
      plantId: "plant-1",
      plant: {
        code: "pl1",
        name: "Valenca",
      },
      communication: {
        eventDatetime: new Date("2026-05-20T08:00:00.000Z"),
        area: null,
        workstation: {
          name: "Workstation A",
        },
        injuryType: {
          name: "Corte / laceração",
        },
        type: "NEAR_MISS",
      },
      eventClassification: "NEAR_MISS",
      whatText: "157748c6-1a3a-4860-b702-509adc5c4704",
      whereText: "",
      howText: "Operator slipped near the conveyor.",
      templateData: {
        rootCauseDetails: [
          {
            label: "1.1 Inadequate training",
            comment: "New operator on the task",
            isRootCause: true,
          },
        ],
      },
      causeSelections: [],
      actions: [],
      actionLinks: [
        {
          action: {
            title: "Install guard",
            description: "Protect the moving parts",
            dueDate: new Date("2026-06-01T00:00:00.000Z"),
            status: "OPEN",
            ownerUser: {
              name: "Ana Silva",
            },
          },
        },
      ],
      attachments: [
        {
          fileName: "evidence.jpg",
          contentType: "image/jpeg",
          fileKey: "photo-1",
        },
      ],
      area: null,
      line: null,
    });

    const exported = await SewoExportService.buildExternalSummaryExport("sewo-1", { locale: "en" });
    const rendered = JSON.parse(exported.pdf.toString()) as {
      texts: string[];
      imageCount: number;
    };

    expect(prismaMock.sEWO.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "sewo-1",
      },
    }));
    expect(storageMock.StorageService.getObjectBuffer).toHaveBeenCalledWith({ key: "photo-1" });
    expect(rendered.imageCount).toBe(1);
    expect(rendered.texts).toContain("MAx Safety");
    expect(rendered.texts).toContain("Safety EWO - Summary Report");
    expect(rendered.texts).toContain("S-EWO Reference: sewo-1");
    expect(rendered.texts).toContain("Valenca (PL1)");
    expect(rendered.texts).toContain("Near Miss");
    expect(rendered.texts).toContain("Corte / laceração");
    expect(rendered.texts).not.toContain("157748c6-1a3a-4860-b702-509adc5c4704");
    expect(rendered.texts).toContain("Operator slipped near the conveyor.");
    expect(rendered.texts).toContain("PSIF");
    expect(rendered.texts).toContain("1.1 Inadequate training: New operator on the task");
    expect(rendered.texts).toContain("INSTALL GUARD | OPEN");
    expect(rendered.texts).toContain("Owner: Ana Silva\nDue date: 2026-06-01\nStatus: Open\n\nProtect the moving parts");
    expect(rendered.texts).toContain("evidence.jpg");
  });

  it("falls back to not applicable when optional data is missing", async () => {
    localizationMock.getLocalizedSewoUi.mockResolvedValue({ ui });
    translationMock.translateForViewer.mockImplementation(async (_locale: string, texts: string[]) => texts);
    validationMock.formatSewoOccurrenceType.mockReturnValue("Injury");
    validationMock.getSifPsifResultFromTemplateData.mockReturnValue("PENDING");
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-2",
      plant: {
        code: "pl2",
        name: "Porto",
      },
      communication: null,
      eventClassification: "ACCIDENT",
      whatText: "",
      whereText: "",
      howText: "",
      templateData: null,
      causeSelections: [],
      actions: [],
      actionLinks: [],
      attachments: [
        {
          fileName: "notes.pdf",
          contentType: "application/pdf",
          fileKey: "doc-1",
        },
      ],
      area: null,
      line: null,
      analysisDate: new Date("2026-05-21T00:00:00.000Z"),
    });

    const exported = await SewoExportService.buildExternalSummaryExport("sewo-2", { locale: "en" });
    const rendered = JSON.parse(exported.pdf.toString()) as {
      texts: string[];
      imageCount: number;
    };

    expect(storageMock.StorageService.getObjectBuffer).not.toHaveBeenCalled();
    expect(rendered.imageCount).toBe(0);
    expect(rendered.texts.filter((entry) => entry === "Not applicable").length).toBeGreaterThanOrEqual(4);
    expect(rendered.texts).toContain("Injury");
    expect(rendered.texts).toContain("Porto (PL2)");
  });
});

describe("SewoExportService.buildExport", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("builds the complete report with analysis, causes, actions and photos", async () => {
    localizationMock.getLocalizedSewoUi.mockResolvedValue({ ui });
    translationMock.translateForViewer.mockImplementation(async (_locale: string, texts: string[]) => texts);
    storageMock.StorageService.getObjectBuffer.mockResolvedValue(Buffer.from("image-1"));
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-1",
      plant: {
        code: "pl1",
        name: "Valenca",
      },
      communication: {
        id: "comm-1",
        description: "Readable occurrence description from the linked communication.",
        type: "ACCIDENT",
        area: {
          name: "Press Shop",
        },
        workstation: {
          name: "Line 2",
        },
        targetEmployee: null,
        bodyPart: {
          code: "BP08",
          name: "Hand",
        },
        injuryType: {
          name: "Hand contusion",
        },
      },
      eventClassification: "Near Miss",
      area: {
        name: "Press Shop",
      },
      line: {
        name: "Line 2",
      },
      shift: {
        name: "Shift 1",
      },
      analysisDate: new Date("2026-05-20T08:00:00.000Z"),
      performedBy: {
        name: "Joao Costa",
      },
      approvedBy: {
        name: "Ana Silva",
      },
      approvedAt: new Date("2026-05-21T08:00:00.000Z"),
      status: "APPROVED",
      whatText: "11111111-1111-4111-8111-111111111111",
      whereText: "Line 2",
      whoText: "123 - Maria Lopes",
      usualWorkYesNo: true,
      whichText: "Normal press operation",
      howText: "Operator slipped near the conveyor.",
      immediateCorrectiveActionText: "Area isolated and cleaned.",
      templateData: {
        analysisText: "Floor contamination identified.",
        previousDetected: "YES",
        previousDetectedDescription: "Similar unsafe condition was reported last week.",
        fiveWhys: [
          {
            why: "Why did the operator slip?",
            answer: "Oil was present on the floor.",
          },
        ],
        sifPsifDecision: {
          actualSif: "NO",
          exposures: {
            suspendedLoad: "NO",
            mobileEquipment: "YES",
          },
          repeatedSifPotential: "YES",
          oneWhatIfAway: "NO",
          noPsifExplanation: "",
        },
        rootCauseDetails: [
          {
            label: "6.2 Lack of maintenance",
            comment: "Leak not fixed in time",
            isRootCause: true,
          },
        ],
      },
      causeSelections: [],
      actions: [],
      actionLinks: [
        {
          action: {
            title: "Repair leak",
            description: "Replace damaged hydraulic hose",
            dueDate: new Date("2026-06-01T00:00:00.000Z"),
            status: "OPEN",
            ownerUser: {
              name: "Carlos Mendes",
            },
          },
        },
      ],
      attachments: [
        {
          fileName: "floor.jpg",
          contentType: "image/jpeg",
          fileKey: "photo-1",
        },
        {
          fileName: "notes.pdf",
          contentType: "application/pdf",
          fileKey: "doc-1",
        },
      ],
    });

    const exported = await SewoExportService.buildExport("sewo-1", { locale: "en", exportedBy: "Ana Silva" });
    const rendered = JSON.parse(exported.pdf.toString()) as {
      texts: string[];
      imageCount: number;
    };

    expect(storageMock.StorageService.getObjectBuffer).toHaveBeenCalledWith({ key: "photo-1" });
    expect(rendered.imageCount).toBe(1);
    expect(exported.xlsx.length).toBeGreaterThan(0);
    expect(rendered.texts).toContain("SAFETY EWO - COMPLETE REPORT");
    expect(rendered.texts).toContain("SAFETY EWO - ANALYSIS");
    expect(rendered.texts).toContain("SAFETY EWO - ROOT CAUSE & ACTION PLAN");
    expect(rendered.texts).toContain("S-EWO REFERENCE");
    expect(rendered.texts).toContain("sewo-1");
    expect(rendered.texts).toContain("Exported by: Ana Silva");
    expect(rendered.texts).toContain("Valenca (PL1)");
    expect(rendered.texts).toContain("Readable occurrence description from the linked communication.");
    expect(rendered.texts).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(rendered.texts).toContain("Operator slipped near the conveyor.");
    expect(rendered.texts).toContain("Floor contamination identified.");
    expect(rendered.texts).toContain("Why did the operator slip?");
    expect(rendered.texts).toContain("6.2 Lack of maintenance");
    expect(rendered.texts.some((entry) => entry.includes("Repair leak"))).toBe(true);
    expect(rendered.texts.some((entry) => entry.includes("Replace damaged hydraulic hose"))).toBe(true);
    expect(rendered.texts).toContain("floor.jpg");
    expect(rendered.texts).toContain("notes.pdf");
  });

  it("can build only the complete PDF without generating an XLSX payload", async () => {
    localizationMock.getLocalizedSewoUi.mockResolvedValue({ ui });
    translationMock.translateForViewer.mockImplementation(async (_locale: string, texts: string[]) => texts);
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-pdf-only",
      plant: {
        code: "pl1",
        name: "Valenca",
      },
      communication: null,
      eventClassification: "Unsafe act",
      area: null,
      line: null,
      shift: null,
      analysisDate: new Date("2026-05-20T08:00:00.000Z"),
      performedBy: {
        name: "Joao Costa",
      },
      approvedBy: null,
      approvedAt: null,
      status: "DRAFT",
      whatText: "Unsafe behavior",
      whereText: "Warehouse",
      whoText: "Operator",
      usualWorkYesNo: false,
      whichText: null,
      howText: "Operator crossed outside the marked route.",
      immediateCorrectiveActionText: "Briefed the team.",
      templateData: null,
      causeSelections: [],
      actions: [],
      actionLinks: [],
      attachments: [],
    });

    const exported = await SewoExportService.buildExport("sewo-pdf-only", {
      locale: "en",
      exportedBy: "Ana Silva",
      includeXlsx: false,
    });
    const rendered = JSON.parse(exported.pdf.toString()) as {
      texts: string[];
    };

    expect(exported.xlsx.length).toBe(0);
    expect(rendered.texts).toContain("SAFETY EWO - COMPLETE REPORT");
    expect(rendered.texts).toContain("sewo-pdf-only");
  });

  it("builds the complete report when legacy linked action data is incomplete", async () => {
    localizationMock.getLocalizedSewoUi.mockResolvedValue({ ui });
    translationMock.translateForViewer.mockImplementation(async (_locale: string, texts: string[]) => texts);
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue({
      id: "sewo-legacy-action",
      plant: {
        code: "maap",
        name: "MA Automotive Portugal",
      },
      communication: null,
      eventClassification: "Near Miss",
      area: null,
      line: null,
      shift: null,
      analysisDate: new Date("2026-05-20T08:00:00.000Z"),
      performedBy: null,
      approvedBy: null,
      approvedAt: null,
      status: "APPROVED",
      whatText: "Near Miss",
      whereText: "PT17",
      whoText: "Operator",
      usualWorkYesNo: true,
      whichText: "Lifting operations",
      howText: "Box fell near the line.",
      immediateCorrectiveActionText: "Area checked.",
      templateData: {
        rootCauseDetails: [
          {
            label: "6.3 Weakness in design",
            comment: "Platform stop needs review",
            isRootCause: true,
          },
        ],
      },
      causeSelections: [],
      actions: [],
      actionLinks: [
        {
          action: {
            title: "Review platform stop",
            description: "Define improvement action",
            dueDate: null,
            status: "OPEN",
            ownerUser: null,
          },
        },
      ],
      attachments: [],
    });

    const exported = await SewoExportService.buildExport("sewo-legacy-action", { locale: "en", exportedBy: "Ana Silva" });
    const rendered = JSON.parse(exported.pdf.toString()) as {
      texts: string[];
    };

    expect(exported.xlsx.length).toBeGreaterThan(0);
    expect(rendered.texts).toContain("sewo-legacy-action");
    expect(rendered.texts.some((entry) => entry.includes("Review platform stop"))).toBe(true);
    expect(rendered.texts).toContain("Not applicable");
  });

  function baseSewoFixture(overrides: Record<string, unknown> = {}) {
    return {
      id: "sewo-1",
      plant: { code: "pl1", name: "Valenca" },
      communication: null,
      eventClassification: "Near Miss",
      area: null,
      line: null,
      shift: null,
      analysisDate: new Date("2026-05-20T08:00:00.000Z"),
      performedBy: { name: "Joao Costa" },
      approvedBy: null,
      approvedAt: null,
      status: "APPROVED",
      whatText: "Near Miss",
      whereText: "Line 2",
      whoText: "Operator",
      usualWorkYesNo: true,
      whichText: "Normal operation",
      howText: "Operator slipped near the conveyor.",
      immediateCorrectiveActionText: "Area isolated and cleaned.",
      templateData: null,
      causeSelections: [],
      actions: [],
      actionLinks: [],
      attachments: [],
      ...overrides,
    };
  }

  it("keeps every paragraph of a long, accented analysis text without truncating it", async () => {
    localizationMock.getLocalizedSewoUi.mockResolvedValue({ ui });
    translationMock.translateForViewer.mockImplementation(async (_locale: string, texts: string[]) => texts);
    const analysisText = [
      "Enquanto manipulava peça para retirada de final de linha e colocação em contentor, a peça escorregou tendo caído e atingido o pé.",
      "A peça escorregou porque continha óleo de corte e a posição do contentor não é favorável à colocação da mesma de forma fácil.",
    ].join("\n\n");
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue(baseSewoFixture({
      id: "sewo-analysis-paragraphs",
      templateData: { analysisText },
    }));

    const exported = await SewoExportService.buildExport("sewo-analysis-paragraphs", { locale: "pt", exportedBy: "Ana Silva" });
    const rendered = JSON.parse(exported.pdf.toString()) as { texts: string[] };

    expect(rendered.texts).toContain(analysisText);
    expect(rendered.texts.some((entry) => entry.endsWith("..."))).toBe(false);
  });

  it("keeps long, multi-line and bilingual root cause comments intact instead of cutting them mid-sentence", async () => {
    localizationMock.getLocalizedSewoUi.mockResolvedValue({ ui });
    translationMock.translateForViewer.mockImplementation(async (_locale: string, texts: string[]) => texts);
    const weaknessComment = [
      "Comentário longo em português que continua bastante depois dos 140 caracteres que antes serviam de limite fixo para a coluna de comentários da tabela de causas.",
      "Additional English follow-up sentence that must remain fully visible as well.",
    ].join("\n");
    const manufacturingComment =
      "Outro comentário longo que termina corretamente sem cortar a meio da frase, ultrapassando de forma clara os antigos 140 caracteres de limite por célula da tabela.";
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue(baseSewoFixture({
      id: "sewo-root-cause-comments",
      templateData: {
        rootCauseDetails: [
          { label: "6.3 Weakness in design", comment: weaknessComment, isRootCause: true },
          { label: "6.8 Erroneous manufacturing / installation", comment: manufacturingComment, isRootCause: false },
        ],
      },
    }));

    const exported = await SewoExportService.buildExport("sewo-root-cause-comments", { locale: "en", exportedBy: "Ana Silva" });
    const rendered = JSON.parse(exported.pdf.toString()) as { texts: string[] };

    expect(rendered.texts).toContain(weaknessComment);
    expect(rendered.texts).toContain(manufacturingComment);
    expect(rendered.texts.some((entry) => entry.endsWith("..."))).toBe(false);
  });

  it("lists every action linked to the SEWO via either relation, deduplicated, with translated status and full description", async () => {
    localizationMock.getLocalizedSewoUi.mockResolvedValue({ ui });
    translationMock.translateForViewer.mockImplementation(async (_locale: string, texts: string[]) => texts);
    const longDescription =
      "Descrição longa da ação corretiva que detalha extensivamente os passos necessários para eliminar a causa raiz identificada, incluindo peças a substituir, testes a realizar e formação a dar aos operadores envolvidos.";
    const sharedAction = {
      id: "action-open",
      title: "Repair conveyor guard",
      description: "Install and bolt the missing guard back onto the conveyor.",
      dueDate: new Date("2026-07-01T00:00:00.000Z"),
      status: "OPEN",
      ownerUser: { name: "Carlos Mendes" },
    };
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue(baseSewoFixture({
      id: "sewo-multiple-actions",
      actions: [
        sharedAction,
        {
          id: "action-overdue",
          title: "Replace worn belt",
          description: longDescription,
          dueDate: new Date("2026-01-01T00:00:00.000Z"),
          status: "ONGOING",
          ownerUser: null,
        },
      ],
      actionLinks: [
        { action: sharedAction },
        {
          action: {
            id: "action-closed",
            title: "Retrain shift on lockout procedure",
            description: "Completed refresher training for the affected shift.",
            dueDate: new Date("2026-03-01T00:00:00.000Z"),
            status: "CLOSED",
            ownerUser: { name: "Ana Silva" },
          },
        },
      ],
    }));

    const exported = await SewoExportService.buildExport("sewo-multiple-actions", { locale: "en", exportedBy: "Ana Silva" });
    const rendered = JSON.parse(exported.pdf.toString()) as { texts: string[] };

    expect(rendered.texts.filter((entry) => entry.includes("Repair conveyor guard")).length).toBe(1);
    expect(rendered.texts.some((entry) => entry.includes(longDescription))).toBe(true);
    expect(rendered.texts).toContain("Open");
    expect(rendered.texts).toContain("Ongoing");
    expect(rendered.texts).toContain("Closed");
    expect(rendered.texts).not.toContain("OPEN");
    expect(rendered.texts.some((entry) => entry.includes("Carlos Mendes"))).toBe(true);
    expect(rendered.texts).toContain("Not applicable");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.xlsx as unknown as ArrayBuffer);
    const actionsSheet = workbook.getWorksheet(ui.actionPlan)!;
    expect(actionsSheet.rowCount).toBe(4);
    const titles = [2, 3, 4].map((row) => actionsSheet.getRow(row).getCell(1).value);
    expect(titles).toEqual(expect.arrayContaining(["Repair conveyor guard", "Replace worn belt", "Retrain shift on lockout procedure"]));
  });

  it("shows the placeholder row only when the SEWO truly has no linked actions", async () => {
    localizationMock.getLocalizedSewoUi.mockResolvedValue({ ui });
    translationMock.translateForViewer.mockImplementation(async (_locale: string, texts: string[]) => texts);
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue(baseSewoFixture({ id: "sewo-no-actions" }));

    const exported = await SewoExportService.buildExport("sewo-no-actions", { locale: "en", exportedBy: "Ana Silva" });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(exported.xlsx as unknown as ArrayBuffer);
    const actionsSheet = workbook.getWorksheet(ui.actionPlan)!;
    expect(actionsSheet.rowCount).toBe(2);
    expect(actionsSheet.getRow(2).getCell(1).value).toBe(ui.noLinkedActions);
  });

  it("does not drop rows off the page: many long root causes flow onto a continuation page instead of being cut", async () => {
    localizationMock.getLocalizedSewoUi.mockResolvedValue({ ui });
    translationMock.translateForViewer.mockImplementation(async (_locale: string, texts: string[]) => texts);
    const lastComment = "Marker comment for the final root cause row, which must survive onto whichever page it lands on.";
    const rootCauseDetails = Array.from({ length: 14 }, (_, index) => ({
      label: `${index + 1}.1 Root cause number ${index + 1}`,
      comment: index === 13
        ? lastComment
        : `Linha um do comentário ${index + 1}.\nLinha dois do comentário ${index + 1}.\nLine three in English for cause ${index + 1}.`,
      isRootCause: index % 2 === 0,
    }));
    prismaMock.sEWO.findUniqueOrThrow.mockResolvedValue(baseSewoFixture({
      id: "sewo-many-root-causes",
      templateData: { rootCauseDetails },
    }));

    const exported = await SewoExportService.buildExport("sewo-many-root-causes", { locale: "en", exportedBy: "Ana Silva" });
    const rendered = JSON.parse(exported.pdf.toString()) as { texts: string[]; pageCount: number };

    expect(rendered.pageCount).toBeGreaterThan(3);
    expect(rendered.texts).toContain(lastComment);
  });
});
