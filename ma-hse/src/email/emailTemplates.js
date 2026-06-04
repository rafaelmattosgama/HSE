import fs from "node:fs";
import path from "node:path";

const templateDirectory = path.join(process.cwd(), "src", "email", "templates");

export const DEFAULT_EMAIL_LANGUAGE = "en-EN";
export const SUPPORTED_EMAIL_LANGUAGES = Object.freeze(["pt-PT", "en", "es", "fr", "it"]);

export const SYSTEM_EMAIL_TYPES = Object.freeze({
  CREDENTIALS: "CREDENTIALS",
  PASSWORD_RESET: "PASSWORD_RESET",
  SEWOALERT: "SEWOALERT",
  NOTIFICATION: "NOTIFICATION",
  SAFETY_COMMUNICATION_REPORTED: "SAFETY_COMMUNICATION_REPORTED",
  ACTION_ASSIGNED: "ACTION_ASSIGNED",
  ACTION_DUE_SOON: "ACTION_DUE_SOON",
  SEWO_SUBMITTED_N1_VALIDATION: "SEWO_SUBMITTED_N1_VALIDATION",
  SEWO_VALIDATED_SUBMITTER: "SEWO_VALIDATED_SUBMITTER",
  SEWO_VALIDATED_DISTRIBUTION: "SEWO_VALIDATED_DISTRIBUTION",
  CONTRACTOR_INVITATION: "CONTRACTOR_INVITATION",
  CONTRACTOR_DOCUMENTATION_FOLLOWUP: "CONTRACTOR_DOCUMENTATION_FOLLOWUP",
});

