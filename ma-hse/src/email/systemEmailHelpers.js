import { sendSystemEmail, SYSTEM_EMAIL_TYPES } from "./emailService.js";
import { DEFAULT_EMAIL_LANGUAGE, normalizeEmailLanguage } from "./emailTemplates.js";

/**
 * @typedef {Object} EmailUser
 * @property {string | null=} email
 * @property {string | null=} userEmail
 * @property {string | null=} name
 * @property {string | null=} nome
 * @property {string | null=} userName
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

const EVENT_COPY = {
  "pt-PT": {
    safetyReported: "Foi registada uma comunicacao de seguranca que requer analise.",
    actionAssigned: "Foi-lhe atribuida uma nova acao.",
    actionDueToday: "Esta acao vence hoje.",
    actionDueInDays: (days) => `Esta acao vence dentro de ${days} dias.`,
    documentationRequest: "Foi criado um pedido de documentacao.",
    documentationFollowup: "Por favor reveja o estado atual da documentacao.",
  },
  en: {
    safetyReported: "A safety communication was reported and requires review.",
    actionAssigned: "A new action was assigned to you.",
    actionDueToday: "This action is due today.",
    actionDueInDays: (days) => `This action is due in ${days} days.`,
    documentationRequest: "A documentation request was created.",
    documentationFollowup: "Please review the current documentation status.",
  },
  "en-EN": {
    safetyReported: "A safety communication was reported and requires review.",
    actionAssigned: "A new action was assigned to you.",
    actionDueToday: "This action is due today.",
    actionDueInDays: (days) => `This action is due in ${days} days.`,
    documentationRequest: "A documentation request was created.",
    documentationFollowup: "Please review the current documentation status.",
  },
  es: {
    safetyReported: "Se registro una comunicacion de seguridad que requiere revision.",
    actionAssigned: "Se le asigno una nueva accion.",
    actionDueToday: "Esta accion vence hoy.",
    actionDueInDays: (days) => `Esta accion vence en ${days} dias.`,
    documentationRequest: "Se creo una solicitud de documentacion.",
    documentationFollowup: "Revise el estado actual de la documentacion.",
  },
  fr: {
    safetyReported: "Une communication securite a ete signalee et doit etre revue.",
    actionAssigned: "Une nouvelle action vous a ete assignee.",
    actionDueToday: "Cette action arrive a echeance aujourd'hui.",
    actionDueInDays: (days) => `Cette action arrive a echeance dans ${days} jours.`,
    documentationRequest: "Une demande de documentation a ete creee.",
    documentationFollowup: "Veuillez verifier l'etat actuel de la documentation.",
  },
  it: {
    safetyReported: "E stata registrata una comunicazione di sicurezza da verificare.",
    actionAssigned: "Ti e stata assegnata una nuova azione.",
    actionDueToday: "Questa azione scade oggi.",
    actionDueInDays: (days) => `Questa azione scade tra ${days} giorni.`,
    documentationRequest: "E stata creata una richiesta di documentazione.",
    documentationFollowup: "Verifica lo stato attuale della documentazione.",
  },
};

function getEventCopy(language) {
  return EVENT_COPY[language] ?? EVENT_COPY[DEFAULT_EMAIL_LANGUAGE];
}

/**
 * @param {{ user?: EmailUser | null, utilizador?: EmailUser | null, to?: string | string[], language?: string | null, palavraPasse: string, linkAcesso: string, scenario?: "create" | "reset" }} input
 */
