import { CommunicationStatus, CommunicationType, RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const serviceMock = vi.hoisted(() => ({
  CommunicationService: {
    create: vi.fn(),
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

const actionServiceMock = vi.hoisted(() => ({
  ActionService: {
    create: vi.fn(),
  },
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    communication: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/services/communication-service", () => serviceMock);
vi.mock("@/lib/services/action-service", () => actionServiceMock);
vi.mock("@/lib/prisma", () => prismaMock);

import { GET, POST } from "@/app/api/plants/[plantCode]/communications/route";

function routeContext(plantCode = "maap") {
  return {
    params: Promise.resolve({ plantCode }),
  };
}

describe("communications route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates an internal communication for a logged-in plant user", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N5_OPERATOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    serviceMock.CommunicationService.create.mockResolvedValue({
      id: "comm-1",
      plantId: "plant-1",
      type: CommunicationType.UNSAFE_CONDITION,
      status: "SUBMITTED",
    });

    const request = new Request("http://localhost/api/plants/maap/communications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: CommunicationType.UNSAFE_CONDITION,
        eventDatetime: "2026-05-27T12:00:00.000Z",
        reporterName: "Operator Test",
        reporterEmployeeNo: "001",
        areaId: "11111111-1111-4111-8111-111111111111",
        workstationId: "22222222-2222-4222-8222-222222222222",
        unsafeConditionTypeId: "33333333-3333-4333-8333-333333333333",
        description: "Unsafe condition created from internal module.",
      }),
    }) as never;
    const response = await POST(
      request,
      routeContext(),
    );

    expect(response?.status).toBe(201);
    expect(serviceMock.CommunicationService.create).toHaveBeenCalledWith({
      plantId: "plant-1",
      payload: expect.objectContaining({
        type: CommunicationType.UNSAFE_CONDITION,
        description: "Unsafe condition created from internal module.",
      }),
      reporterUserId: "user-1",
      actorRole: RoleCode.N5_OPERATOR,
    });
  });

  it("lists communications in validation together with active communications by default", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
        },
      },
      role: RoleCode.N5_OPERATOR,
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.prisma.communication.findMany.mockResolvedValue([]);

    const response = await GET(
      {
        nextUrl: new URL("http://localhost/api/plants/maap/communications"),
      } as never,
      routeContext(),
    );

    expect(response?.status).toBe(200);
    expect(prismaMock.prisma.communication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plantId: "plant-1",
          status: {
            in: [
              CommunicationStatus.SUBMITTED,
              CommunicationStatus.PENDING_VALIDATION,
              CommunicationStatus.VALID_OPEN,
              CommunicationStatus.ONGOING,
              CommunicationStatus.CLOSED,
            ],
          },
        }),
      }),
    );
  });
});
