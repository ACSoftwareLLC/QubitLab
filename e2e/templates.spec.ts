import { test, expect, type Page } from "@playwright/test";

/**
 * Template gallery e2e smoke (feature Tasks 1–9).
 *
 * Covers the guest-visible loop end to end: gallery list, category
 * filtering, article detail, and the sessionStorage editor handoff
 * (login required for /editor; page.request shares cookies with the
 * browser context, same pattern as e2e/csp.spec.ts).
 */

const DEV_USERNAME = process.env.QUBITLAB_DEV_USERNAME ?? "devuser";
const DEV_PASSWORD = process.env.QUBITLAB_DEV_PASSWORD ?? "devpassword";

async function loginAsDevUser(page: Page): Promise<void> {
  const res = await page.request.post("/auth/login", {
    data: { username: DEV_USERNAME, password: DEV_PASSWORD },
  });
  expect(res.status()).toBe(200);
}

test.describe("template gallery", () => {
  test("guest can browse the gallery", async ({ page }) => {
    await page.goto("/templates");
    await expect(
      page.getByRole("heading", { name: "Templates" })
    ).toBeVisible();
    await expect(page.getByText("Bell State")).toBeVisible();
    await expect(page.getByText("Grover Search")).toBeVisible();
  });

  test("category filter chips narrow the grid", async ({ page }) => {
    await page.goto("/templates");
    await expect(page.getByText("Bell State")).toBeVisible();

    await page.getByRole("button", { name: "algorithm", exact: true }).click();
    await expect(page.getByText("Grover Search")).toBeVisible();
    await expect(page.getByText("Bell State")).not.toBeVisible();
  });

  test("detail renders article and hands off to the editor", async ({
    page,
  }) => {
    // Editor requires auth — sign in as the seeded regular user BEFORE the
    // app mounts, so the /auth/me bootstrap hydrates the session (same
    // pattern as e2e/csp.spec.ts; page.request shares cookies with the
    // browser context). Logging in after mount would leave the in-place
    // AuthPage rendered (RequireAuth shows the login form without a
    // redirect) and the editor would never mount on this page load.
    await loginAsDevUser(page);

    await page.goto("/templates");
    await page.getByText("Bell State").click();
    await expect(page).toHaveURL(/\/templates\/bell-state$/);
    await expect(
      page.getByRole("button", { name: /open in editor/i })
    ).toBeVisible();

    await page.getByRole("button", { name: /open in editor/i }).click();
    await expect(page).toHaveURL(/\/editor$/);
    await expect(page.getByText(/loaded template/i)).toBeVisible();

    // Gates render as SVG groups without per-gate classes; each carries a
    // gate-delete-handle group, so [class*=gate] is the stable hook.
    await expect(page.locator("[class*=gate]").first()).toBeVisible();
  });

  test("list endpoint is reachable and returns seeded templates", async ({
    request,
  }) => {
    const response = await request.get("/auth/templates");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(
      body.templates.some((t: { slug: string }) => t.slug === "bell-state")
    ).toBe(true);
    expect(
      body.templates.some((t: { slug: string }) => t.slug === "grover-search")
    ).toBe(true);
  });
});
