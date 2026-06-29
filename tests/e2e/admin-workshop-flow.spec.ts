import { test, expect, type Page } from "@playwright/test";

const TEST_ADMIN = {
  name: "e2e-admin@anvi.test",
  password: "testpass123",
};
const TEST_WORKSHOP = {
  name: "e2e-workshop@anvi.test",
  password: "testpass123",
};

/** Shared helper: navigate to login, wait for hydration, fill and submit. */
async function loginAs(page: Page, user: { name: string; password: string }) {
  await page.goto("/admin/login", { waitUntil: "load", timeout: 90_000 });

  // body.hydrated is added by HtmlLangUpdater; on a cold dev server this may
  // take a moment. Wait up to 30 s, then force the class as a fallback.
  const hydrated = await page
    .waitForFunction(() => document.body.classList.contains("hydrated"), {
      timeout: 30_000,
      polling: 500,
    })
    .then(() => true)
    .catch(() => false);

  if (!hydrated) {
    await page.evaluate(() => document.body.classList.add("hydrated"));
  }

  // Login is client-first; reveal the staff form via the discreet toggle.
  await page.getByTestId("login-staff-toggle").click();

  await page.getByTestId("admin-login-name").fill(user.name);
  await page.getByTestId("admin-login-password").fill(user.password);
  await page.getByTestId("admin-login-submit").click();
}

test.describe("admin and workshop", () => {
  test.setTimeout(180_000);

  test("admin sends order to workshop; workshop returns to studio", async ({
    page,
    request,
  }) => {
    const phone = `+3737${Date.now().toString().slice(-8)}`;
    const createRes = await request.post("/api/orders", {
      data: {
        phone,
        files: [
          {
            fileName: "e2e.pdf",
            fileUrl: "uploads/e2e-flow-key",
            copies: 1,
            color: "bw",
            paperType: "A4",
          },
        ],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const order = (await createRes.json()) as { id: string };
    const orderId = order.id;

    await page.context().clearCookies();
    await loginAs(page, TEST_ADMIN);
    await expect(page).toHaveURL(/\/admin\/orders$/, { timeout: 20_000 });

    await page.getByTestId("admin-search").fill(phone);
    const statusInMainTable = page.getByTestId(
      `order-status-trigger-table-${orderId}`,
    );
    await expect(statusInMainTable).toBeVisible({ timeout: 30_000 });
    await statusInMainTable.click();
    const patchToWorkshop = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/orders/${orderId}`) &&
        r.request().method() === "PATCH" &&
        r.status() === 200,
    );
    await page.getByTestId("status-option-SENT_TO_WORKSHOP").click();
    await patchToWorkshop;

    await page.context().clearCookies();
    await loginAs(page, TEST_WORKSHOP);

    await page.getByTestId("admin-search").fill(phone);
    const workshopTableStatus = page.getByTestId(
      `order-status-trigger-table-${orderId}`,
    );
    await expect(workshopTableStatus).toBeVisible({ timeout: 30_000 });
    await workshopTableStatus.click();
    const patchReturn = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/orders/${orderId}`) &&
        r.request().method() === "PATCH" &&
        r.status() === 200,
    );
    await page.getByTestId("status-option-RETURNED_TO_STUDIO").click();
    await patchReturn;

    await page.context().clearCookies();
    await loginAs(page, TEST_ADMIN);

    await page.getByTestId("admin-search").fill(phone);
    await expect(
      page.getByTestId(`order-status-trigger-table-${orderId}`),
    ).toBeVisible({ timeout: 30_000 });
  });
});
