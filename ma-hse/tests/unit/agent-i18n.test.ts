import { describe, expect, it } from "vitest";
import { RoleCode } from "@prisma/client";
import { createInternalHseAgent } from "@/lib/agent/agent";
import {
  getInternalAgentCopy,
  getInternalAgentErrorMessage,
  getInternalAgentLanguageInstructions,
  normalizeInternalAgentLocale,
} from "@/lib/agent/i18n";
import type { AgentToolContext } from "@/lib/agent/permissions";
import { locales } from "@/lib/i18n/routing";

function context(language: string): AgentToolContext {
  return {
    session: {
      user: {
        id: "user-1",
        name: "User One",
        email: "user@example.com",
        image: null,
        language,
        mustChangePassword: false,
        plantRoles: [{ plantId: "plant-1", plantCode: "de01", role: RoleCode.N3_SAFETY, canSeeClinical: true }],
      },
      expires: "2099-01-01T00:00:00.000Z",
    },
    userId: "user-1",
    plantId: "plant-1",
    plantCode: "de01",
    role: RoleCode.N3_SAFETY,
  };
}

describe("internal agent language", () => {
  it("defines complete static copy and strict instructions for every supported locale", () => {
    for (const locale of locales) {
      const copy = getInternalAgentCopy(locale);
      const instructions = getInternalAgentLanguageInstructions(locale);

      expect(copy.locale).toBe(locale);
      expect(copy.ui.welcome.length).toBeGreaterThan(0);
      expect(copy.mock.help.length).toBeGreaterThan(0);
      expect(instructions).toContain(`(${locale})`);
      expect(instructions).toContain(`Always write every user-facing response in ${copy.languageName}`);
      expect(instructions).toContain("Do not infer the response language from the user's message");
    }
  });

  it("builds the real agent with the authenticated session language", () => {
    const agent = createInternalHseAgent(context("de"));
    const instructions = String(agent.instructions);

    expect(instructions).toContain("preferred language is German (de)");
    expect(instructions).toContain("Always write every user-facing response in German");
    expect(instructions).not.toContain("Portuguese is acceptable by default");
  });

  it("normalizes regional variants and localizes known API errors", () => {
    expect(normalizeInternalAgentLocale("pt-PT")).toBe("pt");
    expect(normalizeInternalAgentLocale("unsupported")).toBe("en");
    expect(getInternalAgentErrorMessage("fr", "AGENT_RATE_LIMITED")).toContain("Trop de demandes");
    expect(getInternalAgentErrorMessage("ro", "CONFIRMATION_EXPIRED")).toContain("expirat");
  });
});
