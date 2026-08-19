import { CommunicationStatus, RoleCode } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  communication: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    warn: vi.fn(),
  },
}));

const serviceMock = vi.hoisted(() => ({
  CommunicationService: {
    validate: vi.fn(),
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

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => loggerMock);
vi.mock("@/lib/services/communication-service", () => serviceMock);

import { POST } from "@/app/api/plants/[plantCode]/communications/[id]/validate/route";

function routeContext(plantCode = "maap", id = "comm-1") {
  return {
    params: Promise.resolve({ plantCode, id }),
  };
}

describe("communication validate route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("validates an existing communication in the plant scope", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
          plantRoles: [{ role: RoleCode.N1_CORPORATE }],
        },
      },
      role: RoleCode.N1_CORPORATE,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.communication.findFirst.mockResolvedValue({
      id: "comm-1",
      plantId: "plant-1",
    });
    serviceMock.CommunicationService.validate.mockResolvedValue({
      id: "comm-1",
      status: CommunicationStatus.VALID_OPEN,
    });

    const response = await POST(
      new Request("http://localhost/api/plants/maap/communications/comm-1/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isValid: true,
          notes: "Reviewed by safety",
        }),
      }),
      routeContext(),
    );

    expect(prismaMock.communication.findFirst).toHaveBeenCalledWith({
      where: {
        id: "comm-1",
        plantId: "plant-1",
      },
    });
    expect(serviceMock.CommunicationService.validate).toHaveBeenCalledWith({
      communicationId: "comm-1",
      actorUserId: "user-1",
      actorRole: RoleCode.N1_CORPORATE,
      payload: {
        isValid: true,
        notes: "Reviewed by safety",
      },
    });
    expect(response.status).toBe(200);
  });

  it("returns 404 when the communication is outside the requested plant scope", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
          plantRoles: [{ role: RoleCode.N1_CORPORATE }],
        },
      },
      role: RoleCode.N1_CORPORATE,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.communication.findFirst.mockResolvedValue(null);
    prismaMock.communication.findUnique.mockResolvedValue({
      id: "comm-1",
      plantId: "other-plant",
      status: CommunicationStatus.SUBMITTED,
    });

    const response = await POST(
      new Request("http://localhost/api/plants/maap/communications/comm-1/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isValid: true,
          notes: "Reviewed by safety",
        }),
      }),
      routeContext(),
    );

    expect(response.status).toBe(404);
    expect(loggerMock.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        plantCode: "maap",
        requestedCommunicationId: "comm-1",
        resolvedPlantId: "plant-1",
        scopedPlantId: "plant-1",
        existingCommunication: {
          id: "comm-1",
          plantId: "other-plant",
          status: CommunicationStatus.SUBMITTED,
        },
      }),
      "communication_validation_target_not_found",
    );
  });

  it("surfaces validation business errors from the service", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: {
        user: {
          id: "user-1",
          plantRoles: [{ role: RoleCode.N1_CORPORATE }],
        },
      },
      role: RoleCode.N1_CORPORATE,
      plantId: "plant-1",
    });
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.communication.findFirst.mockResolvedValue({
      id: "comm-1",
      plantId: "plant-1",
    });
    serviceMock.CommunicationService.validate.mockRejectedValue(
      new serviceMock.CommunicationValidationError(
        "CLASSIFICATION_REQUIRED",
        "Complete the required classification fields before validating.",
        400,
      ),
    );

    const response = await POST(
      new Request("http://localhost/api/plants/maap/communications/comm-1/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          isValid: true,
          notes: "Reviewed by safety",
        }),
      }),
      routeContext(),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json).toEqual(
      expect.objectContaining({
        ok: false,
        errorCode: "CLASSIFICATION_REQUIRED",
      }),
    );
  });

  it.each([RoleCode.N2_PLANT_MANAGER, RoleCode.N4_SUPERVISOR])(
    "keeps validation forbidden for %s even when dashboard access is available",
    async () => {
      guardsMock.requirePlantAccess.mockResolvedValue({
        error: new Response(JSON.stringify({ ok: false, errorCode: "FORBIDDEN" }), { status: 403 }),
      });

      const response = await POST(
        new Request("http://localhost/api/plants/maap/communications/comm-1/validate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isValid: true, notes: "Attempted from a dashboard user" }),
        }),
        routeContext(),
      );

      expect(guardsMock.requirePlantAccess).toHaveBeenCalledWith("maap", [RoleCode.N1_CORPORATE, RoleCode.N3_SAFETY]);
      expect(response.status).toBe(403);
      expect(serviceMock.CommunicationService.validate).not.toHaveBeenCalled();
    },
  );
});
