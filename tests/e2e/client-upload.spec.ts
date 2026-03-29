import { test, expect } from "@playwright/test";
import path from "node:path";

const fixturePng = path.join(process.cwd(), "tests/fixtures/test.png");

test.describe("client upload flow", () => {
  test("upload file, submit order, open tracking", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await expect(page.getByTestId("upload-step1-next")).toBeVisible({
      timeout: 20_000,
    });

    // Hidden file input is OK for setInputFiles in Playwright.
    await page.getByTestId("upload-file-input").setInputFiles(fixturePng);
    await page.getByTestId("upload-step1-next").click();

    const phone = `+3737${Date.now().toString().slice(-8)}`;
    await page.getByTestId("upload-phone").fill(phone);
    await page.getByTestId("upload-step2-next").click();

    await page.getByTestId("upload-gdpr-checkbox").check();
    await page.getByTestId("upload-submit").click();

    await expect(page.getByTestId("upload-success")).toBeVisible({
      timeout: 120_000,
    });

    const trackLink = page.getByTestId("upload-track-link");
    const href = await trackLink.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toMatch(/^\/track\/.+/);

    await trackLink.click();
    await expect(page.getByTestId("track-order-status")).toBeVisible({
      timeout: 30_000,
    });
  });
});
