/**
 * E2E: the calm «⋯» line menu on the workshop board.
 *
 * - «⋯» opens a menu with «Проблема с файлом…» (not a red button on the line);
 *   Esc and an outside click close it;
 * - the menu item opens the reason modal; the flagged line shows the amber
 *   «Ждёт файл» pill, a neutral «Заменить файл» and «⋯» → «Снять отметку»;
 * - a printed (DONE) line has no menu.
 *
 * Seeds its own order in the LOCAL database (refuses any other DATABASE_URL)
 * and removes it afterwards. Needs the e2e users (`prisma/seed-test-users.ts`).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
    return /^DATABASE_URL="?([^"\n]+)"?/m.exec(env)?.[1] ?? "";
  } catch {
    return "";
  }
}
const DB_URL = databaseUrl();
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(DB_URL);

const WORKSHOP = { name: "e2e-workshop@anvi.test", password: "testpass123" };

async function loginAs(page: Page, user: { name: string; password: string }) {
  await page.context().clearCookies();
  await page.goto("/admin/login", { waitUntil: "load", timeout: 90_000 });
  await page
    .waitForFunction(() => document.body.classList.contains("hydrated"), { timeout: 60_000, polling: 500 })
    .catch(() => page.evaluate(() => document.body.classList.add("hydrated")));
  await page.getByTestId("login-staff-toggle").click();
  await page.getByTestId("admin-login-name").fill(user.name);
  await page.getByTestId("admin-login-password").fill(user.password);
  await page.getByTestId("admin-login-submit").click();
  await expect(page).not.toHaveURL(/\/admin\/login/, { timeout: 20_000 });
}

test.describe("workshop board: «⋯» line menu", () => {
  test.skip(!isLocalDb, "local database only");
  test.setTimeout(120_000);

  const prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
  let orderId = "";
  let waitingId = "";
  let doneId = "";

  test.beforeAll(async () => {
    const stamp = `${Date.now()}`.slice(-7);
    const order = await prisma.order.create({
      data: {
        phone: `+3736${stamp}`,
        clientName: `E2E меню ${stamp}`,
        productType: "paper_print",
        status: "WORKSHOP_PRINTING",
        isWorkshop: true,
        publicToken: `e2e-menu-${stamp}-${Math.random().toString(36).slice(2)}`,
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    orderId = order.id;
    const mk = async (sortOrder: number, productionStatus: string, fileName: string) => {
      const line = await prisma.orderLine.create({
        data: {
          orderId,
          sortOrder,
          productType: "paper_print",
          productionStatus,
          files: {
            create: [{ orderId, fileName, fileUrl: `uploads/e2e-menu-${stamp}-${sortOrder}.pdf`, copies: 1, color: "bw" }],
          },
        },
      });
      return line.id;
    };
    waitingId = await mk(0, "WAITING", "menu-waiting.pdf");
    doneId = await mk(1, "DONE", "menu-done.pdf");
  });

  test.afterAll(async () => {
    if (orderId) {
      // Hard delete (files / lines cascade); soft-delete if history rows hold it.
      await prisma.order
        .delete({ where: { id: orderId } })
        .catch(() => prisma.order.update({ where: { id: orderId }, data: { deletedAt: new Date() } }))
        .catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("menu opens/closes, flags via the modal, clear only on the flagged line", async ({ page }) => {
    await loginAs(page, WORKSHOP);
    await page.goto("/admin/workshop-board");

    const more = page.getByTestId(`line-more-${waitingId}`);
    await more.scrollIntoViewIfNeeded({ timeout: 30_000 });
    await expect(more).toBeVisible();
    await expect(more).toHaveAttribute("aria-haspopup", "menu");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId(`line-flag-layout-${waitingId}`)).toHaveCount(0);

    // A printed line cannot be flagged: no menu at all.
    await expect(page.getByTestId(`line-status-controls-${doneId}`)).toBeVisible();
    await expect(page.getByTestId(`line-more-${doneId}`)).toHaveCount(0);

    // Open → Esc closes, focus back on «⋯».
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    const flagItem = page.getByTestId(`line-flag-layout-${waitingId}`);
    await expect(flagItem).toBeVisible();
    await expect(flagItem).toHaveAttribute("role", "menuitem");
    await expect(page.getByTestId(`line-clear-layout-${waitingId}`)).toHaveCount(0);
    await expect(flagItem).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(flagItem).toHaveCount(0);
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(more).toBeFocused();

    // Open → outside click closes.
    await more.click();
    await expect(flagItem).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(flagItem).toHaveCount(0);

    // Keyboard: ArrowDown on «⋯» opens it.
    await more.focus();
    await page.keyboard.press("ArrowDown");
    await expect(flagItem).toBeFocused();
    await page.keyboard.press("Escape");

    // Item → the reason modal (calm title), confirm flags the line.
    await more.click();
    await flagItem.click();
    const modal = page.getByTestId("layout-issue-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toContainText(/Проблема с файлом|Problemă cu fișierul|File problem/);
    await page.getByTestId("layout-issue-reason-lowQuality").click();
    await page.getByTestId("layout-issue-note").fill("72 dpi");
    await page.getByTestId("layout-issue-confirm").click();
    await expect(modal).toHaveCount(0, { timeout: 20_000 });

    // Flagged: amber pill, neutral replace, «⋯» → «Снять отметку» (no flag item).
    const pill = page.getByTestId(`line-status-${waitingId}`);
    await expect(pill).toHaveAttribute("data-status", "NEEDS_LAYOUT", { timeout: 20_000 });
    await expect(pill).toHaveClass(/amber/);
    await expect(page.getByTestId(`line-replace-layout-${waitingId}`)).toHaveClass(/border-gray-300/);
    await expect(page.getByTestId(`line-layout-issue-${waitingId}`)).toContainText("72 dpi");
    await expect(page.getByTestId(`line-layout-issue-${waitingId}`)).toHaveClass(/amber/);
    await more.click();
    await expect(page.getByTestId(`line-clear-layout-${waitingId}`)).toBeVisible();
    await expect(page.getByTestId(`line-flag-layout-${waitingId}`)).toHaveCount(0);

    // «Снять отметку» → in-page confirm → back to «Ждёт».
    await page.getByTestId(`line-clear-layout-${waitingId}`).click();
    const confirm = page.getByTestId("clear-layout-issue-confirm");
    await expect(confirm).toBeVisible();
    await confirm.click();
    await expect(pill).toHaveAttribute("data-status", "WAITING", { timeout: 20_000 });
  });
});
