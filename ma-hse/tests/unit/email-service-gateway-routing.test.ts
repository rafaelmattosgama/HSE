import { afterEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const createTransportMock = vi.hoisted(() => vi.fn(() => ({ sendMail: sendMailMock })));
vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

const sendViaSmtpGatewayMock = vi.hoisted(() => vi.fn().mockResolvedValue({ messageId: "gateway-msg" }));
vi.mock("@/lib/services/smtp-gateway-client", () => ({
  sendViaSmtpGateway: sendViaSmtpGatewayMock,
}));

const { sendSystemEmail } = await import("@/src/email/emailService.js");
const { SYSTEM_EMAIL_TYPES } = await import("@/src/email/emailTemplates.js");

describe("emailService staged gateway rollout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("routes a pilot type (contractor invitation) through the HTTP gateway", async () => {
    await sendSystemEmail({
      type: SYSTEM_EMAIL_TYPES.CONTRACTOR_INVITATION,
      to: "contractor@example.com",
      language: "en",
      data: { plant_name: "Plant 1", invitation_url: "https://example.test/invite" },
    });

    expect(sendViaSmtpGatewayMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("keeps a non-pilot type (credentials) on direct SMTP", async () => {
    await sendSystemEmail({
      type: SYSTEM_EMAIL_TYPES.CREDENTIALS,
      to: "user@example.com",
      language: "en",
      data: {
        user_name: "User",
        user_email: "user@example.com",
        temporary_password: "secret",
        login_url: "https://example.test/login",
      },
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendViaSmtpGatewayMock).not.toHaveBeenCalled();
  });

  it("keeps a non-pilot type (notification) on direct SMTP", async () => {
    await sendSystemEmail({
      type: SYSTEM_EMAIL_TYPES.NOTIFICATION,
      to: "worker@example.com",
      language: "en",
      data: {
        recipient_name: "Worker",
        titulo_notificacao: "Title",
        mensagem: "Body",
        data_hora: "2026-06-03T10:00:00.000Z",
        plant_name: "Plant 1",
        action_url: "https://example.test/app/pl01/notifications",
      },
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendViaSmtpGatewayMock).not.toHaveBeenCalled();
  });

  it("keeps a pilot-type email with attachments on direct SMTP (gateway attachments not staged yet)", async () => {
    await sendSystemEmail({
      type: SYSTEM_EMAIL_TYPES.CONTRACTOR_INVITATION,
      to: "contractor@example.com",
      language: "en",
      data: { plant_name: "Plant 1", invitation_url: "https://example.test/invite" },
      attachments: [{ filename: "doc.pdf", content: Buffer.from("x"), contentType: "application/pdf" }],
    });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendViaSmtpGatewayMock).not.toHaveBeenCalled();
  });
});
