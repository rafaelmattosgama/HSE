import { sendSystemEmail, SYSTEM_EMAIL_TYPES } from "./emailService.js";

function displayDateTime(value) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function displayUserName(utilizador) {
  return utilizador?.name ?? utilizador?.nome ?? utilizador?.userName ?? "User";
}

function displayUserEmail(utilizador, fallbackEmail) {
  return utilizador?.email ?? utilizador?.userEmail ?? fallbackEmail ?? "";
}

export async function sendCredentialsEmail({ to, utilizador, palavraPasse, linkAcesso }) {
  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.CREDENTIALS,
    to,
    data: {
      user_name: displayUserName(utilizador),
      user_email: displayUserEmail(utilizador, to),
      temporary_password: palavraPasse,
      login_url: linkAcesso,
    },
  });
}

export async function sendSewoAlertEmail({
  to,
  tipoAlerta,
  descricao,
  prioridade,
  dataHora,
  recipientName = "Safety Team",
  sewoCode = "-",
  plantName = "-",
  sewoStatus = "-",
  sewoUrl = "",
}) {
  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.SEWOALERT,
    to,
    data: {
      recipient_name: recipientName,
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

export async function sendNotificationEmail({
  to,
  tituloNotificacao,
  mensagem,
  dataHora,
  recipientName = "User",
  plantName = "-",
  actionUrl = "",
  attachments,
}) {
  return sendSystemEmail({
    type: SYSTEM_EMAIL_TYPES.NOTIFICATION,
    to,
    data: {
      recipient_name: recipientName,
      notification_title: tituloNotificacao,
      notification_message: mensagem,
      data_hora: displayDateTime(dataHora),
      plant_name: plantName,
      action_url: actionUrl,
    },
    attachments,
  });
}

export { SYSTEM_EMAIL_TYPES };
