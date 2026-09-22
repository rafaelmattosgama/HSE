import "dotenv/config";
import { test, expect } from "@playwright/test";

for (const javaScriptEnabled of [true, false]) {
  test.describe(`quick communication (JavaScript ${javaScriptEnabled ? "enabled" : "disabled"})`, () => {
    test.use({ javaScriptEnabled });
    test("opens and retains its draft after collapsing", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const csrfResponse = await page.request.get("/api/auth/csrf");
      const { csrfToken } = await csrfResponse.json();
      await page.request.post("/api/auth/callback/credentials", {
        form: {
          csrfToken,
          email: process.env.N0_ADMIN_EMAIL ?? "admin@maxsafety.com",
          password: process.env.SEED_DEFAULT_PASSWORD ?? "ChangeMe123!",
          redirect: "false",
          json: "true",
        },
      });
      const session = await (await page.request.get("/api/auth/session")).json();
      expect(session.user?.email).toBe(process.env.N0_ADMIN_EMAIL ?? "admin@maxsafety.com");

      await page.route("**/api/me/onboarding", (route) => route.fulfill({
        json: { ok: true, data: { status: "COMPLETED" } },
      }));
      await page.goto(`/app/${process.env.QUICK_COMMUNICATION_TEST_PLANT ?? "pl01"}/communications`);
      const toggle = page.locator("summary").filter({ hasText: /Comunica[cç][aã]o r[aá]pida|Quick communication/ });
      await expect(toggle).toBeVisible();
      await toggle.click();
      await expect(toggle.getByText(/^(Ocultar|Hide)$/)).toBeVisible();
      const description = page.getByPlaceholder(/^(Descri[cç][aã]o|Description)$/);
      await expect(description).toBeVisible();
      await description.fill("Local regression test draft — do not submit.");
      await toggle.click();
      await expect(description).toBeHidden();
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(description).toHaveValue("Local regression test draft — do not submit.");
      const create = page.getByRole("button", { name: /^(Criar|Create)$/ });
      if (javaScriptEnabled) await expect(create).toBeEnabled();
      else await expect(create).toBeDisabled();
      expect(errors).toEqual([]);
    });
  });
}
