import { afterEach, describe, expect, it, vi } from "vitest";

const helperMock = vi.hoisted(() => ({
  sendCredentialsEmail: vi.fn(),
}));

vi.mock("@/src/email/systemEmailHelpers.js", () => helperMock);
vi.mock("@/lib/env", () => ({
  env: {
    SMTP_HOST: "localhost",
    SMTP_PORT: 1025,
    SMTP_FROM: "MA HSE <noreply@example.test>",
  },
}));

import { EmailService } from "@/lib/services/email-service";

describe("EmailService credentials delivery", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the password reset template scenario for regenerated passwords", async () => {
    await EmailService.sendTemporaryPassword({
      to: "user@example.com",
      userName: "User",
      temporaryPassword: "temporary-password",
      loginUrl: "https://example.test/login",
      language: "fr",
      scenario: "reset",
    });

    expect(helperMock.sendCredentialsEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        palavraPasse: "temporary-password",
        linkAcesso: "https://example.test/login",
        scenario: "reset",
        user: expect.objectContaining({
          email: "user@example.com",
          language: "fr",
        }),
      }),
    );
  });
});
