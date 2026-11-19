import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn(), info: vi.fn() }));
vi.mock("node:https", () => ({ default: { request: mocks.request, Agent: vi.fn() } }));
vi.mock("@/lib/logger", () => ({ logger: { info: mocks.info, warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { DEMO_MODE: true, SMTP_GATEWAY_API_KEY: undefined, SMTP_GATEWAY_BASE_URL: "https://127.0.0.1:1", SMTP_FROM: "Demo <demo@maxsafety.demo>" },
}));

import { sendViaSmtpGateway } from "@/lib/services/smtp-gateway-client";

describe("sendViaSmtpGateway in demo mode", () => {
  it("never opens a connection and reports success", async () => {
    await expect(sendViaSmtpGateway({ to: "a@b.pt", subject: "Teste", text: "x" })).resolves.toEqual({ messageId: "demo-suppressed" });
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.info).toHaveBeenCalledWith(expect.objectContaining({ subject: "Teste" }), "demo_email_suppressed");
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain("a@b.pt");
  });
});
