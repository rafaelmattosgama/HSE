import fs from "node:fs";
import path from "node:path";

const templateDirectory = path.join(process.cwd(), "src", "email", "templates");

export const DEFAULT_EMAIL_LANGUAGE = "pt-PT";
export const SUPPORTED_EMAIL_LANGUAGES = Object.freeze(["pt-PT", "en", "es", "fr"]);

export const SYSTEM_EMAIL_TYPES = Object.freeze({
  CREDENTIALS: "CREDENTIALS",
  SEWOALERT: "SEWOALERT",
  NOTIFICATION: "NOTIFICATION",
});

const SUBJECTS = Object.freeze({
  "pt-PT": {
    [SYSTEM_EMAIL_TYPES.CREDENTIALS]: "Credenciais de acesso",
    [SYSTEM_EMAIL_TYPES.SEWOALERT]: "Alerta do Sistema - {{tipo_alerta}}",
    [SYSTEM_EMAIL_TYPES.NOTIFICATION]: "Notificacao - {{titulo_notificacao}}",
  },
  en: {
    [SYSTEM_EMAIL_TYPES.CREDENTIALS]: "Access credentials",
    [SYSTEM_EMAIL_TYPES.SEWOALERT]: "System Alert - {{tipo_alerta}}",
    [SYSTEM_EMAIL_TYPES.NOTIFICATION]: "Notification - {{titulo_notificacao}}",
  },
  es: {
    [SYSTEM_EMAIL_TYPES.CREDENTIALS]: "Credenciales de acceso",
    [SYSTEM_EMAIL_TYPES.SEWOALERT]: "Alerta del Sistema - {{tipo_alerta}}",
    [SYSTEM_EMAIL_TYPES.NOTIFICATION]: "Notificacion - {{titulo_notificacao}}",
  },
  fr: {
    [SYSTEM_EMAIL_TYPES.CREDENTIALS]: "Identifiants d'acces",
    [SYSTEM_EMAIL_TYPES.SEWOALERT]: "Alerte du Systeme - {{tipo_alerta}}",
    [SYSTEM_EMAIL_TYPES.NOTIFICATION]: "Notification - {{titulo_notificacao}}",
  },
});

const TEMPLATE_FILES = Object.freeze({
  [SYSTEM_EMAIL_TYPES.CREDENTIALS]: {
    htmlTemplate: "credentials.html",
    textTemplate: "credentials.txt",
  },
  [SYSTEM_EMAIL_TYPES.SEWOALERT]: {
    htmlTemplate: "sewoalert.html",
    textTemplate: "sewoalert.txt",
  },
  [SYSTEM_EMAIL_TYPES.NOTIFICATION]: {
    htmlTemplate: "notification.html",
    textTemplate: "notification.txt",
  },
});

function isSupportedEmailLanguage(language) {
  return SUPPORTED_EMAIL_LANGUAGES.includes(language);
}

export function normalizeEmailLanguage(language) {
  const normalized = String(language || "").trim();
  if (!normalized) return DEFAULT_EMAIL_LANGUAGE;
  if (normalized.toLowerCase() === "pt") return DEFAULT_EMAIL_LANGUAGE;
  if (normalized.toLowerCase() === "pt-pt") return DEFAULT_EMAIL_LANGUAGE;
  if (normalized.toLowerCase().startsWith("en")) return "en";
  if (normalized.toLowerCase().startsWith("es")) return "es";
  if (normalized.toLowerCase().startsWith("fr")) return "fr";
  return isSupportedEmailLanguage(normalized) ? normalized : DEFAULT_EMAIL_LANGUAGE;
}

function readTemplate(language, fileName) {
  const requestedPath = path.join(templateDirectory, language, fileName);
  if (fs.existsSync(requestedPath)) {
    return fs.readFileSync(requestedPath, "utf8");
  }

  const fallbackPath = path.join(templateDirectory, DEFAULT_EMAIL_LANGUAGE, fileName);
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath, "utf8");
  }

  throw new Error(`Missing email template: ${fileName}`);
}

function buildTemplate(language, type) {
  const templateFiles = TEMPLATE_FILES[type];
  if (!templateFiles) return null;

  const normalizedLanguage = normalizeEmailLanguage(language);
  const subject =
    SUBJECTS[normalizedLanguage]?.[type] ??
    SUBJECTS[DEFAULT_EMAIL_LANGUAGE]?.[type];

  if (!subject) return null;

  return {
    language: normalizedLanguage,
    subject,
    htmlTemplate: readTemplate(normalizedLanguage, templateFiles.htmlTemplate),
    textTemplate: readTemplate(normalizedLanguage, templateFiles.textTemplate),
  };
}

export const emailTemplates = Object.freeze(
  Object.fromEntries(
    SUPPORTED_EMAIL_LANGUAGES.map((language) => [
      language,
      Object.freeze(
        Object.fromEntries(
          Object.values(SYSTEM_EMAIL_TYPES).map((type) => [type, buildTemplate(language, type)]),
        ),
      ),
    ]),
  ),
);

export function getEmailTemplate(type, language = DEFAULT_EMAIL_LANGUAGE) {
  const normalizedType = String(type || "").toUpperCase();
  const normalizedLanguage = normalizeEmailLanguage(language);
  const template = emailTemplates[normalizedLanguage]?.[normalizedType]
    ?? emailTemplates[DEFAULT_EMAIL_LANGUAGE]?.[normalizedType];

  if (!template) {
    throw new Error(`Unsupported system email type: ${normalizedType || "UNKNOWN"}`);
  }

  return template;
}
