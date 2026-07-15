import { randomUUID } from "crypto";
import { RoleCode } from "@prisma/client";
import { writeAgentAuditEvent } from "@/lib/agent/audit";
import type { AgentPendingConfirmationSummary, AgentToolContext } from "@/lib/agent/permissions";
import { hasAgentPermission, summarizeForAgentLog } from "@/lib/agent/permissions";
import { prisma } from "@/lib/prisma";
import {
  closeActionConfirmationPayloadInput,
  executeCloseActionConfirmation,
} from "@/lib/agent/tools/action-confirmation-executors";

const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

export type PendingConfirmationStatus = "pending" | "confirmed" | "cancelled" | "expired";
type DbPendingConfirmationStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
type ConfirmationExecutor = (ctx: AgentToolContext, payload: unknown) => Promise<unknown>;

export type PendingConfirmationRecord<TPayload = unknown> = {
  confirmationId: string;
  userId: string;
  plantCode: string;
  plantId: string;
  toolName: string;
  payload: TPayload;
  summary: string;
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string | null;
  status: PendingConfirmationStatus;
  allowedRoles: readonly RoleCode[];
  execute?: (ctx: AgentToolContext, payload: TPayload) => Promise<unknown>;
};

export type PendingConfirmationStore = {
  create<TPayload>(record: PendingConfirmationRecord<TPayload>): Promise<PendingConfirmationRecord<TPayload>>;
  get(confirmationId: string): Promise<PendingConfirmationRecord | null>;
  updateStatus(
    confirmationId: string,
    status: PendingConfirmationStatus,
    options?: { resolvedAt?: Date | null; onlyPending?: boolean },
  ): Promise<PendingConfirmationRecord | null>;
  clear?(): Promise<void> | void;
};

type AgentPendingConfirmationRow = {
  id: string;
  userId: string;
  plantCode: string;
  plantId: string;
  toolName: string;
  summary: string;
  payloadJson: unknown;
  allowedRoles: RoleCode[];
  status: DbPendingConfirmationStatus;
  createdAt: Date;
  expiresAt: Date;
  resolvedAt: Date | null;
};

