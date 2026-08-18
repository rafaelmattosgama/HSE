import { ActionStatus, CommunicationStatus, RoleCode } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPendingConfirmationStoreForTesting } from "@/lib/agent/confirmations";
import type { AgentToolContext } from "@/lib/agent/permissions";
import { createActionTools } from "@/lib/agent/tools/actions";
import { createCommunicationTools } from "@/lib/agent/tools/communications";
import { createReportTools } from "@/lib/agent/tools/reports";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    action: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    communication: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    sEWO: {
      findFirst: vi.fn(),
    },
    smatAudit: {
      findFirst: vi.fn(),
    },
    userPlantRole: {
      findFirst: vi.fn(),
    },
  },
}));

const auditMock = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
}));

const actionServiceMock = vi.hoisted(() => ({
  ActionService: {
    create: vi.fn(),
    close: vi.fn(),
    update: vi.fn(),
  },
}));

const reportServiceMock = vi.hoisted(() => ({
  ReportService: {
    generateCorporatePeriodReport: vi.fn(),
  },
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => prismaMock);
vi.mock("@/lib/audit", () => auditMock);
vi.mock("@/lib/services/action-service", () => actionServiceMock);
vi.mock("@/lib/services/report-service", () => reportServiceMock);
vi.mock("@/lib/logger", () => loggerMock);

function ctx(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  return {
    session: {
      user: {
        id: "user-1",
        name: "User One",
        email: "user@example.com",
        image: null,
        language: "pt",
        mustChangePassword: false,
        plantRoles: [{ plantId: "plant-1", plantCode: "pl01", role: RoleCode.N3_SAFETY }],
      },
      expires: "2099-01-01T00:00:00.000Z",
    },
    userId: "user-1",
    plantId: "plant-1",
    plantCode: "pl01",
    role: RoleCode.N3_SAFETY,
    ...overrides,
  } as AgentToolContext;
}

function toolByName(name: string, context = ctx()) {
  const found = [...createActionTools(context), ...createCommunicationTools(context), ...createReportTools(context)].find(
    (entry) => entry.name === name,
  );
  if (!found) throw new Error(`Tool ${name} not found`);
  return found as unknown as { invoke: (details: unknown, input: string) => Promise<unknown> };
}

describe("agent tools security boundaries", () => {
  beforeEach(() => {
    resetPendingConfirmationStoreForTesting();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetPendingConfirmationStoreForTesting();
  });

  it("lists actions only from the backend-resolved plantId", async () => {
    prismaMock.prisma.action.findMany.mockResolvedValue([]);

    const context = ctx({ requestId: "request-tools-1" });
    const result = await toolByName("list_actions", context).invoke(null, JSON.stringify({ status: ActionStatus.OPEN, limit: 10 }));

    expect(result).toEqual({ ok: true, data: [] });
    expect(prismaMock.prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          plantId: "plant-1",
          status: ActionStatus.OPEN,
        },
        take: 10,
      }),
    );
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "AgentInteraction",
        action: "AGENT_TOOL_CALLED",
        actorUserId: "user-1",
        plantId: "plant-1",
        diff: expect.objectContaining({
          after: expect.objectContaining({
            requestId: "request-tools-1",
            eventType: "tool_called",
            toolName: "list_actions",
          }),
        }),
      }),
    );
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AGENT_TOOL_SUCCEEDED",
        diff: expect.objectContaining({
          after: expect.objectContaining({
            requestId: "request-tools-1",
            eventType: "tool_succeeded",
            result: "success",
            toolName: "list_actions",
          }),
        }),
      }),
    );
  });

  it("does not allow a prompt or tool input to change the plant used by list_actions", async () => {
    prismaMock.prisma.action.findMany.mockResolvedValue([]);

    const result = await toolByName("list_actions").invoke(
      null,
      JSON.stringify({
        status: ActionStatus.OPEN,
        limit: 10,
        plantCode: "pl02",
        plantId: "plant-2",
      }),
    );

    expect(result).toEqual({ ok: true, data: [] });
    expect(prismaMock.prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          plantId: "plant-1",
          status: ActionStatus.OPEN,
        },
      }),
    );
  });

  it("lists communications only from the backend-resolved plantId", async () => {
    prismaMock.prisma.communication.findMany.mockResolvedValue([]);

    const result = await toolByName("list_communications").invoke(
      null,
      JSON.stringify({
        status: CommunicationStatus.VALID_OPEN,
        limit: 10,
        plantCode: "pl02",
        plantId: "plant-2",
      }),
    );

    expect(result).toEqual({ ok: true, data: [] });
    expect(prismaMock.prisma.communication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          plantId: "plant-1",
          status: CommunicationStatus.VALID_OPEN,
        },
        take: 10,
      }),
    );
  });

  it("prepares close_action as a pending confirmation and does not close directly", async () => {
    prismaMock.prisma.action.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Unsafe guard",
      status: ActionStatus.OPEN,
      dueDate: new Date("2026-07-20T00:00:00.000Z"),
    });

    const result = await toolByName("close_action").invoke(
      null,
      JSON.stringify({
        actionId: "11111111-1111-4111-8111-111111111111",
        closureComment: "Closed after local verification.",
        closedAt: "2026-07-15T10:00:00.000Z",
        evidence: [],
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        requiresConfirmation: true,
        toolName: "close_action",
        summary: expect.stringContaining("Unsafe guard"),
        status: "pending",
      },
    });
    expect(actionServiceMock.ActionService.close).not.toHaveBeenCalled();
    expect(prismaMock.prisma.action.findFirst).toHaveBeenCalledWith({
      where: {
        id: "11111111-1111-4111-8111-111111111111",
        plantId: "plant-1",
      },
      select: { id: true, title: true, status: true, dueDate: true },
    });
  });

  it("blocks close_action for roles outside the agent action allowlist", async () => {
    const context = ctx({ role: RoleCode.MEDICO, requestId: "request-tools-blocked" });
    const result = await toolByName("close_action", context).invoke(
      null,
      JSON.stringify({
        actionId: "11111111-1111-4111-8111-111111111111",
        closureComment: "Closed after local verification.",
        closedAt: "2026-07-15T10:00:00.000Z",
        evidence: [],
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: "FORBIDDEN",
    });
    expect(prismaMock.prisma.action.findFirst).not.toHaveBeenCalled();
    expect(actionServiceMock.ActionService.close).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AGENT_TOOL_BLOCKED_RBAC",
        actorUserId: "user-1",
        plantId: "plant-1",
        diff: expect.objectContaining({
          after: expect.objectContaining({
            requestId: "request-tools-blocked",
            eventType: "tool_blocked_rbac",
            result: "blocked",
            role: RoleCode.MEDICO,
            toolName: "close_action",
          }),
        }),
      }),
    );
  });

  it("prepares priority changes for confirmation using backend plant context", async () => {
    prismaMock.prisma.action.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      sequenceNumber: 1,
      title: "Install guard",
      description: "Install a guard on the line.",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      priority: "MEDIUM",
      category: "CORRECTIVE",
      level: "N3",
      dueDate: new Date("2026-07-20T00:00:00.000Z"),
      status: ActionStatus.OPEN,
    });
    actionServiceMock.ActionService.update.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      sequenceNumber: 1,
      title: "Install guard",
      description: "Install a guard on the line.",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      priority: "HIGH",
      category: "CORRECTIVE",
      level: "N3",
      dueDate: new Date("2026-07-20T00:00:00.000Z"),
      status: ActionStatus.OPEN,
    });

    const result = await toolByName("update_action", ctx({ requestId: "request-update-action" })).invoke(
      null,
      JSON.stringify({
        actionId: "ACT-1",
        priority: "HIGH",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        requiresConfirmation: true,
        toolName: "update_action_priority",
      },
    });
    expect(prismaMock.prisma.action.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          plantId: "plant-1",
          sequenceNumber: 1,
        },
      }),
    );
    expect(actionServiceMock.ActionService.update).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AGENT_TOOL_SUCCEEDED",
        diff: expect.objectContaining({
          after: expect.objectContaining({
            requestId: "request-update-action",
            toolName: "update_action",
          }),
        }),
      }),
    );
  });

  it("blocks update_action for N2 even if the tool is invoked directly", async () => {
    const result = await toolByName("update_action", ctx({ role: RoleCode.N2_PLANT_MANAGER })).invoke(
      null,
      JSON.stringify({
        actionId: "ACT-1",
        priority: "HIGH",
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: "FORBIDDEN",
    });
    expect(prismaMock.prisma.action.findFirst).not.toHaveBeenCalled();
    expect(actionServiceMock.ActionService.update).not.toHaveBeenCalled();
  });

  it("does not allow update_action to alter forbidden fields or frontend-supplied context", async () => {
    const result = await toolByName("update_action").invoke(
      null,
      JSON.stringify({
        actionId: "ACT-1",
        priority: "HIGH",
        status: "CLOSED",
        plantId: "plant-2",
        userId: "attacker",
        role: "N0_ADMIN",
        permissions: ["*"],
      }),
    );

    expect(result).toMatchObject({
      ok: false,
    });
    expect(JSON.stringify(result)).not.toContain("stack");
    expect(prismaMock.prisma.action.findFirst).not.toHaveBeenCalled();
    expect(actionServiceMock.ActionService.update).not.toHaveBeenCalled();
  });

  it("finds overdue actions only for the backend-resolved plant", async () => {
    prismaMock.prisma.action.findMany.mockResolvedValue([
      {
        id: "action-overdue",
        sequenceNumber: 7,
        title: "Fix blocked exit",
        priority: "HIGH",
        status: ActionStatus.OPEN,
        dueDate: new Date("2026-07-01T00:00:00.000Z"),
        ownerUser: { id: "owner-1", name: "Owner" },
      },
    ]);

    const result = await toolByName("find_overdue_actions").invoke(
      null,
      JSON.stringify({
        limit: 10,
        plantId: "plant-2",
      }),
    );

    expect(result).toMatchObject({
      ok: false,
    });
    expect(prismaMock.prisma.action.findMany).not.toHaveBeenCalled();

    const valid = await toolByName("find_overdue_actions").invoke(null, JSON.stringify({ limit: 10 }));
    expect(valid).toMatchObject({
      ok: true,
      data: {
        plantCode: "pl01",
        count: 1,
      },
    });
    expect(prismaMock.prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plantId: "plant-1",
          status: { in: [ActionStatus.OPEN, ActionStatus.ONGOING] },
        }),
      }),
    );
  });

  it("generates a plant-scoped period report without returning raw buffers", async () => {
    reportServiceMock.ReportService.generateCorporatePeriodReport.mockResolvedValue({
      title: "MONTHLY - Factory",
      files: { pdf: "report.pdf" },
      storageKeys: { pdfKey: "reports/pl01/monthly/report.pdf" },
      meta: {
        reportType: "MONTHLY",
        scope: "FACTORY",
        plantId: "plant-1",
        periodStart: new Date("2026-07-01T00:00:00.000Z"),
        periodEnd: new Date("2026-07-31T23:59:59.999Z"),
      },
      pdf: Buffer.from("secret pdf"),
    });

    const result = await toolByName("generate_period_report", ctx({ role: RoleCode.N1_CORPORATE })).invoke(
      null,
      JSON.stringify({
        reportType: "MONTHLY",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
      }),
    );

    expect(result).toMatchObject({
      ok: true,
      data: {
        title: "MONTHLY - Factory",
        plantCode: "pl01",
        scope: "FACTORY",
        fileName: "report.pdf",
        storageKey: "reports/pl01/monthly/report.pdf",
      },
    });
    expect(JSON.stringify(result)).not.toContain("secret pdf");
    expect(reportServiceMock.ReportService.generateCorporatePeriodReport).toHaveBeenCalledWith({
      reportType: "MONTHLY",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-31T23:59:59.999Z"),
      plantId: "plant-1",
    });
  });

  it("blocks generate_period_report for N3 because existing corporate report generation is N1-only", async () => {
    const result = await toolByName("generate_period_report", ctx({ role: RoleCode.N3_SAFETY })).invoke(
      null,
      JSON.stringify({
        reportType: "MONTHLY",
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: "FORBIDDEN",
    });
    expect(reportServiceMock.ReportService.generateCorporatePeriodReport).not.toHaveBeenCalled();
  });

  it("blocks execution when the per-request tool call limit is exceeded", async () => {
    const context = ctx({
      requestId: "request-tool-limit",
      guardrails: {
        maxToolCalls: 0,
        toolCallCount: 0,
      },
    });

    const result = await toolByName("list_actions", context).invoke(null, JSON.stringify({ status: ActionStatus.OPEN, limit: 10 }));

    expect(String(result)).toContain("O agente precisou de demasiadas operacoes para concluir este pedido. Tenta reformular.");
    expect(context.guardrails?.toolCallLimitExceeded).toBe(true);

    expect(prismaMock.prisma.action.findMany).not.toHaveBeenCalled();
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AGENT_TOOL_CALL_LIMIT_EXCEEDED",
        actorUserId: "user-1",
        plantId: "plant-1",
        diff: expect.objectContaining({
          after: expect.objectContaining({
            requestId: "request-tool-limit",
            eventType: "tool_call_limit_exceeded",
            result: "blocked",
            errorCode: "AGENT_MAX_TOOL_CALLS_EXCEEDED",
          }),
        }),
      }),
    );
  });

  it("sanitizes unexpected internal tool errors", async () => {
    prismaMock.prisma.action.findMany.mockRejectedValue(new Error("database password leaked in stack trace"));

    const result = await toolByName("list_actions").invoke(null, JSON.stringify({ status: ActionStatus.OPEN, limit: 10 }));

    expect(result).toMatchObject({
      ok: false,
      errorCode: "AGENT_TOOL_ERROR",
    });
    expect(JSON.stringify(result)).not.toContain("database password");
    expect(JSON.stringify(result)).not.toContain("stack trace");
  });

  it("keeps expected operational tool errors user-facing", async () => {
    prismaMock.prisma.action.findFirst.mockResolvedValue(null);

    const result = await toolByName("close_action").invoke(
      null,
      JSON.stringify({
        actionId: "11111111-1111-4111-8111-111111111111",
        closureComment: "Closed after local verification.",
        closedAt: "2026-07-15T10:00:00.000Z",
        evidence: [],
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: "AGENT_TOOL_USER_ERROR",
      message: "Action not found for this plant.",
    });
    expect(actionServiceMock.ActionService.close).not.toHaveBeenCalled();
  });
});
