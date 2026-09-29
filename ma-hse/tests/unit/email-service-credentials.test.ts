import { afterEach, describe, expect, it, vi } from "vitest";

const helperMock = vi.hoisted(() => ({
  sendCredentialsEmail: vi.fn(),
}));
const gatewayMock = vi.hoisted(() => ({
  sendViaSmtpGateway: vi.fn(),
}));

vi.mock("@/src/email/systemEmailHelpers.js", () => helperMock);
vi.mock("@/lib/services/smtp-gateway-client", () => gatewayMock);

import { EmailService } from "@/lib/services/email-service";

describe("EmailService credentials delivery", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the password reset template scenario for regenerated passwords", async () => {
    await EmailService.sendTemporaryPassword({
      to: "user@example.com",
      userName: "User",
      temporaryPassword: "temporary-password",
      loginUrl: "https://example.test/login",
      language: "fr",
      scenario: "reset",
    });

    expect(helperMock.sendCredentialsEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        palavraPasse: "temporary-password",
        linkAcesso: "https://example.test/login",
        scenario: "reset",
        user: expect.objectContaining({
          email: "user@example.com",
          language: "fr",
        }),
      }),
    );
  });

  it("routes generic messages and attachments through the gateway", async () => {
    const attachments = [{ filename: "report.pdf", content: Buffer.from("pdf"), contentType: "application/pdf" }];
    await EmailService.sendMail({
      to: "user@example.com",
      subject: "Report",
      html: "<p>Report</p>",
      attachments,
    });

    expect(gatewayMock.sendViaSmtpGateway).toHaveBeenCalledWith(expect.objectContaining({ attachments }));
  });
});