type AgentPendingConfirmationDelegate = {
  create(input: { data: Record<string, unknown> }): Promise<AgentPendingConfirmationRow>;
  findUnique(input: { where: { id: string } }): Promise<AgentPendingConfirmationRow | null>;
  update(input: { where: { id: string }; data: Record<string, unknown> }): Promise<AgentPendingConfirmationRow>;
  updateMany(input: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  deleteMany(input?: { where?: Record<string, unknown> }): Promise<{ count: number }>;
};

function pendingConfirmationDelegate() {
  return (prisma as unknown as { agentPendingConfirmation: AgentPendingConfirmationDelegate }).agentPendingConfirmation;
}

function toDbStatus(status: PendingConfirmationStatus): DbPendingConfirmationStatus {
  return status.toUpperCase() as DbPendingConfirmationStatus;
}

function fromDbStatus(status: DbPendingConfirmationStatus): PendingConfirmationStatus {
  return status.toLowerCase() as PendingConfirmationStatus;
}

function jsonClone(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function rowToRecord(row: AgentPendingConfirmationRow): PendingConfirmationRecord {
  return {
    confirmationId: row.id,
    userId: row.userId,
    plantCode: row.plantCode,
    plantId: row.plantId,
    toolName: row.toolName,
    payload: row.payloadJson,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    status: fromDbStatus(row.status),
    allowedRoles: row.allowedRoles,
  };
}

class PrismaPendingConfirmationStore implements PendingConfirmationStore {
  async create<TPayload>(record: PendingConfirmationRecord<TPayload>) {
    const created = await pendingConfirmationDelegate().create({
      data: {
        id: record.confirmationId,
        userId: record.userId,
        plantCode: record.plantCode,
        plantId: record.plantId,
        toolName: record.toolName,
        summary: record.summary,
        payloadJson: jsonClone(record.payload),
        allowedRoles: [...record.allowedRoles],
        status: toDbStatus(record.status),
        createdAt: new Date(record.createdAt),
        expiresAt: new Date(record.expiresAt),
        resolvedAt: record.resolvedAt ? new Date(record.resolvedAt) : null,
      },
    });

    return {
      ...rowToRecord(created),
      execute: record.execute,
    } as PendingConfirmationRecord<TPayload>;
  }

  async get(confirmationId: string) {
    const row = await pendingConfirmationDelegate().findUnique({ where: { id: confirmationId } });
    return row ? rowToRecord(row) : null;
  }

  async updateStatus(confirmationId: string, status: PendingConfirmationStatus, options: { resolvedAt?: Date | null; onlyPending?: boolean } = {}) {
    const data: Record<string, unknown> = {
      status: toDbStatus(status),
    };
    if ("resolvedAt" in options) {
      data.resolvedAt = options.resolvedAt;
    }

    if (options.onlyPending) {
      const updated = await pendingConfirmationDelegate().updateMany({
        where: {
          id: confirmationId,
          status: "PENDING",
        },
        data,
      });
      if (updated.count === 0) return this.get(confirmationId);
      return this.get(confirmationId);
    }

    const updated = await pendingConfirmationDelegate().update({
      where: { id: confirmationId },
      data,
    });
    return rowToRecord(updated);
  }
}

// Test-only store. Runtime defaults to the DB-backed store below.
class InMemoryPendingConfirmationStore implements PendingConfirmationStore {
  private readonly records = new Map<string, PendingConfirmationRecord>();

  async create<TPayload>(record: PendingConfirmationRecord<TPayload>) {
    this.records.set(record.confirmationId, record as PendingConfirmationRecord);
    return record;
  }

  async get(confirmationId: string) {
    return this.records.get(confirmationId) ?? null;
  }

  async updateStatus(confirmationId: string, status: PendingConfirmationStatus, options: { resolvedAt?: Date | null; onlyPending?: boolean } = {}) {
    const record = this.records.get(confirmationId);
    if (!record) return null;
    if (options.onlyPending && record.status !== "pending") return record;
    const updated = {
      ...record,
      status,
      resolvedAt: "resolvedAt" in options ? options.resolvedAt?.toISOString() ?? null : record.resolvedAt,
    };
    this.records.set(confirmationId, updated);
    return updated;
  }

  clear() {
    this.records.clear();
  }
}

let confirmationStore: PendingConfirmationStore = new PrismaPendingConfirmationStore();
const defaultConfirmationExecutors: Record<string, ConfirmationExecutor> = {
  close_action: async (ctx, payload) => executeCloseActionConfirmation(ctx, closeActionConfirmationPayloadInput.parse(payload)),
};
let confirmationExecutors: Record<string, ConfirmationExecutor> = { ...defaultConfirmationExecutors };

export function setPendingConfirmationStoreForTesting(store: PendingConfirmationStore) {
  confirmationStore = store;
}

export function resetPendingConfirmationStoreForTesting() {
  confirmationStore = new InMemoryPendingConfirmationStore();
  confirmationExecutors = { ...defaultConfirmationExecutors };
}

export function useDatabasePendingConfirmationStoreForTesting() {
  confirmationStore = new PrismaPendingConfirmationStore();
}

export function setPendingConfirmationExecutorForTesting(toolName: string, executor: ConfirmationExecutor) {
  confirmationExecutors[toolName] = executor;
}

function toSummary<TPayload>(record: PendingConfirmationRecord<TPayload>): AgentPendingConfirmationSummary {
  return {
    confirmationId: record.confirmationId,
    toolName: record.toolName,
    summary: record.summary,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    status: record.status,
  };
}

function isExpired(record: PendingConfirmationRecord, nowMs = Date.now()) {
  return Date.parse(record.expiresAt) <= nowMs;
}

function summarizeConfirmationPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { payloadType: payload === null ? "null" : typeof payload };
  }

  const record = payload as Record<string, unknown>;
  const ids = Object.fromEntries(
    Object.entries(record).filter(([key, value]) => /(^id$|id$|Id$)/.test(key) && typeof value === "string"),
  );
  const stringLengths = Object.fromEntries(
    Object.entries(record)
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, (value as string).length]),
  );

  return {
    fields: Object.keys(record).slice(0, 20),
    ids,
    stringLengths,
  };
}

export async function getPendingConfirmation(confirmationId: string) {
  return confirmationStore.get(confirmationId);
}

export async function expirePendingConfirmation(input: { confirmationId: string }) {
  const expired = await confirmationStore.updateStatus(input.confirmationId, "expired", {
    resolvedAt: new Date(),
    onlyPending: true,
  });
  return expired ? toSummary(expired) : null;
}

async function auditConfirmation(input: {
  ctx: AgentToolContext;
  eventType: string;
  result: "success" | "blocked" | "error";
  confirmationId: string;
  toolName?: string | null;
  errorCode?: string | null;
  status?: number | string | null;
  summary?: string | null;
  input?: unknown;
  outputSummary?: unknown;
}) {
  await writeAgentAuditEvent({
    ctx: input.ctx,
    eventType: input.eventType,
    result: input.result,
    confirmationId: input.confirmationId,
    toolName: input.toolName,
    errorCode: input.errorCode,
    status: input.status,
    summary: input.summary,
    input: input.input,
    outputSummary: input.outputSummary,
  });
}

