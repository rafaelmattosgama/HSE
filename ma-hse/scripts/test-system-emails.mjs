import {
  sendCredentialsEmail,
  sendNotificationEmail,
  sendSewoAlertEmail,
} from "../src/email/systemEmailHelpers.js";

const to = process.env.TEST_EMAIL_TO;

if (!to) {
  console.error("Set TEST_EMAIL_TO before running this script.");
  process.exit(1);
}

const now = new Date();

await sendCredentialsEmail({
  user: {
    name: "Email Test User",
    email: to,
    language: "pt-PT",
  },
  palavraPasse: "<temporary_password_from_secure_flow>",
  linkAcesso: process.env.APP_URL ? `${process.env.APP_URL}/login` : "http://localhost:3000/login",
});

await sendSewoAlertEmail({
  user: {
    name: "Email Test Recipient",
    email: to,
    language: "en",
  },
  tipoAlerta: "S-EWO pending N1 approval",
  descricao: "Manual test S-EWO alert.",
  prioridade: "Normal",
  dataHora: now,
  sewoCode: "SEWO-TEST",
  plantName: "Test Plant",
  sewoStatus: "Submitted",
  sewoUrl: process.env.APP_URL ? `${process.env.APP_URL}/app/pl01/sewo?sewoId=SEWO-TEST` : "http://localhost:3000/app/pl01/sewo?sewoId=SEWO-TEST",
});

await sendNotificationEmail({
  user: {
    name: "Email Test Recipient",
    email: to,
  },
  tituloNotificacao: "Manual operational notification test",
  mensagem: "This is a manual test for the system notification template.",
  dataHora: now,
  plantName: "Test Plant",
  actionUrl: process.env.APP_URL ? `${process.env.APP_URL}/app/pl01/notifications` : "http://localhost:3000/app/pl01/notifications",
});

await sendNotificationEmail({
  user: {
    name: "Unsupported Language Recipient",
    email: to,
    language: "de",
  },
  tituloNotificacao: "Fallback language test",
  mensagem: "This message should use the pt-PT fallback template.",
  dataHora: now,
  plantName: "Test Plant",
  actionUrl: process.env.APP_URL ? `${process.env.APP_URL}/app/pl01/notifications` : "http://localhost:3000/app/pl01/notifications",
});

console.log("System email test messages submitted.");
