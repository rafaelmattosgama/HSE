import { sendSystemEmail, SYSTEM_EMAIL_TYPES } from "./emailService.js";
import { DEFAULT_EMAIL_LANGUAGE, normalizeEmailLanguage } from "./emailTemplates.js";

/**
 * @typedef {Object} EmailUser
 * @property {string=} email
 * @property {string=} userEmail
 * @property {string=} name
 * @property {string=} nome
 * @property {string=} userName
 * @property {string | null=} language
 * @property {string | null=} locale
 * @property {string | null=} preferredLanguage
 * @property {{ language?: string | null }=} settings
 */

/**
 * @typedef {Object} EmailAttachment
 * @property {string} filename
 * @property {Buffer} content
 * @property {string} contentType
 */

function displayDateTime(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function displayUserName(user) {
  return user?.name ?? user?.nome ?? user?.userName ?? "User";
}

function displayUserEmail(user, fallbackEmail) {
  return user?.email ?? user?.userEmail ?? fallbackEmail ?? "";
}

function displayUserLanguage(user, fallbackLanguage) {
  return normalizeEmailLanguage(
    user?.language ??
    user?.locale ??
    user?.preferredLanguage ??
    user?.settings?.language ??
    fallbackLanguage ??
    DEFAULT_EMAIL_LANGUAGE,
  );
}

function resolveRecipient(input) {
  return {
    to: input.user?.email ?? input.to,
    language: displayUserLanguage(input.user, input.language),
  };
}

/**
 * @param {{ user?: EmailUser | null, utilizador?: EmailUser | null, to?: string | string[], language?: string | null, palavraPasse: string, linkAcesso: string }} input
 */
export async function sendCredentialsEmail(input) {
  const { user = null, utilizador = null, to = undefined, language = undefined, palavraPasse, linkAcesso } = input;
  const emailUser = user ?? utilizador;
  const recipient = resolveRecipient({ user: emailUser, to, language });

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.CREDENTIALS,
    to: recipient.to,
    language: recipient.language,
    data: {
      user_name: displayUserName(emailUser),
      user_email: displayUserEmail(emailUser, recipient.to),
      temporary_password: palavraPasse,
      login_url: linkAcesso,
    },
  });
}

/**
 * @param {{ user?: EmailUser | null, to?: string | string[], language?: string | null, tipoAlerta: string, descricao: string, prioridade: string, dataHora?: Date | string | null, recipientName?: string, sewoCode?: string, plantName?: string, sewoStatus?: string, sewoUrl?: string }} input
 */
export async function sendSewoAlertEmail(input) {
  const {
    user = null,
    to = undefined,
    language = undefined,
    tipoAlerta,
    descricao,
    prioridade,
    dataHora,
    recipientName = undefined,
    sewoCode = "-",
    plantName = "-",
    sewoStatus = "-",
    sewoUrl = "",
  } = input;
  const recipient = resolveRecipient({ user, to, language });

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.SEWOALERT,
    to: recipient.to,
    language: recipient.language,
    data: {
      recipient_name: recipientName ?? displayUserName(user),
      tipo_alerta: tipoAlerta,
      descricao,
      prioridade,
      data_hora: displayDateTime(dataHora),
      sewo_code: sewoCode,
      plant_name: plantName,
      sewo_status: sewoStatus,
      sewo_url: sewoUrl,
    },
  });
}

/**
 * @param {{ user?: EmailUser | null, to?: string | string[], language?: string | null, tituloNotificacao: string, mensagem: string, dataHora?: Date | string | null, recipientName?: string, plantName?: string, actionUrl?: string, attachments?: EmailAttachment[] }} input
 */
export async function sendNotificationEmail(input) {
  const {
    user = null,
    to = undefined,
    language = undefined,
    tituloNotificacao,
    mensagem,
    dataHora,
    recipientName = undefined,
    plantName = "-",
    actionUrl = "",
    attachments = undefined,
  } = input;
  const recipient = resolveRecipient({ user, to, language });

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.NOTIFICATION,
    to: recipient.to,
    language: recipient.language,
    data: {
      recipient_name: recipientName ?? displayUserName(user),
      titulo_notificacao: tituloNotificacao,
      mensagem,
      data_hora: displayDateTime(dataHora),
      plant_name: plantName,
      action_url: actionUrl,
    },
    attachments,
  });
}

export { DEFAULT_EMAIL_LANGUAGE, SYSTEM_EMAIL_TYPES };