export async function createPendingConfirmation<TPayload>(input: {
  ctx: AgentToolContext;
  toolName: string;
  summary: string;
  payload: TPayload;
  allowedRoles: readonly RoleCode[];
  execute?: (ctx: AgentToolContext, payload: TPayload) => Promise<unknown>;
}): Promise<AgentPendingConfirmationSummary> {
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + CONFIRMATION_TTL_MS);
  const record: PendingConfirmationRecord<TPayload> = {
    confirmationId: randomUUID(),
    userId: input.ctx.userId,
    plantCode: input.ctx.plantCode,
    plantId: input.ctx.plantId,
    toolName: input.toolName,
    payload: input.payload,
    summary: input.summary,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status: "pending",
    allowedRoles: input.allowedRoles,
    execute: input.execute,
  };

  const created = await confirmationStore.create(record);
  const confirmation = toSummary(created);
  input.ctx.pendingConfirmation = confirmation;
  await auditConfirmation({
    ctx: input.ctx,
    eventType: "confirmation_created",
    result: "success",
    confirmationId: confirmation.confirmationId,
    toolName: confirmation.toolName,
    summary: confirmation.summary,
    input: {
      payload: summarizeConfirmationPayload(record.payload),
      allowedRoles: record.allowedRoles,
      expiresAt: record.expiresAt,
    },
  });
  return confirmation;
}

async function executeStoredConfirmation(ctx: AgentToolContext, pending: PendingConfirmationRecord) {
  if (pending.execute) {
    return pending.execute(ctx, pending.payload);
  }

  const executor = confirmationExecutors[pending.toolName];
  if (executor) return executor(ctx, pending.payload);

  return {
    ok: false,
    errorCode: "CONFIRMATION_EXECUTOR_NOT_FOUND",
    message: "This confirmation can no longer be executed.",
  };
}

function alreadyResolvedError(pending: PendingConfirmationRecord) {
  return {
    ok: false as const,
    status: 409,
    errorCode: `CONFIRMATION_${pending.status.toUpperCase()}`,
    message: `Confirmation is already ${pending.status}.`,
  };
}

export async function confirmPendingConfirmation(input: {
  ctx: AgentToolContext;
  confirmationId: string;
}) {
  const pending = await confirmationStore.get(input.confirmationId);
  if (!pending) {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_confirm_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      errorCode: "CONFIRMATION_NOT_FOUND",
      status: 404,
    });
    return {
      ok: false as const,
      status: 404,
      errorCode: "CONFIRMATION_NOT_FOUND",
      message: "Confirmation request not found.",
    };
  }

  if (pending.status !== "pending") {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_confirm_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: `CONFIRMATION_${pending.status.toUpperCase()}`,
      status: 409,
      summary: pending.summary,
    });
    return alreadyResolvedError(pending);
  }

  if (pending.userId !== input.ctx.userId) {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_confirm_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: "CONFIRMATION_FORBIDDEN",
      status: 403,
      summary: pending.summary,
    });
    return {
      ok: false as const,
      status: 403,
      errorCode: "CONFIRMATION_FORBIDDEN",
      message: "This confirmation belongs to another user.",
    };
  }

  if (pending.plantCode !== input.ctx.plantCode || pending.plantId !== input.ctx.plantId) {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_confirm_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: "CONFIRMATION_FORBIDDEN",
      status: 403,
      summary: pending.summary,
    });
    return {
      ok: false as const,
      status: 403,
      errorCode: "CONFIRMATION_FORBIDDEN",
      message: "This confirmation belongs to another plant.",
    };
  }

  if (isExpired(pending)) {
    await expirePendingConfirmation({ confirmationId: input.confirmationId });
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_expired",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: "CONFIRMATION_EXPIRED",
      status: 410,
      summary: pending.summary,
    });
    return {
      ok: false as const,
      status: 410,
      errorCode: "CONFIRMATION_EXPIRED",
      message: "Confirmation request expired. Please ask the agent to prepare the action again.",
    };
  }

  if (!hasAgentPermission(input.ctx, pending.allowedRoles)) {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_confirm_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: "CONFIRMATION_ROLE_FORBIDDEN",
      status: 403,
      summary: pending.summary,
    });
    return {
      ok: false as const,
      status: 403,
      errorCode: "CONFIRMATION_ROLE_FORBIDDEN",
      message: "Your current role no longer allows this action.",
    };
  }

  const confirmed = await confirmationStore.updateStatus(input.confirmationId, "confirmed", {
    resolvedAt: new Date(),
    onlyPending: true,
  });
  if (!confirmed || confirmed.status !== "confirmed") {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_confirm_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: confirmed ? `CONFIRMATION_${confirmed.status.toUpperCase()}` : "CONFIRMATION_NOT_FOUND",
      status: confirmed ? 409 : 404,
      summary: pending.summary,
    });
    return confirmed ? alreadyResolvedError(confirmed) : {
      ok: false as const,
      status: 404,
      errorCode: "CONFIRMATION_NOT_FOUND",
      message: "Confirmation request not found.",
    };
  }

  const result = await executeStoredConfirmation(input.ctx, pending);
  await auditConfirmation({
    ctx: input.ctx,
    eventType: "confirmation_confirmed",
    result: "success",
    confirmationId: input.confirmationId,
    toolName: pending.toolName,
    summary: pending.summary,
    input: summarizeConfirmationPayload(pending.payload),
    outputSummary: result,
  });
  return {
    ok: true as const,
    data: {
      toolName: pending.toolName,
      summary: pending.summary,
      payload: summarizeForAgentLog(pending.payload),
      status: "confirmed" as const,
      result,
    },
  };
}

