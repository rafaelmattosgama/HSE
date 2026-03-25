import nodemailer from "nodemailer";
import { env } from "@/lib/env";

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
  async sendMail(input: { to: string | string[]; subject: string; html: string; text?: string }) {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  },

  async sendTemporaryPassword(input: {
    to: string;
    userName: string;
    temporaryPassword: string;
    loginUrl: string;
  }) {
    const html = `
      <p>Hello ${input.userName},</p>
      <p>Your MA HSE account is ready.</p>
      <p><strong>Temporary password:</strong> ${input.temporaryPassword}</p>
      <p>Login at <a href="${input.loginUrl}">${input.loginUrl}</a> and change your password immediately.</p>
      <p>If you did not expect this access, contact your EHS administrator.</p>
    `;

    const text = [
      `Hello ${input.userName},`,
      "",
      "Your MA HSE account is ready.",
      `Temporary password: ${input.temporaryPassword}`,
      `Login: ${input.loginUrl}`,
      "After login, change your password immediately.",
      "",
      "If you did not expect this access, contact your EHS administrator.",
    ].join("\n");

    await this.sendMail({
      to: input.to,
      subject: "MA HSE - Temporary password",
      html,
      text,
    });
  },
};
