import { sendViaSmtpGateway } from "@/lib/services/smtp-gateway-client";
import { sendCredentialsEmail } from "@/src/email/systemEmailHelpers.js";

export const EmailService = {
  async sendMail(input: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }>;
  }) {
    await sendViaSmtpGateway({
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments,
    });
  },

  async sendTemporaryPassword(input: {
    to: string;
    userName: string;
    temporaryPassword: string;
    loginUrl: string;
    language?: string | null;
    scenario?: "create" | "reset";
  }) {
    await sendCredentialsEmail({
      to: input.to,
      user: {
        name: input.userName,
        email: input.to,
        language: input.language,
      },
      palavraPasse: input.temporaryPassword,
      linkAcesso: input.loginUrl,
      scenario: input.scenario ?? "create",
    });
  },
};
