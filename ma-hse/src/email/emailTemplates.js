import fs from "node:fs";
import path from "node:path";

const templateDirectory = path.join(process.cwd(), "src", "email", "templates");

function readTemplate(fileName) {
  return fs.readFileSync(path.join(templateDirectory, fileName), "utf8");
}

export const SYSTEM_EMAIL_TYPES = Object.freeze({
  CREDENTIALS: "CREDENTIALS",
  SEWOALERT: "SEWOALERT",
  NOTIFICATION: "NOTIFICATION",
});

export const emailTemplates = Object.freeze({
  [SYSTEM_EMAIL_TYPES.CREDENTIALS]: {
    subject: "MA HSE - Account credentials",
    htmlTemplate: readTemplate("credentials.html"),
    textTemplate: readTemplate("credentials.txt"),
  },
  [SYSTEM_EMAIL_TYPES.SEWOALERT]: {
    subject: "MA HSE - S-EWO alert {{sewo_code}}",
    htmlTemplate: readTemplate("sewoalert.html"),
    textTemplate: readTemplate("sewoalert.txt"),
  },
  [SYSTEM_EMAIL_TYPES.NOTIFICATION]: {
    subject: "MA HSE - {{notification_title}}",
    htmlTemplate: readTemplate("notification.html"),
    textTemplate: readTemplate("notification.txt"),
  },
});

export function getEmailTemplate(type) {
  const normalizedType = String(type || "").toUpperCase();
  const template = emailTemplates[normalizedType];

  if (!template) {
    throw new Error(`Unsupported system email type: ${normalizedType || "UNKNOWN"}`);
  }

  return template;
}