const SUBJECTS = Object.freeze({
  "pt-PT": {
    [SYSTEM_EMAIL_TYPES.CREDENTIALS]: "Credenciais de acesso",
    [SYSTEM_EMAIL_TYPES.PASSWORD_RESET]: "Nova palavra-passe de acesso",
    [SYSTEM_EMAIL_TYPES.SEWOALERT]: "Alerta do Sistema - {{tipo_alerta}}",
    [SYSTEM_EMAIL_TYPES.NOTIFICATION]: "Notificacao - {{titulo_notificacao}}",
    [SYSTEM_EMAIL_TYPES.SAFETY_COMMUNICATION_REPORTED]: "Comunicacao de seguranca - {{communication_type}}",
    [SYSTEM_EMAIL_TYPES.ACTION_ASSIGNED]: "Nova acao atribuida - {{action_title}}",
    [SYSTEM_EMAIL_TYPES.ACTION_DUE_SOON]: "Prazo de acao proximo - {{action_title}}",
    [SYSTEM_EMAIL_TYPES.SEWO_SUBMITTED_N1_VALIDATION]: "S-EWO para validacao N1 - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_SUBMITTER]: "S-EWO validado - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_DISTRIBUTION]: "S-EWO validado - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.CONTRACTOR_INVITATION]: "Pedido de documentacao - {{plant_name}}",
    [SYSTEM_EMAIL_TYPES.CONTRACTOR_DOCUMENTATION_FOLLOWUP]: "Seguimento de documentacao - {{plant_name}}",
  },
  en: {
    [SYSTEM_EMAIL_TYPES.CREDENTIALS]: "Access credentials",
    [SYSTEM_EMAIL_TYPES.PASSWORD_RESET]: "New access password",
    [SYSTEM_EMAIL_TYPES.SEWOALERT]: "System Alert - {{tipo_alerta}}",
    [SYSTEM_EMAIL_TYPES.NOTIFICATION]: "Notification - {{titulo_notificacao}}",
    [SYSTEM_EMAIL_TYPES.SAFETY_COMMUNICATION_REPORTED]: "Safety communication - {{communication_type}}",
    [SYSTEM_EMAIL_TYPES.ACTION_ASSIGNED]: "New assigned action - {{action_title}}",
    [SYSTEM_EMAIL_TYPES.ACTION_DUE_SOON]: "Action deadline reminder - {{action_title}}",
    [SYSTEM_EMAIL_TYPES.SEWO_SUBMITTED_N1_VALIDATION]: "S-EWO pending N1 validation - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_SUBMITTER]: "S-EWO validated - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_DISTRIBUTION]: "S-EWO validated - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.CONTRACTOR_INVITATION]: "Documentation request - {{plant_name}}",
    [SYSTEM_EMAIL_TYPES.CONTRACTOR_DOCUMENTATION_FOLLOWUP]: "Documentation follow-up - {{plant_name}}",
  },
  es: {
    [SYSTEM_EMAIL_TYPES.CREDENTIALS]: "Credenciales de acceso",
    [SYSTEM_EMAIL_TYPES.PASSWORD_RESET]: "Nueva contrasena de acceso",
    [SYSTEM_EMAIL_TYPES.SEWOALERT]: "Alerta del Sistema - {{tipo_alerta}}",
    [SYSTEM_EMAIL_TYPES.NOTIFICATION]: "Notificacion - {{titulo_notificacao}}",
    [SYSTEM_EMAIL_TYPES.SAFETY_COMMUNICATION_REPORTED]: "Comunicacion de seguridad - {{communication_type}}",
    [SYSTEM_EMAIL_TYPES.ACTION_ASSIGNED]: "Nueva accion asignada - {{action_title}}",
    [SYSTEM_EMAIL_TYPES.ACTION_DUE_SOON]: "Recordatorio de plazo de accion - {{action_title}}",
    [SYSTEM_EMAIL_TYPES.SEWO_SUBMITTED_N1_VALIDATION]: "S-EWO pendiente de validacion N1 - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_SUBMITTER]: "S-EWO validado - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_DISTRIBUTION]: "S-EWO validado - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.CONTRACTOR_INVITATION]: "Solicitud de documentacion - {{plant_name}}",
    [SYSTEM_EMAIL_TYPES.CONTRACTOR_DOCUMENTATION_FOLLOWUP]: "Seguimiento de documentacion - {{plant_name}}",
  },
  fr: {
    [SYSTEM_EMAIL_TYPES.CREDENTIALS]: "Identifiants d'acces",
    [SYSTEM_EMAIL_TYPES.PASSWORD_RESET]: "Nouveau mot de passe d'acces",
    [SYSTEM_EMAIL_TYPES.SEWOALERT]: "Alerte du Systeme - {{tipo_alerta}}",
    [SYSTEM_EMAIL_TYPES.NOTIFICATION]: "Notification - {{titulo_notificacao}}",
    [SYSTEM_EMAIL_TYPES.SAFETY_COMMUNICATION_REPORTED]: "Communication securite - {{communication_type}}",
    [SYSTEM_EMAIL_TYPES.ACTION_ASSIGNED]: "Nouvelle action assignee - {{action_title}}",
    [SYSTEM_EMAIL_TYPES.ACTION_DUE_SOON]: "Rappel d'echeance d'action - {{action_title}}",
    [SYSTEM_EMAIL_TYPES.SEWO_SUBMITTED_N1_VALIDATION]: "S-EWO en attente de validation N1 - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_SUBMITTER]: "S-EWO valide - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_DISTRIBUTION]: "S-EWO valide - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.CONTRACTOR_INVITATION]: "Demande de documentation - {{plant_name}}",
    [SYSTEM_EMAIL_TYPES.CONTRACTOR_DOCUMENTATION_FOLLOWUP]: "Suivi de documentation - {{plant_name}}",
  },
  it: {
    [SYSTEM_EMAIL_TYPES.CREDENTIALS]: "Credenziali di accesso",
    [SYSTEM_EMAIL_TYPES.PASSWORD_RESET]: "Nuova password di accesso",
    [SYSTEM_EMAIL_TYPES.SEWOALERT]: "Allarme di Sistema - {{tipo_alerta}}",
    [SYSTEM_EMAIL_TYPES.NOTIFICATION]: "Notifica - {{titulo_notificacao}}",
    [SYSTEM_EMAIL_TYPES.SAFETY_COMMUNICATION_REPORTED]: "Comunicazione di sicurezza - {{communication_type}}",
    [SYSTEM_EMAIL_TYPES.ACTION_ASSIGNED]: "Nuova azione assegnata - {{action_title}}",
    [SYSTEM_EMAIL_TYPES.ACTION_DUE_SOON]: "Promemoria scadenza azione - {{action_title}}",
    [SYSTEM_EMAIL_TYPES.SEWO_SUBMITTED_N1_VALIDATION]: "S-EWO in attesa di validazione N1 - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_SUBMITTER]: "S-EWO validato - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_DISTRIBUTION]: "S-EWO validato - {{sewo_code}}",
    [SYSTEM_EMAIL_TYPES.CONTRACTOR_INVITATION]: "Richiesta documentazione - {{plant_name}}",
    [SYSTEM_EMAIL_TYPES.CONTRACTOR_DOCUMENTATION_FOLLOWUP]: "Follow-up documentazione - {{plant_name}}",
  },
});

