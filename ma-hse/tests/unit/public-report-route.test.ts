import { CommunicationImprovementSubtype, CommunicationType } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { NextRequest } from "next/server";

const plantMock = vi.hoisted(() => ({
  findPlantByCode: vi.fn(),
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  communication: {
    findFirst: vi.fn(),
  },
  area: {
    findMany: vi.fn(),
  },
  workstation: {
    findMany: vi.fn(),
  },
  shift: {
    findMany: vi.fn(),
  },
  employeeDirectory: {
    findMany: vi.fn(),
  },
  bodyPart: {
    findMany: vi.fn(),
  },
  injuryType: {
    findMany: vi.fn(),
  },
}));

const rateLimitMock = vi.hoisted(() => ({
  consumeRateLimit: vi.fn(),
}));

const tokenMock = vi.hoisted(() => ({
  verifyPlantToken: vi.fn(),
}));

const shiftServiceMock = vi.hoisted(() => ({
  ensureDefaultShifts: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

const communicationServiceMock = vi.hoisted(() => ({
  CommunicationService: {
    create: vi.fn(),
    isN6AllowedType: vi.fn(),
  },
  CommunicationValidationError: class CommunicationValidationError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status = 409) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

const attachmentServiceMock = vi.hoisted(() => ({
  PUBLIC_REPORT_PHOTO_LIMITS: {
    maxFiles: 5,
    maxFileSizeBytes: 5 * 1024 * 1024,
    maxTotalSizeBytes: 20 * 1024 * 1024,
  },
  CommunicationAttachmentValidationError: class CommunicationAttachmentValidationError extends Error {
    code: string;
    status: number;

    constructor(code: string, message: string, status = 422) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  uploadPublicReportPhotos: vi.fn(),
  deleteUploadedCommunicationAttachments: vi.fn(),
}));

vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => rateLimitMock);
vi.mock("@/lib/auth/plant-token", () => tokenMock);
vi.mock("@/lib/services/shift-service", () => shiftServiceMock);
vi.mock("@/lib/logger", () => loggerMock);
vi.mock("@/lib/services/communication-service", () => communicationServiceMock);
vi.mock("@/lib/services/communication-attachment-service", () => attachmentServiceMock);

import { GET, POST } from "@/app/(public)/r/[plantCode]/report/route";

function routeContext(plantCode = "maap") {
  return {
    params: Promise.resolve({ plantCode }),
  };
}

describe("public report route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function mockSubmitDependencies() {
    plantMock.findPlantByCode.mockResolvedValue({
      id: "plant-1",
      code: "maap",
      defaultLanguage: "en",
    });
    rateLimitMock.consumeRateLimit.mockResolvedValue({ allowed: true });
    tokenMock.verifyPlantToken.mockResolvedValue({ id: "token-1" });
    communicationServiceMock.CommunicationService.isN6AllowedType.mockReturnValue(true);
    prismaMock.communication.findFirst.mockResolvedValue(null);
    attachmentServiceMock.uploadPublicReportPhotos.mockResolvedValue([]);
    communicationServiceMock.CommunicationService.create.mockResolvedValue({
      id: "comm-1",
      attachments: [],
    });
  }

  const validPayload = {
    type: CommunicationType.UNSAFE_CONDITION,
    eventDatetime: "2026-05-27T12:00:00.000Z",
    reporterName: "Operator Test",
    reporterEmployeeNo: "001",
    areaId: "11111111-1111-4111-8111-111111111111",
    workstationId: "22222222-2222-4222-8222-222222222222",
    description: "Unsafe condition from public QR form.",
  };

  it("lists every active plant worker in the QR report involved worker selector", async () => {
    const employees = Array.from({ length: 55 }, (_, index) => ({
      id: `worker-${index + 1}`,
      name: `Worker ${String(index + 1).padStart(2, "0")}`,
      employeeNo: String(index + 1).padStart(3, "0"),
    }));

    plantMock.findPlantByCode.mockResolvedValue({
      id: "plant-1",
      code: "maap",
      defaultLanguage: "en",
    });
    rateLimitMock.consumeRateLimit.mockResolvedValue({ allowed: true });
    tokenMock.verifyPlantToken.mockResolvedValue({ id: "token-1" });
    shiftServiceMock.ensureDefaultShifts.mockResolvedValue(undefined);
    prismaMock.area.findMany.mockResolvedValue([]);
    prismaMock.workstation.findMany.mockResolvedValue([]);
    prismaMock.shift.findMany.mockResolvedValue([]);
    prismaMock.employeeDirectory.findMany.mockResolvedValue(employees);
    prismaMock.bodyPart.findMany.mockResolvedValue([]);
    prismaMock.injuryType.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (queries) => Promise.all(queries));

    const response = await GET(
      new NextRequest("http://localhost/r/maap/report?t=qr-token"),
      routeContext(),
    );

    expect(response.status).toBe(200);

    const html = await response.text();
    const dom = new JSDOM(html, {
      runScripts: "dangerously",
      url: "http://localhost/r/maap/report?t=qr-token",
    });

    const input = dom.window.document.getElementById("targetEmployeeSearch");
    const list = dom.window.document.getElementById("targetEmployeeList");

    expect(input).not.toBeNull();
    expect(list).not.toBeNull();

    input!.dispatchEvent(new dom.window.Event("focus"));

    const options = list!.querySelectorAll(".combo-option");

    expect(options).toHaveLength(55);
    expect(list!.hasAttribute("hidden")).toBe(false);
    expect(Array.from(options).at(-1)?.textContent).toBe("055 - Worker 55");
  });

  it("shows the add involved worker action only for unsafe act reports", async () => {
    plantMock.findPlantByCode.mockResolvedValue({
      id: "plant-1",
      code: "maap",
      defaultLanguage: "en",
    });
    rateLimitMock.consumeRateLimit.mockResolvedValue({ allowed: true });
    tokenMock.verifyPlantToken.mockResolvedValue({ id: "token-1" });
    shiftServiceMock.ensureDefaultShifts.mockResolvedValue(undefined);
    prismaMock.area.findMany.mockResolvedValue([]);
    prismaMock.workstation.findMany.mockResolvedValue([]);
    prismaMock.shift.findMany.mockResolvedValue([]);
    prismaMock.employeeDirectory.findMany.mockResolvedValue([
      { id: "worker-1", name: "Worker One", employeeNo: "001" },
      { id: "worker-2", name: "Worker Two", employeeNo: "002" },
    ]);
    prismaMock.bodyPart.findMany.mockResolvedValue([]);
    prismaMock.injuryType.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (queries) => Promise.all(queries));

    const response = await GET(
      new NextRequest("http://localhost/r/maap/report?t=qr-token"),
      routeContext(),
    );
    const dom = new JSDOM(await response.text(), {
      runScripts: "dangerously",
      url: "http://localhost/r/maap/report?t=qr-token",
    });

    const typeSelect = dom.window.document.getElementById("type") as HTMLSelectElement;
    const addWorker = dom.window.document.getElementById("add-worker") as HTMLButtonElement;

    expect(Array.from(typeSelect.options).map((option) => option.textContent)).toContain("5S Improvement");
    expect(Array.from(typeSelect.options).map((option) => option.textContent)).toContain("Improvement Suggestion");
    expect(addWorker.textContent).toBe("Add involved worker");
    expect(addWorker.style.display).toBe("none");

    typeSelect.value = CommunicationType.UNSAFE_ACT;
    typeSelect.dispatchEvent(new dom.window.Event("change"));

    expect(addWorker.style.display).toBe("inline-flex");

    addWorker.click();
    addWorker.click();

    expect(dom.window.document.querySelectorAll("[data-worker-row]")).toHaveLength(3);
    expect(dom.window.document.querySelectorAll("input[name='additionalTargetEmployeeId']")).toHaveLength(2);
  });

  it("shows improvement subtype choices and hides involved worker for public improvement reports", async () => {
    plantMock.findPlantByCode.mockResolvedValue({
      id: "plant-1",
      code: "maap",
      defaultLanguage: "pt",
    });
    rateLimitMock.consumeRateLimit.mockResolvedValue({ allowed: true });
    tokenMock.verifyPlantToken.mockResolvedValue({ id: "token-1" });
    shiftServiceMock.ensureDefaultShifts.mockResolvedValue(undefined);
    prismaMock.area.findMany.mockResolvedValue([]);
    prismaMock.workstation.findMany.mockResolvedValue([]);
    prismaMock.shift.findMany.mockResolvedValue([]);
    prismaMock.employeeDirectory.findMany.mockResolvedValue([
      { id: "worker-1", name: "Worker One", employeeNo: "001" },
    ]);
    prismaMock.bodyPart.findMany.mockResolvedValue([]);
    prismaMock.injuryType.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockImplementation(async (queries) => Promise.all(queries));

    const response = await GET(
      new NextRequest("http://localhost/r/maap/report?t=qr-token"),
      routeContext(),
    );
    const dom = new JSDOM(await response.text(), {
      runScripts: "dangerously",
      url: "http://localhost/r/maap/report?t=qr-token",
    });

    const typeSelect = dom.window.document.getElementById("type") as HTMLSelectElement;
    const workerWrap = dom.window.document.getElementById("worker-wrap") as HTMLDivElement;
    const subtypeWrap = dom.window.document.getElementById("improvement-subtype-wrap") as HTMLDivElement;
    const subtypeSelect = dom.window.document.getElementById("improvementSubtype") as HTMLSelectElement;

    typeSelect.value = CommunicationType.FIVE_S_IMPROVEMENT;
    typeSelect.dispatchEvent(new dom.window.Event("change"));

    expect(workerWrap.style.display).toBe("none");
    expect(subtypeWrap.style.display).toBe("block");
    expect(subtypeSelect.required).toBe(true);
    expect(Array.from(subtypeSelect.options).map((option) => option.value)).toEqual([
      "",
      CommunicationImprovementSubtype.FIVE_S_AREA_IMPROVEMENT,
      CommunicationImprovementSubtype.FIVE_S_DISORGANIZATION,
    ]);

    typeSelect.value = CommunicationType.IMPROVEMENT_SUGGESTION;
    typeSelect.dispatchEvent(new dom.window.Event("change"));

    expect(workerWrap.style.display).toBe("none");
    expect(Array.from(subtypeSelect.options).map((option) => option.value)).toEqual([
      "",
      CommunicationImprovementSubtype.IMPROVEMENT_SAFETY,
      CommunicationImprovementSubtype.IMPROVEMENT_HEALTH,
      CommunicationImprovementSubtype.IMPROVEMENT_ENVIRONMENT,
    ]);
  });

  it("keeps public report JSON submission working without photos", async () => {
    mockSubmitDependencies();

    const response = await POST(
      new NextRequest("http://localhost/r/maap/report?t=qr-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validPayload),
      }),
      routeContext(),
    );

    expect(response.status).toBe(201);
    expect(attachmentServiceMock.uploadPublicReportPhotos).toHaveBeenCalledWith({
      plantCode: "maap",
      files: [],
    });
    expect(communicationServiceMock.CommunicationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        plantId: "plant-1",
        payload: expect.objectContaining({
          description: "Unsafe condition from public QR form.",
          attachments: [],
        }),
      }),
    );
  });

  it("passes every selected unsafe act involved worker to communication creation", async () => {
    mockSubmitDependencies();

    const workerIds = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ];

    const response = await POST(
      new NextRequest("http://localhost/r/maap/report?t=qr-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...validPayload,
          type: CommunicationType.UNSAFE_ACT,
          targetEmployeeId: undefined,
          involvedEmployeeIds: workerIds,
          description: "Unsafe act from public QR form.",
        }),
      }),
      routeContext(),
    );

    expect(response.status).toBe(201);
    expect(communicationServiceMock.CommunicationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        plantId: "plant-1",
        payload: expect.objectContaining({
          type: CommunicationType.UNSAFE_ACT,
          targetEmployeeId: workerIds[0],
          involvedEmployeeIds: workerIds,
        }),
      }),
    );
  });

  it("accepts public report multipart submission with photos", async () => {
    mockSubmitDependencies();
    attachmentServiceMock.uploadPublicReportPhotos.mockResolvedValue([
      {
        fileKey: "maap/communications/public-reports/photo.jpg",
        fileName: "photo.jpg",
        originalName: "photo.jpg",
        contentType: "image/jpeg",
        size: 4,
      },
    ]);

    const formData = new FormData();
    formData.set("payload", JSON.stringify(validPayload));
    formData.append("photos", new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "photo.jpg", { type: "image/jpeg" }));

    const response = await POST(
      new NextRequest("http://localhost/r/maap/report?t=qr-token", {
        method: "POST",
        body: formData,
      }),
      routeContext(),
    );

    expect(response.status).toBe(201);
    expect(attachmentServiceMock.uploadPublicReportPhotos).toHaveBeenCalledWith({
      plantCode: "maap",
      files: [expect.any(File)],
    });
    expect(communicationServiceMock.CommunicationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          attachments: [
            expect.objectContaining({
              fileKey: "maap/communications/public-reports/photo.jpg",
              contentType: "image/jpeg",
            }),
          ],
        }),
      }),
    );
  });

  it("accepts public 5S report multipart submission with photos", async () => {
    mockSubmitDependencies();
    attachmentServiceMock.uploadPublicReportPhotos.mockResolvedValue([
      {
        fileKey: "maap/communications/public-reports/five-s-photo.jpg",
        fileName: "five-s-photo.jpg",
        originalName: "five-s-photo.jpg",
        contentType: "image/jpeg",
        size: 4,
      },
    ]);

    const formData = new FormData();
    formData.set(
      "payload",
      JSON.stringify({
        ...validPayload,
        type: CommunicationType.FIVE_S_IMPROVEMENT,
        improvementSubtype: CommunicationImprovementSubtype.FIVE_S_AREA_IMPROVEMENT,
        targetEmployeeId: undefined,
        description: "5S improvement from public QR form with photo.",
      }),
    );
    formData.append("photos", new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "five-s-photo.jpg", { type: "image/jpeg" }));

    const response = await POST(
      new NextRequest("http://localhost/r/maap/report?t=qr-token", {
        method: "POST",
        body: formData,
      }),
      routeContext(),
    );

    expect(response.status).toBe(201);
    expect(attachmentServiceMock.uploadPublicReportPhotos).toHaveBeenCalledWith({
      plantCode: "maap",
      files: [expect.any(File)],
    });
    expect(communicationServiceMock.CommunicationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          type: CommunicationType.FIVE_S_IMPROVEMENT,
          improvementSubtype: CommunicationImprovementSubtype.FIVE_S_AREA_IMPROVEMENT,
          attachments: [
            expect.objectContaining({
              fileKey: "maap/communications/public-reports/five-s-photo.jpg",
              contentType: "image/jpeg",
            }),
          ],
        }),
      }),
    );
    expect(communicationServiceMock.CommunicationService.create.mock.calls[0][0].payload).not.toHaveProperty("targetEmployeeId");
  });

  it("returns a clear response when photo storage fails", async () => {
    mockSubmitDependencies();
    attachmentServiceMock.uploadPublicReportPhotos.mockRejectedValue(new Error("storage unavailable"));

    const formData = new FormData();
    formData.set("payload", JSON.stringify(validPayload));
    formData.append("photos", new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], "photo.jpg", { type: "image/jpeg" }));

    const response = await POST(
      new NextRequest("http://localhost/r/maap/report?t=qr-token", {
        method: "POST",
        body: formData,
      }),
      routeContext(),
    );

    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errorCode: "PHOTO_UPLOAD_FAILED",
      message: "The photo could not be saved. Try again or submit without a photo.",
    });
    expect(response.status).toBe(502);
    expect(loggerMock.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        plantCode: "maap",
        route: "report-submit",
        reason: "photo_upload_failed",
        fileCount: 1,
      }),
      "public report photo upload failed",
    );
    expect(communicationServiceMock.CommunicationService.create).not.toHaveBeenCalled();
  });
});
