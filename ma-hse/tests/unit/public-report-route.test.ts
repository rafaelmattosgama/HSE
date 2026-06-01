import { afterEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import { NextRequest } from "next/server";

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
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
  },
}));

vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/rate-limit", () => rateLimitMock);
vi.mock("@/lib/auth/plant-token", () => tokenMock);
vi.mock("@/lib/services/shift-service", () => shiftServiceMock);
vi.mock("@/lib/logger", () => loggerMock);

import { GET } from "@/app/(public)/r/[plantCode]/report/route";

function routeContext(plantCode = "maap") {
  return {
    params: Promise.resolve({ plantCode }),
  };
}

describe("public report route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lists every active plant worker in the QR report involved worker selector", async () => {
    const employees = Array.from({ length: 55 }, (_, index) => ({
      id: `worker-${index + 1}`,
      name: `Worker ${String(index + 1).padStart(2, "0")}`,
      employeeNo: String(index + 1).padStart(3, "0"),
    }));

    plantMock.getPlantByCode.mockResolvedValue({
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
});
