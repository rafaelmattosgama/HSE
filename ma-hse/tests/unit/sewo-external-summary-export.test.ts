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
        area: {
          name: "Press Shop",
        },
        workstation: {
          name: "Line 2",
        },
        targetEmployee: null,
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
      whatText: "Hand contusion",
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
});
