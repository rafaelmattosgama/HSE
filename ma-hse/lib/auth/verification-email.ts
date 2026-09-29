import { sendViaSmtpGateway } from "@/lib/services/smtp-gateway-client";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendVerificationEmailViaGateway(input: {
  identifier: string;
  url: string;
}) {
  const host = new URL(input.url).host;

  await sendViaSmtpGateway({
    to: input.identifier,
    subject: `Sign in to ${host}`,
    text: `Sign in to ${host}\n${input.url}\n`,
    html: [
      "<body>",
      `<p>Sign in to <strong>${escapeHtml(host)}</strong></p>`,
      `<p><a href="${escapeHtml(input.url)}">Sign in</a></p>`,
      "</body>",
    ].join(""),
  });
}
