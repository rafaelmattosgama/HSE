import { afterEach, describe, expect, it, vi } from "vitest";

const gatewayMock = vi.hoisted(() => ({
  sendViaSmtpGateway: vi.fn().mockResolvedValue({ messageId: "gateway-msg" }),
}));
vi.mock("@/lib/services/smtp-gateway-client", () => gatewayMock);

import { sendVerificationEmailViaGateway } from "@/lib/auth/verification-email";

describe("verification email", () => {
  afterEach(() => vi.clearAllMocks());

  it("sends the sign-in link through the gateway", async () => {
    await sendVerificationEmailViaGateway({
      identifier: "user@example.com",
      url: "https://example.test/api/auth/callback/email?token=one&email=user%40example.com",
    });

    expect(gatewayMock.sendViaSmtpGateway).toHaveBeenCalledWith(expect.objectContaining({
      to: "user@example.com",
      subject: "Sign in to example.test",
      html: expect.stringContaining("token=one&amp;email="),
    }));
  });
});
