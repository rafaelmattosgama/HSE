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
  to,
  utilizador: {
    name: "Email Test User",
    email: to,
  },
  palavraPasse: "<temporary_password_from_secure_flow>",
  linkAcesso: process.env.APP_URL ? `${process.env.APP_URL}/login` : "http://localhost:3000/login",
});

await sendSewoAlertEmail({
  to,
  tipoAlerta: "S-EWO pending N1 approval",
  descricao: "Manual test S-EWO alert.",
  prioridade: "Normal",
  dataHora: now,
  recipientName: "Email Test Recipient",
  sewoCode: "SEWO-TEST",
  plantName: "Test Plant",
  sewoStatus: "Submitted",
  sewoUrl: process.env.APP_URL ? `${process.env.APP_URL}/app/pl01/sewo?sewoId=SEWO-TEST` : "http://localhost:3000/app/pl01/sewo?sewoId=SEWO-TEST",
});

await sendNotificationEmail({
  to,
  tituloNotificacao: "Manual operational notification test",
  mensagem: "This is a manual test for the system notification template.",
  dataHora: now,
  recipientName: "Email Test Recipient",
  plantName: "Test Plant",
  actionUrl: process.env.APP_URL ? `${process.env.APP_URL}/app/pl01/notifications` : "http://localhost:3000/app/pl01/notifications",
});

console.log("System email test messages submitted.");
