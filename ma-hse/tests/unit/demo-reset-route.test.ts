import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reset: vi.fn(), session: vi.fn(), demo: { value: false } }));
vi.mock("@/lib/demo-reset", () => ({ resetDemoData: mocks.reset }));
vi.mock("@/lib/demo-mode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/demo-mode")>()),
  isDemoMode: () => mocks.demo.value,
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth/options", () => ({ authOptions: {} }));

import { POST } from "@/app/api/demo/reset/route";

describe("POST /api/demo/reset", () => {
  beforeEach(() => {
    mocks.reset.mockReset();
    mocks.session.mockReset();
  });

  it("does not exist outside demo mode", async () => {
    mocks.demo.value = false;
    expect((await POST()).status).toBe(404);
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it("requires a demo account session", async () => {
    mocks.demo.value = true;
    mocks.session.mockResolvedValue({ user: { email: "someone@else.pt" } });
    expect((await POST()).status).toBe(403);
    mocks.session.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
    expect(mocks.reset).not.toHaveBeenCalled();
  });

  it("resets for a demo account", async () => {
    mocks.demo.value = true;
    mocks.session.mockResolvedValue({ user: { email: "demo.admin@maxsafety.demo" } });
    mocks.reset.mockResolvedValue({ durationMs: 1200 });
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { durationMs: 1200 } });
  });

  it("reports a failed reset without leaking details", async () => {
    mocks.demo.value = true;
    mocks.session.mockResolvedValue({ user: { email: "demo.admin@maxsafety.demo" } });
    mocks.reset.mockRejectedValue(new Error("connection refused at 127.0.0.1:5434"));
    const response = await POST();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.errorCode).toBe("DEMO_RESET_FAILED");
    expect(JSON.stringify(body)).not.toContain("5434");
  });
});
