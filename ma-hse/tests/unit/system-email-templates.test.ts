import { describe, expect, it } from "vitest";
import { renderTemplate } from "@/src/email/emailRenderer.js";
import { emailTemplates, SYSTEM_EMAIL_TYPES } from "@/src/email/emailTemplates.js";

describe("system email templates", () => {
  it("loads all standard templates and replaces placeholders", () => {
    expect(Object.keys(emailTemplates).sort()).toEqual([
      SYSTEM_EMAIL_TYPES.CREDENTIALS,
      SYSTEM_EMAIL_TYPES.NOTIFICATION,
      SYSTEM_EMAIL_TYPES.SEWOALERT,
    ].sort());

    const rendered = renderTemplate(emailTemplates[SYSTEM_EMAIL_TYPES.SEWOALERT].textTemplate, {
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
});
