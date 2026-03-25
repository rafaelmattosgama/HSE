import { test, expect } from "@playwright/test";

test("login page smoke", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Email", exact: true })).toBeVisible();
});

test("public report page smoke", async ({ page }) => {
  await page.goto("/r/pl01/report?t=pl01-report-seed-token");
  await expect(page.getByRole("heading", { name: "Plant Safety Report" })).toBeVisible();
});
