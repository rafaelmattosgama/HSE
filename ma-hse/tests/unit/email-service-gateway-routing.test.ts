import { afterEach, describe, expect, it, vi } from "vitest";

const sendViaSmtpGatewayMock = vi.hoisted(() => vi.fn().mockResolvedValue({ messageId: "gateway-msg" }));
vi.mock("@/lib/services/smtp-gateway-client", () => ({
  sendViaSmtpGateway: sendViaSmtpGatewayMock,
}));

const { sendSystemEmail } = await import("@/src/email/emailService.js");
const { SYSTEM_EMAIL_TYPES } = await import("@/src/email/emailTemplates.js");

describe("emailService gateway routing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(Object.values(SYSTEM_EMAIL_TYPES))("routes %s through the HTTP gateway", async (type) => {
    await sendSystemEmail({
      type,
      to: "worker@example.com",
      language: "en",
      data: {
        user_name: "Worker",
        user_email: "worker@example.com",
        temporary_password: "secret",
        login_url: "https://example.test/login",
        recipient_name: "Worker",
        titulo_notificacao: "Title",
        mensagem: "Body",
        data_hora: "2026-06-03T10:00:00.000Z",
        plant_name: "Plant 1",
        action_url: "https://example.test/app/pl01/notifications",
        invitation_url: "https://example.test/invite",
        portal_url: "https://example.test/portal",
        communication_type: "Near miss",
        action_title: "Action",
        tipo_alerta: "Alert",
        sewo_code: "SEWO-1",
      },
    });

    expect(sendViaSmtpGatewayMock).toHaveBeenCalledTimes(1);
  });

  it("routes emails with attachments through the HTTP gateway", async () => {
    const attachments = [{ filename: "doc.pdf", content: Buffer.from("x"), contentType: "application/pdf" }];
    await sendSystemEmail({
      type: SYSTEM_EMAIL_TYPES.CONTRACTOR_INVITATION,
      to: "contractor@example.com",
      language: "en",
      data: { plant_name: "Plant 1", invitation_url: "https://example.test/invite" },
      attachments,
    });

    expect(sendViaSmtpGatewayMock).toHaveBeenCalledWith(expect.objectContaining({ attachments }));
  });
});
