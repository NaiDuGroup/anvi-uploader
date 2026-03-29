import { test, expect } from "@playwright/test";

const TEST_ADMIN = {
  name: "e2e-admin@anvi.test",
  password: "testpass123",
};
const TEST_WORKSHOP = {
  name: "e2e-workshop@anvi.test",
  password: "testpass123",
};

test.describe("admin and workshop", () => {
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

    await page.goto("/admin/login");
    await page.getByTestId("admin-login-name").fill(TEST_ADMIN.name);
    await page.getByTestId("admin-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("admin-login-submit").click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.getByTestId("admin-search-phone").fill(phone);
    await expect(page.getByTestId(`order-status-trigger-${orderId}`)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId(`order-status-trigger-${orderId}`).click();
    const patchToWorkshop = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/orders/${orderId}`) &&
        r.request().method() === "PATCH" &&
        r.status() === 200,
    );
    await page.getByTestId("status-option-SENT_TO_WORKSHOP").click();
    await patchToWorkshop;

    await page.goto("/admin/login");
    await page.getByTestId("admin-login-name").fill(TEST_WORKSHOP.name);
    await page.getByTestId("admin-login-password").fill(TEST_WORKSHOP.password);
    await page.getByTestId("admin-login-submit").click();

    await page.getByTestId("admin-search-phone").fill(phone);
    await expect(page.getByTestId(`order-status-trigger-${orderId}`)).toBeVisible({
      timeout: 30_000,
    });
    await page.getByTestId(`order-status-trigger-${orderId}`).click();
    const patchReturn = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/orders/${orderId}`) &&
        r.request().method() === "PATCH" &&
        r.status() === 200,
    );
    await page.getByTestId("status-option-RETURNED_TO_STUDIO").click();
    await patchReturn;

    await page.goto("/admin/login");
    await page.getByTestId("admin-login-name").fill(TEST_ADMIN.name);
    await page.getByTestId("admin-login-password").fill(TEST_ADMIN.password);
    await page.getByTestId("admin-login-submit").click();

    await page.getByTestId("admin-search-phone").fill(phone);
    await expect(page.getByTestId(`order-status-trigger-${orderId}`)).toBeVisible({
      timeout: 30_000,
    });
  });
});