const TEMPLATE_FILES = Object.freeze({
  [SYSTEM_EMAIL_TYPES.CREDENTIALS]: {
    htmlTemplate: "credentials.html",
    textTemplate: "credentials.txt",
  },
  [SYSTEM_EMAIL_TYPES.PASSWORD_RESET]: {
    htmlTemplate: "password-reset.html",
    textTemplate: "password-reset.txt",
  },
  [SYSTEM_EMAIL_TYPES.SEWOALERT]: {
    htmlTemplate: "sewoalert.html",
    textTemplate: "sewoalert.txt",
  },
  [SYSTEM_EMAIL_TYPES.NOTIFICATION]: {
    htmlTemplate: "notification.html",
    textTemplate: "notification.txt",
  },
  [SYSTEM_EMAIL_TYPES.SAFETY_COMMUNICATION_REPORTED]: {
    htmlTemplate: "event.html",
    textTemplate: "event.txt",
  },
  [SYSTEM_EMAIL_TYPES.ACTION_ASSIGNED]: {
    htmlTemplate: "event.html",
    textTemplate: "event.txt",
  },
  [SYSTEM_EMAIL_TYPES.ACTION_DUE_SOON]: {
    htmlTemplate: "event.html",
    textTemplate: "event.txt",
  },
  [SYSTEM_EMAIL_TYPES.SEWO_SUBMITTED_N1_VALIDATION]: {
    htmlTemplate: "sewoalert.html",
    textTemplate: "sewoalert.txt",
  },
  [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_SUBMITTER]: {
    htmlTemplate: "sewoalert.html",
    textTemplate: "sewoalert.txt",
  },
  [SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_DISTRIBUTION]: {
    htmlTemplate: "sewoalert.html",
    textTemplate: "sewoalert.txt",
  },
  [SYSTEM_EMAIL_TYPES.CONTRACTOR_INVITATION]: {
    htmlTemplate: "event.html",
    textTemplate: "event.txt",
  },
  [SYSTEM_EMAIL_TYPES.CONTRACTOR_DOCUMENTATION_FOLLOWUP]: {
    htmlTemplate: "event.html",
    textTemplate: "event.txt",
  },
});

function isSupportedEmailLanguage(language) {
  return SUPPORTED_EMAIL_LANGUAGES.includes(language);
}

function templateLanguage(language) {
  return language === DEFAULT_EMAIL_LANGUAGE ? "en" : language;
}

export function normalizeEmailLanguage(language) {
  const normalized = String(language || "").trim();
  if (!normalized) return DEFAULT_EMAIL_LANGUAGE;
  if (normalized.toLowerCase() === "pt") return "pt-PT";
  if (normalized.toLowerCase() === "pt-pt") return "pt-PT";
  if (normalized.toLowerCase() === "en-en") return DEFAULT_EMAIL_LANGUAGE;
  if (normalized.toLowerCase().startsWith("en")) return "en";
  if (normalized.toLowerCase().startsWith("es")) return "es";
  if (normalized.toLowerCase().startsWith("fr")) return "fr";
  if (normalized.toLowerCase().startsWith("it")) return "it";
  return isSupportedEmailLanguage(normalized) ? normalized : DEFAULT_EMAIL_LANGUAGE;
}

function readTemplate(language, fileName) {
  const requestedPath = path.join(templateDirectory, templateLanguage(language), fileName);
  if (fs.existsSync(requestedPath)) {
    return fs.readFileSync(requestedPath, "utf8");
  }

  const fallbackPath = path.join(templateDirectory, templateLanguage(DEFAULT_EMAIL_LANGUAGE), fileName);
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath, "utf8");
  }

  throw new Error(`Missing email template: ${fileName}`);
}

function buildTemplate(language, type) {
  const templateFiles = TEMPLATE_FILES[type];
  if (!templateFiles) return null;

  const normalizedLanguage = normalizeEmailLanguage(language);
  const subjectLanguage = templateLanguage(normalizedLanguage);
  const subject =
    SUBJECTS[subjectLanguage]?.[type] ??
    SUBJECTS[templateLanguage(DEFAULT_EMAIL_LANGUAGE)]?.[type];

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
    [...SUPPORTED_EMAIL_LANGUAGES, DEFAULT_EMAIL_LANGUAGE].map((language) => [
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
