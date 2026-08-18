import { RoleCode, SEWOStatus } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requirePlantAccess: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  sEWO: {
    findFirst: vi.fn(),
  },
}));

const sewoServiceMock = vi.hoisted(() => ({
  SewaService: {
    approve: vi.fn(),
    changeCorporateDecision: vi.fn(),
    shareReport: vi.fn(),
  },
  SewoValidationError: class SewoValidationError extends Error {
    constructor(
      public readonly code: string,
      message: string,
      public readonly status = 400,
    ) {
      super(message);
    }
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/services/sewo-service", () => sewoServiceMock);

import { PATCH, POST } from "@/app/api/plants/[plantCode]/sewo/[id]/approval/route";
import { POST as postShare } from "@/app/api/plants/[plantCode]/sewo/[id]/share/route";

function routeContext() {
  return { params: Promise.resolve({ plantCode: "pl1", id: "11111111-1111-4111-8111-111111111111" }) };
}

function n1Auth() {
  return {
    session: {
      user: {
        id: "n1-user",
        plantRoles: [{ role: RoleCode.N1_CORPORATE }],
      },
    },
  };
}

describe("S-EWO Corporate approval API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lets N1 validate without sharing when the share prompt selects Don't share", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue(n1Auth());
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.sEWO.findFirst.mockResolvedValue({ id: "sewo-1", status: SEWOStatus.IN_APPROVAL });
    sewoServiceMock.SewaService.approve.mockResolvedValue({ id: "sewo-1", status: SEWOStatus.APPROVED });

    const response = await POST(new Request("http://localhost/api/plants/pl1/sewo/sewo-1/approval", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved: true, approvalComment: "Validated by N1.", shareReport: false }),
    }), routeContext());
    if (!response) throw new Error("Approval route did not return a response");

    expect(response.status).toBe(200);
    expect(sewoServiceMock.SewaService.approve).toHaveBeenCalledWith({
      sewoId: "11111111-1111-4111-8111-111111111111",
      actorUserId: "n1-user",
      payload: { approved: true, approvalComment: "Validated by N1.", shareReport: false },
    });
  });

  it("allows N1 to change only an existing Corporate decision", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue(n1Auth());
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.sEWO.findFirst.mockResolvedValue({ id: "sewo-1", status: SEWOStatus.APPROVED });
    sewoServiceMock.SewaService.changeCorporateDecision.mockResolvedValue({
      id: "sewo-1",
      status: SEWOStatus.REJECTED,
      approvedAt: new Date("2026-08-18T10:00:00.000Z"),
    });

    const response = await PATCH(new Request("http://localhost/api/plants/pl1/sewo/sewo-1/approval", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved: false, approvalComment: "Rejected after review." }),
    }), routeContext());
    if (!response) throw new Error("Decision-change route did not return a response");

    expect(response.status).toBe(200);
    expect(sewoServiceMock.SewaService.changeCorporateDecision).toHaveBeenCalledWith({
      sewoId: "11111111-1111-4111-8111-111111111111",
      actorUserId: "n1-user",
      payload: { approved: false, approvalComment: "Rejected after review." },
    });
  });

  it("blocks direct report-sharing calls from a user without N1", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue({
      session: { user: { id: "n0-user", plantRoles: [{ role: RoleCode.N0_ADMIN }] } },
    });

    const response = await postShare(new Request("http://localhost/api/plants/pl1/sewo/sewo-1/share", {
      method: "POST",
    }), routeContext());
    if (!response) throw new Error("Share route did not return a response");

    expect(response.status).toBe(403);
    expect(sewoServiceMock.SewaService.shareReport).not.toHaveBeenCalled();
  });

  it("lets N1 trigger report sharing for a decided S-EWO", async () => {
    guardsMock.requirePlantAccess.mockResolvedValue(n1Auth());
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1" });
    prismaMock.sEWO.findFirst.mockResolvedValue({ id: "sewo-1", status: SEWOStatus.REJECTED });
    sewoServiceMock.SewaService.shareReport.mockResolvedValue(undefined);

    const response = await postShare(new Request("http://localhost/api/plants/pl1/sewo/sewo-1/share", {
      method: "POST",
    }), routeContext());
    if (!response) throw new Error("Share route did not return a response");

    expect(response.status).toBe(200);
    expect(sewoServiceMock.SewaService.shareReport).toHaveBeenCalledWith({
      sewoId: "11111111-1111-4111-8111-111111111111",
      actorUserId: "n1-user",
    });
  });
});