export const executePendingConfirmation = confirmPendingConfirmation;

export async function cancelPendingConfirmation(input: {
  ctx: AgentToolContext;
  confirmationId: string;
}) {
  const pending = await confirmationStore.get(input.confirmationId);
  if (!pending) {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_cancel_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      errorCode: "CONFIRMATION_NOT_FOUND",
      status: 404,
    });
    return {
      ok: false as const,
      status: 404,
      errorCode: "CONFIRMATION_NOT_FOUND",
      message: "Confirmation request not found.",
    };
  }

  if (pending.status !== "pending") {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_cancel_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: `CONFIRMATION_${pending.status.toUpperCase()}`,
      status: 409,
      summary: pending.summary,
    });
    return alreadyResolvedError(pending);
  }

  if (pending.userId !== input.ctx.userId) {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_cancel_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: "CONFIRMATION_FORBIDDEN",
      status: 403,
      summary: pending.summary,
    });
    return {
      ok: false as const,
      status: 403,
      errorCode: "CONFIRMATION_FORBIDDEN",
      message: "This confirmation belongs to another user.",
    };
  }

  if (pending.plantCode !== input.ctx.plantCode || pending.plantId !== input.ctx.plantId) {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_cancel_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: "CONFIRMATION_FORBIDDEN",
      status: 403,
      summary: pending.summary,
    });
    return {
      ok: false as const,
      status: 403,
      errorCode: "CONFIRMATION_FORBIDDEN",
      message: "This confirmation belongs to another plant.",
    };
  }

  if (isExpired(pending)) {
    await expirePendingConfirmation({ confirmationId: input.confirmationId });
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_expired",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: "CONFIRMATION_EXPIRED",
      status: 410,
      summary: pending.summary,
    });
    return {
      ok: false as const,
      status: 410,
      errorCode: "CONFIRMATION_EXPIRED",
      message: "Confirmation request expired and can no longer be cancelled.",
    };
  }

  const cancelled = await confirmationStore.updateStatus(input.confirmationId, "cancelled", {
    resolvedAt: new Date(),
    onlyPending: true,
  });
  if (!cancelled || cancelled.status !== "cancelled") {
    await auditConfirmation({
      ctx: input.ctx,
      eventType: "confirmation_cancel_failed",
      result: "blocked",
      confirmationId: input.confirmationId,
      toolName: pending.toolName,
      errorCode: cancelled ? `CONFIRMATION_${cancelled.status.toUpperCase()}` : "CONFIRMATION_NOT_FOUND",
      status: cancelled ? 409 : 404,
      summary: pending.summary,
    });
    return cancelled ? alreadyResolvedError(cancelled) : {
      ok: false as const,
      status: 404,
      errorCode: "CONFIRMATION_NOT_FOUND",
      message: "Confirmation request not found.",
    };
  }

  await auditConfirmation({
    ctx: input.ctx,
    eventType: "confirmation_cancelled",
    result: "success",
    confirmationId: input.confirmationId,
    toolName: pending.toolName,
    summary: pending.summary,
  });

  return {
    ok: true as const,
    data: {
      ...toSummary(cancelled),
      status: "cancelled" as const,
    },
  };
}
