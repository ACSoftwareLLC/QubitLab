import { test, expect } from "@playwright/test";

test.describe("guest smoke tests", () => {
  test("homepage loads the SPA shell", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });

  test("marketplace is reachable without authentication", async ({
    request,
  }) => {
    const response = await request.get("/auth/marketplace");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.circuits)).toBe(true);
  });

  test("health endpoint returns ok", async ({ request }) => {
    const response = await request.get("/auth/health");
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  test("turnstile site key endpoint is reachable", async ({ request }) => {
    const response = await request.get("/auth/turnstile-sitekey");
    expect([200, 500]).toContain(response.status());
  });
});

test.describe("authentication smoke tests", () => {
  test("login rejects invalid credentials", async ({ request }) => {
    const response = await request.post("/auth/login", {
      data: {
        // Well-formed username (schema-valid) that does not exist, so the
        // request reaches the credential check and gets a clean 401.
        username: "nonexistent_user",
        password: "wrongpassword",
      },
    });
    expect(response.status()).toBe(401);
  });

  test("registration requires valid input", async ({ request }) => {
    const response = await request.post("/auth/register", {
      data: {
        username: "ab",
        password: "short",
      },
    });
    expect(response.status()).toBe(400);
  });
});
