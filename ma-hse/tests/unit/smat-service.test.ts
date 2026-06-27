import { describe, expect, it, vi } from "vitest";

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
  private pageCount = 1;
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

  addPage() {
    this.pageCount += 1;
    this.y = 132;
    return this;
  }

  bufferedPageRange() {
    return {
      start: 0,
      count: this.pageCount,
    };
  }

  switchToPage() {
    this.y = 132;
    return this;
  }

  heightOfString(value: string, options?: { width?: number }) {
    const width = options?.width ?? 480;
    const charsPerLine = Math.max(24, Math.floor(width / 5));
    const lineCount = String(value)
      .split("\n")
      .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    return Math.max(12, lineCount * 12);
  }

  text(value: string, _x?: unknown, y?: unknown) {
    this.payload.texts.push(String(value));
    if (typeof y === "number") {
      this.y = y + 14;
    } else {
      this.y += this.heightOfString(String(value));
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
  prisma: {},
}));

vi.mock("@/lib/services/storage-service", () => ({
  StorageService: {
    getObjectBuffer: vi.fn(),
  },
}));

import { buildSmatPdf } from "@/lib/services/smat-service";

describe("SmatService PDF renderer", () => {
  it("renders the redesigned SMAT report with all required sections", async () => {
    const attachment = {
      fileName: "smat-photo.jpg",
      contentType: "image/jpeg",
      fileKey: "smat/photo.jpg",
      caption: "Tapete antifadiga",
    };

    const pdf = await buildSmatPdf(
      {
        id: "12345678-1234-4234-9234-123456789012",
        plant: {
          name: "Valenca - MAAP",
          code: "maap",
        },
        auditorName: "Ludmila Donino / Claudia Costa",
        auditDate: new Date("2026-06-18T00:00:00.000Z"),
        areaExamined: "Producao",
        locationExamined: "ES07",
        startTimeText: "15:57",
        endTimeText: "16:18",
        peopleObservedCount: 1,
        peopleInvolvedCount: 1,
        peopleSafeCount: 1,
        peopleUnsafeCount: 0,
        workConditionsSafeCount: 3,
        workConditionsUnsafeCount: 2,
        reactionsPositiveCount: 3,
        reactionsNegativeCount: 1,
        safeActs: [{ category: "A", description: "O posto de trabalho encontra-se organizado." }],
        safeConditions: [{ category: "D", description: "A operadora utiliza corretamente todos os EPI's." }],
        unsafeActs: [{ category: "C", description: "Os carros amoviveis encontravam-se com as rodas destravadas." }],
        unsafeConditions: [{ category: "A", description: "O tapete antifadiga nao cobre toda a area utilizada." }],
        answer1: "Andar sobre o tapete com risco de torcer o pe.",
        answer2: "No computador.",
        answer3: "Processo de escalada ou aplicacao MAXSAFETY.",
        answer4: "Dialogo de Seguranca no inicio do turno.",
        answer5: "Para evitar acidentes graves.",
        answer6: "Alerto os colaboradores quando observo riscos.",
        notes: "Risco medio a elevado:\nA exposicao continua ao oleo pode contribuir para irritacoes cutaneas.",
        communication: {
          id: "comm-1",
          type: "UNSAFE_ACT",
          status: "VALID_OPEN",
          reporterName: "Operador",
        },
        attachments: [attachment],
        actionLinks: [
          {
            action: {
              title: "Substituir Luvas e Tapete",
              status: "OPEN",
              ownerUser: {
                name: "Luis Santos",
              },
            },
          },
        ],
      },
      [
        {
          ...attachment,
          buffer: Buffer.from("image"),
          extension: "jpeg",
        },
      ],
      { generatedAt: new Date("2026-06-27T12:00:00.000Z") },
    );

    const rendered = JSON.parse(pdf.toString()) as {
      texts: string[];
      imageCount: number;
    };

    expect(rendered.texts).toContain("SMAT - Safety Management Audit Training");
    expect(rendered.texts).toContain("General information");
    expect(rendered.texts).toContain("Observed counts");
    expect(rendered.texts).toContain("AS - Ato Seguro");
    expect(rendered.texts).toContain("CS - Condição Segura");
    expect(rendered.texts).toContain("AI - Ato Inseguro");
    expect(rendered.texts).toContain("CI - Condição Insegura");
    expect(rendered.texts).toContain("Questions");
    expect(rendered.texts).toContain("Notes");
    expect(rendered.texts).toContain("Actions linked to communication");
    expect(rendered.texts).toContain("Substituir Luvas e Tapete");
    expect(rendered.texts).toContain("smat-photo.jpg - Tapete antifadiga");
    expect(rendered.imageCount).toBe(1);
  });
});
