import { test, expect } from "@playwright/test";

test("home page loads", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  // File inputs use class "hidden" (label triggers pick); assert a visible step-1 control instead.
  await expect(page.getByTestId("upload-step1-next")).toBeVisible({
    timeout: 20_000,
  });
});

test("admin redirects to login without session", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
});
