import nodemailer from "nodemailer";
import { env } from "../../lib/env";
import { logger } from "../../lib/logger";
import { hashSensitiveValue } from "../../lib/security";
import { getEmailTemplate, SYSTEM_EMAIL_TYPES } from "./emailTemplates.js";
import { renderTemplate } from "./emailRenderer.js";

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

function normalizeRecipients(to) {
  return Array.isArray(to) ? to : [to];
}

function hashRecipients(to) {
  return normalizeRecipients(to)
    .filter(Boolean)
    .map((recipient) => hashSensitiveValue(String(recipient).trim().toLowerCase()));
}

export async function sendSystemEmail({ type, to, data = {}, attachments }) {
  const template = getEmailTemplate(type);
  const subject = renderTemplate(template.subject, data);
  const html = renderTemplate(template.htmlTemplate, data);
  const text = renderTemplate(template.textTemplate, data);

  try {
    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html,
      text,
      attachments,
    });

    logger.info(
      {
        type,
        recipients: hashRecipients(to),
      },
      "system_email_sent",
    );
  } catch (error) {
    const deliveryError = error && typeof error === "object" ? error : {};
    logger.error(
      {
        type,
        recipients: hashRecipients(to),
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode: deliveryError.code,
        responseCode: deliveryError.responseCode,
        command: deliveryError.command,
      },
      "system_email_send_failed",
    );
    throw error;
  }
}

export const systemEmailExamples = Object.freeze({
  credentials: {
    type: SYSTEM_EMAIL_TYPES.CREDENTIALS,
    to: "user@example.com",
    data: {
      user_name: "Example User",
      user_email: "user@example.com",
      temporary_password: "{{temporary_password}}",
      login_url: "https://example.com/login",
    },
  },
  sewoAlert: {
    type: SYSTEM_EMAIL_TYPES.SEWOALERT,
    to: ["safety@example.com"],
    data: {
      recipient_name: "Safety Team",
      sewo_code: "SEWO-0001",
      plant_name: "Example Plant",
      sewo_status: "Pending approval",
      sewo_summary: "Example S-EWO summary.",
      sewo_url: "https://example.com/app/pl01/sewo/SEWO-0001",
    },
  },
  notification: {
    type: SYSTEM_EMAIL_TYPES.NOTIFICATION,
    to: "operator@example.com",
    data: {
      recipient_name: "Example Recipient",
      notification_title: "New safety notification",
      notification_message: "A new item requires your attention.",
      plant_name: "Example Plant",
      action_url: "https://example.com/app/pl01/notifications",
    },
  },
});

export { SYSTEM_EMAIL_TYPES };

/*
Example calls:

await sendSystemEmail({
  type: SYSTEM_EMAIL_TYPES.CREDENTIALS,
  to: "user@example.com",
  data: {
    user_name: "Example User",
    user_email: "user@example.com",
    temporary_password: "<temporary_password_from_secure_flow>",
    login_url: "https://example.com/login",
  },
});

await sendSystemEmail({
  type: SYSTEM_EMAIL_TYPES.SEWOALERT,
  to: ["safety@example.com"],
  data: {
    recipient_name: "Safety Team",
    sewo_code: "SEWO-0001",
    plant_name: "Example Plant",
    sewo_status: "Pending approval",
    sewo_summary: "Example S-EWO summary.",
    sewo_url: "https://example.com/app/pl01/sewo/SEWO-0001",
  },
});

await sendSystemEmail({
  type: SYSTEM_EMAIL_TYPES.NOTIFICATION,
  to: "operator@example.com",
  data: {
    recipient_name: "Example Recipient",
    notification_title: "New safety notification",
    notification_message: "A new item requires your attention.",
    plant_name: "Example Plant",
    action_url: "https://example.com/app/pl01/notifications",
  },
});
*/
