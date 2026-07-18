import { ActionStatus, RoleCode } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelPendingConfirmation,
  executePendingConfirmation,
  resetPendingConfirmationStoreForTesting,
} from "@/lib/agent/confirmations";
import type { AgentToolContext } from "@/lib/agent/permissions";

const prismaMock = vi.hoisted(() => ({
  prisma: {
    action: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    communication: {
      findMany: vi.fn(),
    },
  },
}));

const auditMock = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
}));

const actionServiceMock = vi.hoisted(() => ({
  ActionService: {
    close: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

const reportServiceMock = vi.hoisted(() => ({
  ReportService: {
    generateCorporatePeriodReport: vi.fn(),
  },
}));

const kpiServiceMock = vi.hoisted(() => ({
  KpiService: {
    getMonthlyKpis: vi.fn(),
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
vi.mock("@/lib/services/kpi-service", () => kpiServiceMock);
vi.mock("@/lib/logger", () => loggerMock);

import { runMockAgent } from "@/lib/agent/mock-agent";

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

describe("mock internal agent", () => {
  beforeEach(() => {
    resetPendingConfirmationStoreForTesting();
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetPendingConfirmationStoreForTesting();
  });

  it("lists open actions through the real list_actions tool and backend plant context", async () => {
    prismaMock.prisma.action.findMany
      .mockResolvedValueOnce([
        {
          id: "action-open",
          sequenceNumber: 1,
          sourceType: "MANUAL",
          title: "Install guard",
          description: "Install guard",
          category: "CORRECTIVE",
          priority: "MEDIUM",
          status: ActionStatus.OPEN,
          dueDate: new Date("2026-07-20T00:00:00.000Z"),
          ownerUser: { id: "user-1", name: "Owner", email: "owner@example.com" },
          coOwners: [],
          communication: null,
          sewo: null,
          smatLinks: [],
        },
      ])
      .mockResolvedValueOnce([]);

    const result = await runMockAgent(ctx(), "lista acoes abertas");

    expect(result.message).toContain("Install guard");
    expect(prismaMock.prisma.action.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { plantId: "plant-1", status: ActionStatus.OPEN },
      }),
    );
    expect(prismaMock.prisma.action.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { plantId: "plant-1", status: ActionStatus.ONGOING },
      }),
    );
  });

  it("lists communications without being captured by the actions command matcher", async () => {
    prismaMock.prisma.communication.findMany.mockResolvedValue([
      {
        id: "communication-1",
        codigoCompleto: "UC-1",
        codigoAbreviado: null,
        type: "UNSAFE_CONDITION",
        level: "N3",
        status: "VALID_OPEN",
        eventDatetime: new Date("2026-07-15T10:00:00.000Z"),
        reporterName: "Reporter",
        targetText: null,
        description: "Oil on the floor.",
        suggestedAction: null,
        riskTheme: null,
        unsafeActTypeId: null,
        unsafeConditionType: null,
        nearMissType: null,
        actions: [],
      },
    ]);

    const result = await runMockAgent(ctx(), "lista comunicacoes");

    expect(result.message).toContain("UC-1");
    expect(result.message).toContain("comunicação");
    expect(prismaMock.prisma.communication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ plantId: "plant-1" }),
      }),
    );
    expect(prismaMock.prisma.action.findMany).not.toHaveBeenCalled();
  });

  it("creates a real pending confirmation for close_action and does not close immediately", async () => {
    prismaMock.prisma.action.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Install guard",
      status: ActionStatus.OPEN,
      dueDate: new Date("2026-07-20T00:00:00.000Z"),
    });

    const currentCtx = ctx();
    const result = await runMockAgent(currentCtx, "fecha a acao 1");

    expect(result.confirmation?.confirmationId).toBeTruthy();
    expect(result.confirmation?.toolName).toBe("close_action");
    expect(result.message).toContain("Install guard");
    expect(actionServiceMock.ActionService.close).not.toHaveBeenCalled();
    expect(prismaMock.prisma.action.findFirst).toHaveBeenCalledWith({
      where: { plantId: "plant-1", sequenceNumber: 1 },
      select: { id: true },
    });
  });

  it("finds overdue actions through the real find_overdue_actions tool", async () => {
    prismaMock.prisma.action.findMany.mockResolvedValue([
      {
        id: "action-overdue",
        sequenceNumber: 3,
        title: "Fix blocked exit",
        priority: "HIGH",
        status: ActionStatus.OPEN,
        dueDate: new Date("2026-07-01T00:00:00.000Z"),
        ownerUser: { id: "owner-1", name: "Owner" },
      },
    ]);

    const result = await runMockAgent(ctx(), "acoes em atraso");

    expect(result.message).toContain("Fix blocked exit");
    expect(prismaMock.prisma.action.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          plantId: "plant-1",
          status: { in: [ActionStatus.OPEN, ActionStatus.ONGOING] },
        }),
      }),
    );
  });

  it("updates action priority through the real update_action tool", async () => {
    prismaMock.prisma.action.findFirst
      .mockResolvedValueOnce({ id: "11111111-1111-4111-8111-111111111111" })
      .mockResolvedValueOnce({
        id: "11111111-1111-4111-8111-111111111111",
        sequenceNumber: 1,
        title: "Install guard",
        description: "Install guard on the line.",
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
      description: "Install guard on the line.",
      ownerUserId: "22222222-2222-4222-8222-222222222222",
      priority: "HIGH",
      category: "CORRECTIVE",
      level: "N3",
      dueDate: new Date("2026-07-20T00:00:00.000Z"),
      status: ActionStatus.OPEN,
    });

    const result = await runMockAgent(ctx(), "atualiza a acao ACT-1 para prioridade alta");

    expect(result.message).toContain("HIGH");
    expect(actionServiceMock.ActionService.update).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: "11111111-1111-4111-8111-111111111111",
        actorUserId: "user-1",
        payload: expect.objectContaining({ priority: "HIGH" }),
      }),
    );
  });

  it("generates the current month report through the real report tool for N1", async () => {
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

    const result = await runMockAgent(ctx({ role: RoleCode.N1_CORPORATE }), "gera relatorio do mes atual");

    expect(result.message).toContain("Relatório gerado");
    expect(result.message).not.toContain("secret pdf");
    expect(reportServiceMock.ReportService.generateCorporatePeriodReport).toHaveBeenCalledWith(
      expect.objectContaining({
        reportType: "MONTHLY",
        plantId: "plant-1",
      }),
    );
  });

  it("executes and cancels mock close confirmations through the real confirmation flow", async () => {
    prismaMock.prisma.action.findFirst.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Install guard",
      status: ActionStatus.OPEN,
      dueDate: new Date("2026-07-20T00:00:00.000Z"),
    });
    actionServiceMock.ActionService.close.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      title: "Install guard",
      status: ActionStatus.CLOSED,
      closedAt: new Date("2026-07-15T10:00:00.000Z"),
    });

    const currentCtx = ctx();
    const prepared = await runMockAgent(currentCtx, "fecha a acao 1");
    expect(prepared.confirmation?.confirmationId).toBeTruthy();

    const executed = await executePendingConfirmation({
      ctx: currentCtx,
      confirmationId: prepared.confirmation!.confirmationId,
    });

    expect(executed.ok).toBe(true);
    expect(actionServiceMock.ActionService.close).toHaveBeenCalledTimes(1);

    const secondCtx = ctx();
    const secondPrepared = await runMockAgent(secondCtx, "fecha a acao 1");
    const cancelled = await cancelPendingConfirmation({
      ctx: secondCtx,
      confirmationId: secondPrepared.confirmation!.confirmationId,
    });
    expect(cancelled.ok).toBe(true);

    const blocked = await executePendingConfirmation({
      ctx: secondCtx,
      confirmationId: secondPrepared.confirmation!.confirmationId,
    });

    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.errorCode).toBe("CONFIRMATION_CANCELLED");
  });

  it("returns mock-mode guidance in the authenticated user's language", async () => {
    const germanContext = ctx();
    germanContext.session.user.language = "de";

    const result = await runMockAgent(germanContext, "Hilfe");

    expect(result.message).toContain("Mock-/Entwicklungsmodus");
    expect(result.message).toContain("Maßnahmen");
  });
});