export async function sendCredentialsEmail(input) {
  const { user = null, utilizador = null, to = undefined, language = undefined, palavraPasse, linkAcesso, scenario = "create" } = input;
  const emailUser = user ?? utilizador;
  const recipient = resolveRecipient({ user: emailUser, to, language });

  return sendSystemEmail({
    type: scenario === "reset" ? SYSTEM_EMAIL_TYPES.PASSWORD_RESET : SYSTEM_EMAIL_TYPES.CREDENTIALS,
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
 * @param {{ user?: EmailUser | null, to?: string | string[], language?: string | null, communicationType: string, reporterName: string, description: string, plantName: string, occurredAt?: Date | string | null, communicationId?: string, actionUrl?: string }} input
 */
export async function sendSafetyCommunicationReportedEmail(input) {
  const recipient = resolveRecipient({ user: input.user ?? null, to: input.to, language: input.language });

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.SAFETY_COMMUNICATION_REPORTED,
    to: recipient.to,
    language: recipient.language,
    data: {
      recipient_name: displayUserName(input.user),
      event_title: input.communicationType,
      event_intro: getEventCopy(recipient.language).safetyReported,
      communication_type: input.communicationType,
      reporter_name: input.reporterName,
      description: input.description,
      plant_name: input.plantName,
      data_hora: displayDateTime(input.occurredAt),
      reference_code: input.communicationId ?? "-",
      action_url: input.actionUrl ?? "",
    },
  });
}

/**
 * @param {{ user?: EmailUser | null, to?: string | string[], language?: string | null, actionTitle: string, description?: string, dueDate?: Date | string | null, plantName?: string, actionUrl?: string }} input
 */
export async function sendActionAssignedEmail(input) {
  const recipient = resolveRecipient({ user: input.user ?? null, to: input.to, language: input.language });

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.ACTION_ASSIGNED,
    to: recipient.to,
    language: recipient.language,
    data: {
      recipient_name: displayUserName(input.user),
      event_title: input.actionTitle,
      event_intro: getEventCopy(recipient.language).actionAssigned,
      action_title: input.actionTitle,
      description: input.description ?? "-",
      plant_name: input.plantName ?? "-",
      data_hora: displayDateTime(input.dueDate),
      reference_code: input.actionTitle,
      action_url: input.actionUrl ?? "",
    },
  });
}

/**
 * @param {{ user?: EmailUser | null, to?: string | string[], language?: string | null, actionTitle: string, dueDate?: Date | string | null, daysUntilDue?: number, plantName?: string, actionUrl?: string }} input
 */
export async function sendActionDueSoonEmail(input) {
  const recipient = resolveRecipient({ user: input.user ?? null, to: input.to, language: input.language });
  const copy = getEventCopy(recipient.language);
  const whenText = input.daysUntilDue === 0
    ? copy.actionDueToday
    : copy.actionDueInDays(input.daysUntilDue ?? "-");

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.ACTION_DUE_SOON,
    to: recipient.to,
    language: recipient.language,
    data: {
      recipient_name: displayUserName(input.user),
      event_title: input.actionTitle,
      event_intro: whenText,
      action_title: input.actionTitle,
      description: whenText,
      plant_name: input.plantName ?? "-",
      data_hora: displayDateTime(input.dueDate),
      reference_code: input.actionTitle,
      action_url: input.actionUrl ?? "",
    },
  });
}

/**
 * @param {{ user?: EmailUser | null, to?: string | string[], language?: string | null, tipoAlerta: string, descricao: string, prioridade: string, dataHora?: Date | string | null, sewoCode?: string, plantName?: string, sewoStatus?: string, sewoUrl?: string }} input
 */
export async function sendSewoSubmittedForValidationEmail(input) {
  const recipient = resolveRecipient({ user: input.user ?? null, to: input.to, language: input.language });

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.SEWO_SUBMITTED_N1_VALIDATION,
    to: recipient.to,
    language: recipient.language,
    data: {
      recipient_name: displayUserName(input.user),
      tipo_alerta: input.tipoAlerta,
      descricao: input.descricao,
      prioridade: input.prioridade,
      data_hora: displayDateTime(input.dataHora),
      sewo_code: input.sewoCode ?? "-",
      plant_name: input.plantName ?? "-",
      sewo_status: input.sewoStatus ?? "Submitted",
      sewo_url: input.sewoUrl ?? "",
    },
  });
}

