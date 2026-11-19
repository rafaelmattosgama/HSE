import { describe, expect, it } from "vitest";
import { ActionStatus, CommunicationStatus, CommunicationType } from "@prisma/client";
import { createRandom } from "../../prisma/demo-data/random";
import { DEMO_WORKERS } from "../../prisma/demo-data/people";
import { buildDemoHistory } from "../../prisma/demo-data/history";

const now = new Date("2026-11-18T10:00:00Z");

describe("demo data generators", () => {
  it("random is deterministic per seed", () => {
    const a = createRandom("x");
    const b = createRandom("x");
    expect([a.next(), a.next()]).toEqual([b.next(), b.next()]);
    expect(createRandom("y").next()).not.toBe(createRandom("x").next());
  });

  it("workers are fictitious, unique and well formed", () => {
    expect(DEMO_WORKERS.length).toBe(40);
    expect(new Set(DEMO_WORKERS.map((w) => w.employeeNo)).size).toBe(40);
    for (const worker of DEMO_WORKERS) expect(worker.employeeNo).toMatch(/^D\d{4}$/);
  });

  it("history covers 12 months with a credible pyramid and open work", () => {
    const history = buildDemoHistory({ plantCode: "demo-lis", now, months: 12 });
    const byType = (type: CommunicationType) => history.communications.filter((c) => c.type === type).length;
    expect(byType(CommunicationType.UNSAFE_ACT) + byType(CommunicationType.UNSAFE_CONDITION)).toBeGreaterThan(200);
    expect(byType(CommunicationType.NEAR_MISS)).toBeGreaterThan(40);
    expect(byType(CommunicationType.FIRST_AID)).toBeGreaterThan(10);
    expect(history.communications.some((c) => c.status === CommunicationStatus.SUBMITTED)).toBe(true);
    expect(history.actions.some((a) => a.status !== ActionStatus.CLOSED && a.dueDate < now)).toBe(true);
    expect(history.communications.every((c) => c.eventDatetime <= now && c.eventDatetime >= new Date("2025-11-01"))).toBe(true);
    expect(buildDemoHistory({ plantCode: "demo-lis", now, months: 12 })).toEqual(history);
    expect(history.actions.every((a) => history.communications.some((c) => c.key === a.communicationKey))).toBe(true);
  });

  it("actions only exist for validated communications and closed ones have a close date", () => {
    const history = buildDemoHistory({ plantCode: "demo-opo", now, months: 12 });
    const byKey = new Map(history.communications.map((c) => [c.key, c]));
    for (const action of history.actions) {
      expect(byKey.get(action.communicationKey)?.validatedDaysAfter).not.toBeNull();
      expect(action.status === ActionStatus.CLOSED).toBe(action.closedAt !== null);
      if (action.closedAt) expect(action.closedAt <= now).toBe(true);
    }
  });
});
