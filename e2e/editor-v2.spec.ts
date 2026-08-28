import { test, expect } from "@playwright/test";

/**
 * Prototype smoke tests for the v2 wires-based editor (/editor-v2).
 * Click-to-place is used instead of pointer-drag for robustness.
 */

const DEV_USERNAME = process.env.QUBITLAB_DEV_USERNAME ?? "devuser";
const DEV_PASSWORD = process.env.QUBITLAB_DEV_PASSWORD ?? "devpassword";

test.describe("editor v2 prototype", () => {
  test.beforeEach(async ({ page }) => {
    // Log in via the auth endpoint directly (avoids the Turnstile widget).
    const response = await page.request.post("/auth/login", {
      data: { username: DEV_USERNAME, password: DEV_PASSWORD },
    });
    test.skip(
      response.status() !== 200,
      `dev account unavailable (${response.status()}) — run npm run db:seed:dev -- --local`,
    );
    // Propagate the session cookie to the browser context.
    const cookie = (await response.headersArray()).find(
      (h) => h.name === "set-cookie",
    );
    if (cookie) {
      const [name, value] = cookie.value.split("=");
      const sessionValue = value.split(";")[0];
      await page.context().addCookies([
        {
          name,
          value: sessionValue,
          url: "http://localhost:8787",
        },
      ]);
    }
    await page.goto("/editor-v2");
    await expect(page.locator(".ev2-root")).toBeVisible();
  });

  test("renders the empty grid with palette and transport", async ({
    page,
  }) => {
    await expect(page.locator(".ev2-toolbox")).toBeVisible();
    await expect(page.locator(".ev2-transport")).toBeVisible();
    await expect(page.locator(".ev2-empty-hint")).toBeVisible();
  });

  test("click-to-place H, run, verify superposition", async ({ page }) => {
    // Arm H then click the first cell (column 1, wire q0).
    await page.locator(".ev2-toolbox-item", { hasText: "H" }).first().click();
    await page.locator("svg.ev2-grid").click({ position: { x: 100, y: 60 } });

    // The op is placed and selected.
    await expect(page.locator(".ev2-op")).toHaveCount(1);
    await expect(page.locator(".ev2-inspector-title")).toContainText(
      "Hadamard",
    );

    // Start (prepare the session), then Run to completion.
    await page.locator(".ev2-btn-primary").first().click();
    await expect(page.locator(".ev2-status-pill")).toHaveText(/ready/i, {
      timeout: 10_000,
    });
    await page.locator(".ev2-btn-primary").first().click();
    await expect(page.locator(".ev2-status-pill")).toHaveText(/done/i, {
      timeout: 10_000,
    });
    await expect(page.locator(".state-entry").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("undo removes the placed op", async ({ page }) => {
    await page.locator(".ev2-toolbox-item", { hasText: "H" }).first().click();
    await page.locator("svg.ev2-grid").click({ position: { x: 100, y: 60 } });
    await expect(page.locator(".ev2-op")).toHaveCount(1);

    await page.keyboard.press("Control+Z");
    await expect(page.locator(".ev2-op")).toHaveCount(0);
    await expect(page.locator(".ev2-empty-hint")).toBeVisible();
  });
});
