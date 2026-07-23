import { beforeEach, describe, expect, it, vi } from "vitest";

const redisMock = vi.hoisted(() => {
  const instances: FakeRedis[] = [];
  let connectFailures = 0;

  class FakeRedis {
    status = "wait";
    connect = vi.fn(async () => {
      if (connectFailures > 0) {
        connectFailures -= 1;
        throw new Error("Redis unavailable");
      }

      this.status = "ready";
    });
    disconnect = vi.fn(() => {
      this.status = "end";
    });
    ping = vi.fn(async () => "PONG");
    on = vi.fn(() => this);

    constructor() {
      instances.push(this);
    }
  }

  return {
    FakeRedis,
    instances,
    failNextConnections(count: number) {
      connectFailures = count;
    },
    reset() {
      instances.length = 0;
      connectFailures = 0;
    },
  };
});

vi.mock("ioredis", () => ({
  default: redisMock.FakeRedis,
}));

describe("Redis readiness recovery", () => {
  beforeEach(() => {
    redisMock.reset();
    vi.resetModules();
  });

  it("creates a fresh client after a transient connection failure", async () => {
    redisMock.failNextConnections(1);
    const { pingRedis } = await import("@/lib/rate-limit");

    await expect(pingRedis()).resolves.toBe(false);
    await expect(pingRedis()).resolves.toBe(true);

    expect(redisMock.instances).toHaveLength(2);
    expect(redisMock.instances[0]?.disconnect).toHaveBeenCalledOnce();
    expect(redisMock.instances[1]?.ping).toHaveBeenCalledOnce();
  });

  it("shares one initial connection attempt across concurrent callers", async () => {
    const { pingRedis } = await import("@/lib/rate-limit");

    await expect(Promise.all([pingRedis(), pingRedis()])).resolves.toEqual([true, true]);

    expect(redisMock.instances).toHaveLength(1);
    expect(redisMock.instances[0]?.connect).toHaveBeenCalledOnce();
    expect(redisMock.instances[0]?.ping).toHaveBeenCalledTimes(2);
  });
});
