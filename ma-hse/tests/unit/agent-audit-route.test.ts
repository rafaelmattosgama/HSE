import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardsMock = vi.hoisted(() => ({
  requireAuth: vi.fn(),
}));

const plantMock = vi.hoisted(() => ({
  getPlantByCode: vi.fn(),
}));

const prismaMock = vi.hoisted(() => ({
  prisma: {
    auditLog: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac/guards", () => guardsMock);
vi.mock("@/lib/plant", () => plantMock);
vi.mock("@/lib/prisma", () => prismaMock);

import { GET } from "@/app/api/plants/[plantCode]/agent-audit/route";

function routeContext(plantCode = "pl01") {
  return {
    params: Promise.resolve({ plantCode }),
  };
}

function request(query = "", plantCode = "pl01") {
  return new Request(`http://localhost/api/plants/${plantCode}/agent-audit${query}`);
}

function session(role: RoleCode, plantCode: string | null = "pl01") {
  return {
    user: {
      id: "viewer-1",
      plantRoles: [
        {
          plantId: plantCode ? "plant-1" : null,
          plantCode,
          role,
        },
      ],
    },
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "audit-1",
    action: "AGENT_AGENT_RESPONSE",
    actorUserId: "user-1",
    plantId: "plant-1",
    createdAt: new Date("2026-07-15T10:00:00.000Z"),
    diffJson: {
      after: {
        requestId: "req-1",
        eventType: "agent_response",
        result: "success",
        timestamp: "2026-07-15T10:00:00.000Z",
        userId: "user-1",
        plantCode: "pl01",
        plantId: "plant-1",
        role: "N3_SAFETY",
        toolName: "list_actions",
        confirmationId: null,
        messageLength: 12,
        mode: "real",
        errorCode: null,
        status: null,
        summary: "Safe summary",
        input: {
          fields: ["plantCode", "message"],
          apiKey: "sk-secret",
        },
        outputSummary: {
          responseLength: 80,
          stack: "stack trace",
          type: "agent_response",
        },
        ...overrides,
      },
    },
  };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, any>>;
}

describe("agent audit route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    plantMock.getPlantByCode.mockResolvedValue({ id: "plant-1", code: "pl01" });
    prismaMock.prisma.auditLog.count.mockResolvedValue(1);
    prismaMock.prisma.auditLog.findMany.mockResolvedValue([row()]);
  });

  it("allows N0 to view global logs", async () => {
    guardsMock.requireAuth.mockResolvedValue({ session: session(RoleCode.N0_ADMIN, null) });

    const response = await GET(request("?page=2&pageSize=10", "all"), routeContext("all"));
    const payload = await json(response);

    expect(response.status).toBe(200);
    expect(payload.data.access).toMatchObject({ scope: "global", role: RoleCode.N0_ADMIN, canFilterUser: true });
    expect(prismaMock.prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: "AgentInteraction",
        }),
        skip: 10,
        take: 10,
      }),
    );
  });

  it("allows N1 to view plant logs", async () => {
    guardsMock.requireAuth.mockResolvedValue({ session: session(RoleCode.N1_CORPORATE, null) });

    const response = await GET(request("", "pl01"), routeContext("pl01"));
    const payload = await json(response);

    expect(response.status).toBe(200);
    expect(payload.data.access).toMatchObject({ scope: "plant", role: RoleCode.N1_CORPORATE });
    expect(prismaMock.prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plantId: "plant-1",
        }),
      }),
    );
  });

  it("allows N3 only for its plant", async () => {
    guardsMock.requireAuth.mockResolvedValue({ session: session(RoleCode.N3_SAFETY, "pl01") });

    const response = await GET(request("", "pl01"), routeContext("pl01"));
    const payload = await json(response);

    expect(response.status).toBe(200);
    expect(payload.data.logs[0]).toMatchObject({
      requestId: "req-1",
      eventType: "agent_response",
      result: "success",
    });
  });

  it("blocks N3 global all-plants access", async () => {
    guardsMock.requireAuth.mockResolvedValue({ session: session(RoleCode.N3_SAFETY, "pl01") });

    const response = await GET(request("", "all"), routeContext("all"));

    expect(response.status).toBe(403);
    expect(prismaMock.prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("blocks N2 access", async () => {
    guardsMock.requireAuth.mockResolvedValue({ session: session(RoleCode.N2_PLANT_MANAGER, "pl01") });

    const response = await GET(request("", "pl01"), routeContext("pl01"));

    expect(response.status).toBe(403);
    expect(prismaMock.prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("applies filters and pagination", async () => {
    guardsMock.requireAuth.mockResolvedValue({ session: session(RoleCode.N0_ADMIN, null) });

    const response = await GET(
      request("?eventType=tool_called&toolName=list_actions&result=success&requestId=req-1&userId=user-1&page=3&pageSize=5", "all"),
      routeContext("all"),
    );

    expect(response.status).toBe(200);
    expect(prismaMock.prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 5,
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ diffJson: expect.objectContaining({ path: ["after", "eventType"], equals: "tool_called" }) }),
            expect.objectContaining({ diffJson: expect.objectContaining({ path: ["after", "toolName"], equals: "list_actions" }) }),
            expect.objectContaining({ diffJson: expect.objectContaining({ path: ["after", "result"], equals: "success" }) }),
            expect.objectContaining({ diffJson: expect.objectContaining({ path: ["after", "requestId"], equals: "req-1" }) }),
            expect.objectContaining({ diffJson: expect.objectContaining({ path: ["after", "userId"], equals: "user-1" }) }),
          ]),
        }),
      }),
    );
  });

  it("does not expose sensitive values from audit JSON", async () => {
    guardsMock.requireAuth.mockResolvedValue({ session: session(RoleCode.N0_ADMIN, null) });
    prismaMock.prisma.auditLog.findMany.mockResolvedValue([
      row({
        summary: "stack trace with OPENAI_API_KEY and sk-test",
        outputSummary: {
          responseLength: 10,
          type: "sk-test",
        },
      }),
    ]);

    const response = await GET(request("", "all"), routeContext("all"));
    const payload = await json(response);
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(serialized).not.toContain("OPENAI_API_KEY");
    expect(serialized).not.toContain("sk-test");
    expect(serialized).not.toContain("stack trace");
    expect(payload.data.logs[0].requestId).toBe("req-1");
  });
});
