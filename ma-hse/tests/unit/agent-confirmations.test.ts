import { RoleCode } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auditMock = vi.hoisted(() => ({
  writeAuditLog: vi.fn(),
}));

const loggerMock = vi.hoisted(() => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock("@/lib/audit", () => auditMock);
vi.mock("@/lib/logger", () => loggerMock);

import {
  cancelPendingConfirmation,
  createPendingConfirmation,
  executePendingConfirmation,
  setPendingConfirmationExecutorForTesting,
  setPendingConfirmationStoreForTesting,
  resetPendingConfirmationStoreForTesting,
  type PendingConfirmationRecord,
  type PendingConfirmationStatus,
  type PendingConfirmationStore,
} from "@/lib/agent/confirmations";
import type { AgentToolContext } from "@/lib/agent/permissions";

function ctx(overrides: Partial<AgentToolContext> = {}): AgentToolContext {
  const base = {
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
  } as AgentToolContext;

  return {
    ...base,
    ...overrides,
  };
}

class JsonOnlyPersistentConfirmationStore implements PendingConfirmationStore {
  private readonly records = new Map<string, PendingConfirmationRecord>();

  async create<TPayload>(record: PendingConfirmationRecord<TPayload>) {
    const persisted = {
      ...record,
      payload: JSON.parse(JSON.stringify(record.payload)),
      execute: undefined,
    } as PendingConfirmationRecord<TPayload>;
    this.records.set(record.confirmationId, persisted as PendingConfirmationRecord);
    return persisted;
  }

  async get(confirmationId: string) {
    return this.records.get(confirmationId) ?? null;
  }

  async updateStatus(
    confirmationId: string,
    status: PendingConfirmationStatus,
    options: { resolvedAt?: Date | null; onlyPending?: boolean } = {},
  ) {
    const current = this.records.get(confirmationId);
    if (!current) return null;
    if (options.onlyPending && current.status !== "pending") return current;
    const updated = {
      ...current,
      status,
      resolvedAt: "resolvedAt" in options ? options.resolvedAt?.toISOString() ?? null : current.resolvedAt,
    };
    this.records.set(confirmationId, updated);
    return updated;
  }
}

async function createCloseActionConfirmation(input: {
  context?: AgentToolContext;
  payload?: { actionId: string; closureComment: string };
  execute?: (payload: { actionId: string; closureComment: string }) => Promise<unknown>;
} = {}) {
  const currentCtx = input.context ?? ctx();
  const payload = input.payload ?? {
    actionId: "11111111-1111-4111-8111-111111111111",
    closureComment: "Closed after confirmation.",
  };

  return createPendingConfirmation({
    ctx: currentCtx,
    toolName: "close_action",
    summary: "Close action",
    payload,
    allowedRoles: [RoleCode.N3_SAFETY],
    execute: async (_ctx, storedPayload) => input.execute?.(storedPayload) ?? storedPayload,
  });
}

describe("agent pending confirmations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPendingConfirmationStoreForTesting();
  });

  it("executes a valid confirmation with the server-stored payload", async () => {
    let executedPayload: unknown = null;
    const context = ctx({ requestId: "request-confirm-1" });
    const confirmation = await createCloseActionConfirmation({
      context,
      payload: {
        actionId: "11111111-1111-4111-8111-111111111111",
        closureComment: "Original server payload.",
      },
      execute: async (payload) => {
        executedPayload = payload;
        return { closed: payload.actionId };
      },
    });

    const result = await executePendingConfirmation({
      ctx: context,
      confirmationId: confirmation.confirmationId,
    });

    expect(result.ok).toBe(true);
    expect(executedPayload).toEqual({
      actionId: "11111111-1111-4111-8111-111111111111",
      closureComment: "Original server payload.",
    });
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AGENT_CONFIRMATION_CREATED",
        diff: expect.objectContaining({
          after: expect.objectContaining({
            requestId: "request-confirm-1",
            eventType: "confirmation_created",
            confirmationId: confirmation.confirmationId,
            toolName: "close_action",
          }),
        }),
      }),
    );
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AGENT_CONFIRMATION_CONFIRMED",
        diff: expect.objectContaining({
          after: expect.objectContaining({
            requestId: "request-confirm-1",
            eventType: "confirmation_confirmed",
            result: "success",
            confirmationId: confirmation.confirmationId,
          }),
        }),
      }),
    );
  });

  it("rejects an unknown confirmation id", async () => {
    const result = await executePendingConfirmation({
      ctx: ctx(),
      confirmationId: "22222222-2222-4222-8222-222222222222",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("CONFIRMATION_NOT_FOUND");
  });

  it("rejects a confirmation for another user", async () => {
    const confirmation = await createCloseActionConfirmation();

    const result = await executePendingConfirmation({
      ctx: ctx({ userId: "user-2" }),
      confirmationId: confirmation.confirmationId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("another user");
  });

  it("rejects a confirmation for another plant", async () => {
    const confirmation = await createCloseActionConfirmation();

    const result = await executePendingConfirmation({
      ctx: ctx({ plantId: "plant-2", plantCode: "pl02" }),
      confirmationId: confirmation.confirmationId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("another plant");
  });

  it("blocks an expired confirmation", async () => {
    const context = ctx({ requestId: "request-confirm-expired" });
    const confirmation = await createCloseActionConfirmation({ context });

    const realDateParse = Date.parse;
    const expiresAtMs = realDateParse(confirmation.expiresAt);
    const realNow = Date.now;
    Date.now = () => expiresAtMs + 1;

    try {
      const result = await executePendingConfirmation({
        ctx: context,
        confirmationId: confirmation.confirmationId,
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errorCode).toBe("CONFIRMATION_EXPIRED");
      expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "AGENT_CONFIRMATION_EXPIRED",
          diff: expect.objectContaining({
            after: expect.objectContaining({
              requestId: "request-confirm-expired",
              eventType: "confirmation_expired",
              result: "blocked",
              confirmationId: confirmation.confirmationId,
            }),
          }),
        }),
      );
    } finally {
      Date.now = realNow;
    }
  });

  it("marks a cancelled confirmation and blocks later execution", async () => {
    const context = ctx({ requestId: "request-confirm-cancel" });
    const confirmation = await createCloseActionConfirmation({ context });

    const cancelled = await cancelPendingConfirmation({
      ctx: context,
      confirmationId: confirmation.confirmationId,
    });
    expect(cancelled.ok).toBe(true);
    expect(auditMock.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "AGENT_CONFIRMATION_CANCELLED",
        diff: expect.objectContaining({
          after: expect.objectContaining({
            requestId: "request-confirm-cancel",
            eventType: "confirmation_cancelled",
            result: "success",
            confirmationId: confirmation.confirmationId,
          }),
        }),
      }),
    );

    const result = await executePendingConfirmation({
      ctx: context,
      confirmationId: confirmation.confirmationId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("CONFIRMATION_CANCELLED");
  });

  it("does not allow payload tampering during confirmation", async () => {
    let executedPayload: unknown = null;
    const confirmation = await createCloseActionConfirmation({
      payload: {
        actionId: "11111111-1111-4111-8111-111111111111",
        closureComment: "Original server payload.",
      },
      execute: async (payload) => {
        executedPayload = payload;
        return payload;
      },
    });

    const result = await executePendingConfirmation({
      ctx: ctx(),
      confirmationId: confirmation.confirmationId,
    });

    expect(result.ok).toBe(true);
    expect(executedPayload).not.toEqual({
      actionId: "99999999-9999-4999-8999-999999999999",
      closureComment: "Tampered frontend payload.",
    });
    expect(executedPayload).toEqual({
      actionId: "11111111-1111-4111-8111-111111111111",
      closureComment: "Original server payload.",
    });
  });

  it("blocks execution if the user lost the required role before confirmation", async () => {
    const confirmation = await createCloseActionConfirmation();

    const result = await executePendingConfirmation({
      ctx: ctx({ role: RoleCode.MEDICO }),
      confirmationId: confirmation.confirmationId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorCode).toBe("CONFIRMATION_ROLE_FORBIDDEN");
  });

  it("executes a persisted confirmation without needing an in-memory execute closure", async () => {
    const store = new JsonOnlyPersistentConfirmationStore();
    setPendingConfirmationStoreForTesting(store);
    let executedPayload: unknown = null;
    setPendingConfirmationExecutorForTesting("test_persisted_tool", async (_ctx, payload) => {
      executedPayload = payload;
      return { ok: true };
    });

    const confirmation = await createPendingConfirmation({
      ctx: ctx(),
      toolName: "test_persisted_tool",
      summary: "Persisted confirmation",
      payload: {
        actionId: "11111111-1111-4111-8111-111111111111",
        closureComment: "Stored as JSON.",
      },
      allowedRoles: [RoleCode.N3_SAFETY],
      execute: async () => {
        throw new Error("In-memory closure should not be used.");
      },
    });

    const result = await executePendingConfirmation({
      ctx: ctx(),
      confirmationId: confirmation.confirmationId,
    });

    expect(result.ok).toBe(true);
    expect(executedPayload).toEqual({
      actionId: "11111111-1111-4111-8111-111111111111",
      closureComment: "Stored as JSON.",
    });
    expect(await store.get(confirmation.confirmationId)).toMatchObject({
      status: "confirmed",
      resolvedAt: expect.any(String),
    });
  });
});
