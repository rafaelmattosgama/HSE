import { RoleCode } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentToolContext } from "@/lib/agent/permissions";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    incidentKnowledgeAudit: { create: vi.fn() },
    incidentKnowledgeDocument: { findMany: vi.fn(), findFirst: vi.fn() },
    communication: { findFirst: vi.fn() },
    sEWO: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
const embeddingMock = vi.hoisted(() => ({ createIncidentKnowledgeEmbeddings: vi.fn() }));
const agentAuditMock = vi.hoisted(() => ({ writeAgentAuditEvent: vi.fn(async () => ({})) }));
const loggerMock = vi.hoisted(() => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/services/incident-knowledge-index-service", () => embeddingMock);
vi.mock("@/lib/agent/audit", () => agentAuditMock);
vi.mock("@/lib/agent/guardrails", () => ({ recordAgentToolCallOrBlock: vi.fn(async () => ({ allowed: true, count: 1 })) }));
vi.mock("@/lib/logger", () => loggerMock);
vi.mock("@/lib/auth/session", () => ({ getServerAuthSession: vi.fn() }));
vi.mock("@/lib/plant", () => ({ getPlantByCode: vi.fn() }));

import { createIncidentKnowledgeTools } from "@/lib/agent/tools/incident-knowledge";

function context(role: RoleCode = RoleCode.N0_ADMIN): AgentToolContext {
  return {
    session: {
      user: {
        id: "user-1",
        name: "User One",
        email: "user@example.com",
        image: null,
        language: "pt",
        mustChangePassword: false,
        plantRoles: [{ plantId: "plant-1", plantCode: "pl01", role }],
      },
      expires: "2099-01-01T00:00:00.000Z",
    },
    userId: "user-1",
    plantId: "plant-1",
    plantCode: "pl01",
    role,
  } as AgentToolContext;
}

function getTool(name: string, role: RoleCode = RoleCode.N0_ADMIN) {
  const selected = createIncidentKnowledgeTools(context(role)).find((item) => item.name === name);
  if (!selected) throw new Error(`Tool ${name} not found`);
  return selected as unknown as { invoke: (details: unknown, input: string) => Promise<unknown> };
}

describe("agent incident knowledge tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.prisma.incidentKnowledgeAudit.create.mockResolvedValue({});
    prismaMock.prisma.incidentKnowledgeDocument.findMany.mockResolvedValue([]);
    prismaMock.prisma.incidentKnowledgeDocument.findFirst.mockResolvedValue(null);
    prismaMock.prisma.communication.findFirst.mockResolvedValue(null);
    prismaMock.prisma.sEWO.findFirst.mockResolvedValue(null);
    prismaMock.prisma.$queryRaw.mockResolvedValue([]);
    embeddingMock.createIncidentKnowledgeEmbeddings.mockResolvedValue([Array.from({ length: 1536 }, () => 0.01)]);
  });

  afterEach(() => vi.clearAllMocks());

  it("searches approved, unarchived knowledge across plants and omits the query from audit logs", async () => {
    const result = await getTool("search_historical_incidents").invoke(null, JSON.stringify({ query: "forklift guard failure" }));

    expect(result).toMatchObject({ ok: true, data: { results: [], semanticUnavailable: false } });
    expect(prismaMock.prisma.$queryRaw).toHaveBeenCalledOnce();
    const vectorQuery = prismaMock.prisma.$queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(vectorQuery.values).not.toContain("plant-1");
    expect(vectorQuery.values).not.toContain("forklift guard failure");
    expect(prismaMock.prisma.incidentKnowledgeDocument.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        archivedAt: null,
        reviewStatus: "APPROVED",
      }),
    }));
    expect(JSON.stringify(agentAuditMock.writeAgentAuditEvent.mock.calls)).not.toContain("forklift guard failure");
    expect(JSON.stringify(prismaMock.prisma.incidentKnowledgeAudit.create.mock.calls)).not.toContain("forklift guard failure");
  });

  it("blocks roles without Knowledge Base access before reading incident data", async () => {
    const result = await getTool("search_historical_incidents", RoleCode.N4_SUPERVISOR).invoke(
      null,
      JSON.stringify({ query: "forklift guard failure" }),
    );

    expect(result).toMatchObject({ ok: false, errorCode: "FORBIDDEN" });
    expect(prismaMock.prisma.incidentKnowledgeDocument.findMany).not.toHaveBeenCalled();
    expect(prismaMock.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(embeddingMock.createIncidentKnowledgeEmbeddings).not.toHaveBeenCalled();
  });

  it("uses only a validated plant-scoped communication and sanitizes its narrative before embedding", async () => {
    prismaMock.prisma.communication.findFirst.mockResolvedValue({
      id: "comm-1",
      type: "NEAR_MISS",
      description: "The worker named John Smith slipped beside the forklift guard.",
      codigoCompleto: "MAAP-2026-001",
      codigoAbreviado: "001",
    });

    const result = await getTool("find_similar_incidents").invoke(null, JSON.stringify({ communicationId: "MAAP-2026-001" }));

    expect(result).toMatchObject({
      ok: true,
      data: { searchedSource: { type: "safety communication", code: "MAAP-2026-001" }, results: [] },
    });
    expect(prismaMock.prisma.communication.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        plantId: "plant-1",
        status: { in: ["VALID_OPEN", "ONGOING", "CLOSED"] },
      }),
      select: { id: true, type: true, description: true, codigoCompleto: true, codigoAbreviado: true },
    }));
    const [embeddedTexts] = embeddingMock.createIncidentKnowledgeEmbeddings.mock.calls[0] as [string[]];
    expect(embeddedTexts[0]).toContain("[REDACTED_PERSON]");
    expect(embeddedTexts[0]).not.toContain("John Smith");
    expect(JSON.stringify(agentAuditMock.writeAgentAuditEvent.mock.calls)).not.toContain("John Smith");
  });

  it("skips searches that consist of a standalone personal name", async () => {
    const result = await getTool("search_historical_incidents").invoke(null, JSON.stringify({ query: "Ana Silva" }));

    expect(result).toMatchObject({ ok: true, data: { results: [], notice: expect.stringContaining("skipped for privacy") } });
    expect(embeddingMock.createIncidentKnowledgeEmbeddings).not.toHaveBeenCalled();
    expect(prismaMock.prisma.incidentKnowledgeDocument.findMany).not.toHaveBeenCalled();
    expect(prismaMock.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(JSON.stringify(prismaMock.prisma.incidentKnowledgeAudit.create.mock.calls)).not.toContain("Ana Silva");
  });
});
