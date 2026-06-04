import nodemailer from "nodemailer";
import { env } from "@/lib/env";
import { sendCredentialsEmail } from "@/src/email/systemEmailHelpers.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  auth: env.SMTP_USER
    ? {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      }
    : undefined,
});

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
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
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
