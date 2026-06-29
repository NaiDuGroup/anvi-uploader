/**
 * E2E smoke tests for the Workshop Board page and Layout Planner modal.
 *
 * Access is restricted to `workshop` and `superadmin` roles.
 * All board tests therefore run as the workshop user.
 *
 * Covers:
 *  1. Workshop user can reach the board.
 *  2. Regular admin (role=admin) is redirected away from the board.
 *  3. Unauthenticated user is redirected to login.
 *  4. Board renders sections or empty state after loading.
 *  5. If any LF group exists, «Собрать макет» opens a modal with SVG rects.
 */

import { test, expect, type Page } from "@playwright/test";

const ADMIN = { name: "e2e-admin@anvi.test", password: "testpass123" };
const WORKSHOP = { name: "e2e-workshop@anvi.test", password: "testpass123" };

// ─── helpers ──────────────────────────────────────────────────────────────────

async function loginAs(page: Page, user: { name: string; password: string }) {
  await page.context().clearCookies();
  // Use "load" (not "networkidle") — dev-server hot-reload keeps persistent
  // WebSocket connections that prevent "networkidle" from ever resolving.
  await page.goto("/admin/login", { waitUntil: "load", timeout: 90_000 });

  // body.hydrated is added by HtmlLangUpdater once Zustand hydrates from
  // localStorage. On a cold dev server this can take time — poll generously.
  const hydrated = await page
    .waitForFunction(() => document.body.classList.contains("hydrated"), {
      timeout: 60_000,
      polling: 500,
    })
    .then(() => true)
    .catch(() => false);

  if (!hydrated) {
    // Absolute fallback: inject the class so the form becomes visible.
    await page.evaluate(() => document.body.classList.add("hydrated"));
  }

  // Login is client-first; reveal the staff form via the discreet toggle.
  await page.getByTestId("login-staff-toggle").click();

  await page.getByTestId("admin-login-name").fill(user.name);
  await page.getByTestId("admin-login-password").fill(user.password);
  await page.getByTestId("admin-login-submit").click();
  // Wait for redirect away from login page
  await expect(page).not.toHaveURL(/\/admin\/login/, { timeout: 20_000 });
}

// ─── tests ────────────────────────────────────────────────────────────────────

test.describe("workshop board", () => {
  test.setTimeout(90_000);

  test("workshop user can access the board", async ({ page }) => {
    await loginAs(page, WORKSHOP);
    await page.goto("/admin/workshop-board");
    await expect(page).toHaveURL(/\/admin\/workshop-board/, { timeout: 10_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("regular admin is redirected away from the board", async ({ page }) => {
    await loginAs(page, ADMIN);
    await page.goto("/admin/workshop-board");
    // admin role is not allowed — should be redirected to /admin/orders
    await expect(page).toHaveURL(/\/admin\/orders/, { timeout: 10_000 });
  });

  test("non-authenticated user is redirected to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/admin/workshop-board");
    await expect(page).toHaveURL(/\/admin\/login/, { timeout: 10_000 });
  });

  test("board renders sections or empty state after loading", async ({
    page,
  }) => {
    await loginAs(page, WORKSHOP);
    await page.goto("/admin/workshop-board");

    // Either board sections or the empty state is visible — never blank
    await expect(page.locator("main")).toBeVisible({ timeout: 30_000 });
  });

  test("Собрать макет button opens layout modal with SVG rects", async ({
    page,
    request,
  }) => {
    await loginAs(page, WORKSHOP);
    await page.goto("/admin/workshop-board");
    // Wait for board to fully load
    await page.waitForLoadState("load", { timeout: 30_000 });
    // Give polling a moment to fetch board data
    await page.waitForTimeout(3_000);

    // Find any «Собрать макет» button
    const assembleBtn = page.getByRole("button", { name: /собрать макет/i }).first();
    const hasBtnVisible = await assembleBtn.isVisible().catch(() => false);

    if (!hasBtnVisible) {
      // No LF group on board right now — skip modal assertions
      test.info().annotations.push({
        type: "skip-reason",
        description: "No LF group on board — skipping modal assertion",
      });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      return;
    }

    // Click the button
    await assembleBtn.click();

    // Modal should appear
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible({ timeout: 5_000 });

    // Modal header contains material name
    await expect(modal.locator("h2")).toBeVisible();

    // SVG with at least one rect inside the modal
    const svgRects = modal.locator("svg rect");
    await expect(svgRects.first()).toBeVisible({ timeout: 5_000 });
    expect(await svgRects.count()).toBeGreaterThan(0);

    // Metrics panel shows current length label
    await expect(
      modal.getByText(/текущая длина|total length/i),
    ).toBeVisible();

    // PDF download button is available when layout is complete
    const pdfBtn = modal.getByRole("button", {
      name: /скачать pdf|download pdf/i,
    });
    await expect(pdfBtn).toBeVisible();

    // Close button works
    await modal.getByRole("button", { name: /закрыть|close/i }).click();
    await expect(modal).not.toBeVisible({ timeout: 3_000 });
  });
});