/**
 * @param {{ user?: EmailUser | null, to?: string | string[], language?: string | null, tipoAlerta: string, descricao: string, prioridade: string, dataHora?: Date | string | null, sewoCode?: string, plantName?: string, sewoStatus?: string, sewoUrl?: string }} input
 */
export async function sendSewoValidatedSubmitterEmail(input) {
  const recipient = resolveRecipient({ user: input.user ?? null, to: input.to, language: input.language });

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_SUBMITTER,
    to: recipient.to,
    language: recipient.language,
    data: {
      recipient_name: displayUserName(input.user),
      tipo_alerta: input.tipoAlerta,
      descricao: input.descricao,
      prioridade: input.prioridade,
      data_hora: displayDateTime(input.dataHora),
      sewo_code: input.sewoCode ?? "-",
      plant_name: input.plantName ?? "-",
      sewo_status: input.sewoStatus ?? "Approved",
      sewo_url: input.sewoUrl ?? "",
    },
  });
}

/**
 * @param {{ user?: EmailUser | null, to?: string | string[], language?: string | null, tipoAlerta: string, descricao: string, prioridade: string, dataHora?: Date | string | null, sewoCode?: string, plantName?: string, sewoStatus?: string, sewoUrl?: string, attachments?: EmailAttachment[] }} input
 */
export async function sendSewoValidatedDistributionEmail(input) {
  const recipient = resolveRecipient({ user: input.user ?? null, to: input.to, language: input.language });

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.SEWO_VALIDATED_DISTRIBUTION,
    to: recipient.to,
    language: recipient.language,
    data: {
      recipient_name: displayUserName(input.user),
      tipo_alerta: input.tipoAlerta,
      descricao: input.descricao,
      prioridade: input.prioridade,
      data_hora: displayDateTime(input.dataHora),
      sewo_code: input.sewoCode ?? "-",
      plant_name: input.plantName ?? "-",
      sewo_status: input.sewoStatus ?? "Approved",
      sewo_url: input.sewoUrl ?? "",
    },
    attachments: input.attachments,
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

/**
 * @param {{ to?: string | string[], user?: EmailUser | null, language?: string | null, plantName: string, mensagem: string, actionUrl?: string }} input
 */
export async function sendContractorInvitationEmail(input) {
  const recipient = resolveRecipient({ user: input.user ?? null, to: input.to, language: input.language });

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.CONTRACTOR_INVITATION,
    to: recipient.to,
    language: recipient.language,
    data: {
      recipient_name: displayUserName(input.user),
      event_title: "Documentation request",
      event_intro: `${getEventCopy(recipient.language).documentationRequest} ${input.mensagem}`,
      plant_name: input.plantName,
      data_hora: displayDateTime(new Date()),
      reference_code: input.plantName,
      action_url: input.actionUrl ?? "",
    },
  });
}

/**
 * @param {{ to?: string | string[], user?: EmailUser | null, language?: string | null, plantName: string, mensagem: string, actionUrl?: string }} input
 */
export async function sendContractorDocumentationFollowupEmail(input) {
  const recipient = resolveRecipient({ user: input.user ?? null, to: input.to, language: input.language });

  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.CONTRACTOR_DOCUMENTATION_FOLLOWUP,
    to: recipient.to,
    language: recipient.language,
    data: {
      recipient_name: displayUserName(input.user),
      event_title: "Documentation follow-up",
      event_intro: `${getEventCopy(recipient.language).documentationFollowup} ${input.mensagem}`,
      plant_name: input.plantName,
      data_hora: displayDateTime(new Date()),
      reference_code: input.plantName,
      action_url: input.actionUrl ?? "",
    },
  });
}

export { DEFAULT_EMAIL_LANGUAGE, SYSTEM_EMAIL_TYPES };
