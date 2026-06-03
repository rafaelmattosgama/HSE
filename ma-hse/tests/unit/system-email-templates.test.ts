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
    expect(Object.keys(emailTemplates).sort()).toEqual([...SUPPORTED_EMAIL_LANGUAGES].sort());

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

  it("normalizes unsupported user languages to the default pt-PT template", () => {
    expect(DEFAULT_EMAIL_LANGUAGE).toBe("pt-PT");
    expect(normalizeEmailLanguage("pt")).toBe("pt-PT");
    expect(normalizeEmailLanguage("en-US")).toBe("en");
    expect(normalizeEmailLanguage(undefined)).toBe("pt-PT");
    expect(normalizeEmailLanguage("de")).toBe("pt-PT");

    const fallbackTemplate = getEmailTemplate(SYSTEM_EMAIL_TYPES.CREDENTIALS, "de");
    const subject = renderTemplate(fallbackTemplate.subject, {});

    expect(fallbackTemplate.language).toBe("pt-PT");
    expect(subject).toBe("Credenciais de acesso");
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
});
