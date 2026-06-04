import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/src/email/emailRenderer.js";
import {
  DEFAULT_EMAIL_LANGUAGE,
  SUPPORTED_EMAIL_LANGUAGES,
  emailTemplates,
  getEmailTemplate,
  normalizeEmailLanguage,
  SYSTEM_EMAIL_TYPES,
} from "@/src/email/emailTemplates.js";

describe("system email templates", () => {
  it("loads all standard templates and replaces placeholders", () => {
    expect(Object.keys(emailTemplates).sort()).toEqual([...SUPPORTED_EMAIL_LANGUAGES, DEFAULT_EMAIL_LANGUAGE].sort());

    const rendered = renderTemplate(getEmailTemplate(SYSTEM_EMAIL_TYPES.SEWOALERT, "en").textTemplate, {
      recipient_name: "Ana",
      tipo_alerta: "S-EWO pending N1 approval",
      descricao: "Near miss review required",
      prioridade: "SIF",
      data_hora: "2026-06-03T10:00:00.000Z",
      sewo_code: "SEWO-1234",
      plant_name: "Plant 1",
      sewo_status: "Submitted",
      sewo_url: "https://example.test/sewo/SEWO-1234",
    });

    expect(rendered).toContain("Hello Ana");
    expect(rendered).toContain("S-EWO pending N1 approval");
    expect(rendered).toContain("SEWO-1234");
    expect(rendered).not.toContain("{{");
  });

  it("normalizes unsupported user languages to the en-EN fallback while using en templates", () => {
    expect(DEFAULT_EMAIL_LANGUAGE).toBe("en-EN");
    expect(normalizeEmailLanguage("pt")).toBe("pt-PT");
    expect(normalizeEmailLanguage("en-US")).toBe("en");
    expect(normalizeEmailLanguage("en-EN")).toBe("en-EN");
    expect(normalizeEmailLanguage(undefined)).toBe("en-EN");
    expect(normalizeEmailLanguage("de")).toBe("en-EN");

    const fallbackTemplate = getEmailTemplate(SYSTEM_EMAIL_TYPES.CREDENTIALS, "de");
    const subject = renderTemplate(fallbackTemplate.subject, {});

    expect(fallbackTemplate.language).toBe("en-EN");
    expect(subject).toBe("Access credentials");
  });

  it("keeps subject and body in the same selected language", () => {
    const template = getEmailTemplate(SYSTEM_EMAIL_TYPES.NOTIFICATION, "fr");
    const data = {
      recipient_name: "Claire",
      titulo_notificacao: "Controle operationnel",
      mensagem: "Action requise.",
      data_hora: "2026-06-03T10:00:00.000Z",
      plant_name: "Plant 1",
      action_url: "https://example.test",
    };

    expect(renderTemplate(template.subject, data)).toBe("Notification - Controle operationnel");
    expect(renderTemplate(template.textTemplate, data)).toContain("Bonjour Claire");
  });

  it("loads every configured email type in every supported language", () => {
    for (const language of [...SUPPORTED_EMAIL_LANGUAGES, DEFAULT_EMAIL_LANGUAGE]) {
      for (const type of Object.values(SYSTEM_EMAIL_TYPES)) {
        const template = getEmailTemplate(type, language);

        expect(template.subject).toBeTruthy();
        expect(template.htmlTemplate).toBeTruthy();
        expect(template.textTemplate).toBeTruthy();
      }
    }
  });

  it("renders password reset and event templates without unresolved placeholders", () => {
    const reset = renderTemplate(getEmailTemplate(SYSTEM_EMAIL_TYPES.PASSWORD_RESET, "it").textTemplate, {
      user_name: "Mario",
      user_email: "mario@example.com",
      temporary_password: "temporary",
      login_url: "https://example.test/login",
    });
    const event = renderTemplate(getEmailTemplate(SYSTEM_EMAIL_TYPES.ACTION_ASSIGNED, "de").textTemplate, {
      recipient_name: "Alex",
      event_title: "Action A",
      event_intro: "A new action was assigned to you.",
      plant_name: "Plant 1",
      data_hora: "2026-06-05",
      reference_code: "A-1",
      description: "Do the action",
      action_url: "https://example.test/actions/1",
    });

    expect(reset).toContain("Ciao Mario");
    expect(event).toContain("Hello Alex");
    expect(`${reset}\n${event}`).not.toContain("{{");
  });
});
