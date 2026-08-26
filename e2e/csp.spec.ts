import { test, expect, type Page } from "@playwright/test";

/**
 * CSP E2E smoke test (hardening Phase 3 leftover).
 *
 * Verifies that the strict Content-Security-Policy applied by the Worker
 * does not break the two things most likely to clash with it:
 *
 *  1. Turnstile — challenges.cloudflare.com scripts load site-wide
 *     (see index.html) and must be permitted by script-src/frame-src.
 *     Requires internet access; skipped when the challenge host is
 *     unreachable (e.g. sandboxed CI).
 *  2. WASM simulator — instantiation requires 'wasm-unsafe-eval'. We
 *     log into the seeded dev account, place a gate on the editor
 *     canvas, and run a simulation end-to-end.
 *
 * Any browser console message indicating a CSP violation fails the test.
 */

const DEV_USERNAME = process.env.QUBITLAB_DEV_USERNAME ?? "devuser";
const DEV_PASSWORD = process.env.QUBITLAB_DEV_PASSWORD ?? "devpassword";

function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on("console", (msg) => {
    if (
      /violates Content Security Policy|Refused to (load|execute|connect|apply)/i.test(
        msg.text(),
      )
    ) {
      violations.push(msg.text());
    }
  });
  return violations;
}

async function loginAsDevUser(page: Page): Promise<void> {
  const res = await page.request.post("/auth/login", {
    data: { username: DEV_USERNAME, password: DEV_PASSWORD },
  });
  expect(res.status()).toBe(200);
}

test.describe("CSP smoke tests", () => {
  test("served pages carry the hardened security headers", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBe(200);
    const csp = res?.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("wasm-unsafe-eval");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(res?.headers()["x-content-type-options"]).toBe("nosniff");
  });

  test("Turnstile challenge script loads under CSP", async ({ page }) => {
    const violations = collectCspViolations(page);
    await page.goto("/");

    // index.html loads the Turnstile api.js site-wide; window.turnstile
    // should appear shortly. Reachability is probed from the Node test
    // process (not page context) because this app's strict CSP forbids
    // cross-origin fetches — probing from the page would violate the
    // policy under test. Skips gracefully when offline.
    const probe = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/api.js",
    )
      .then((r) => r.ok)
      .catch(() => false);
    test.skip(
      !probe,
      "challenges.cloudflare.com unreachable (offline environment?)",
    );

    await expect
      .poll(
        () =>
          page.evaluate(() =>
            Boolean((window as { turnstile?: unknown }).turnstile),
          ),
        {
          timeout: 15_000,
        },
      )
      .toBe(true);

    expect(violations).toEqual([]);
  });

  test("WASM simulator runs a circuit under CSP", async ({ page }) => {
    const violations = collectCspViolations(page);

    await loginAsDevUser(page);
    await page.goto("/editor");
    await expect(page.locator(".toolbox-item").first()).toBeVisible();

    // Place the first toolbox gate onto the canvas via HTML5 drag-and-drop,
    // then run the simulation so the WASM module actually instantiates.
    await page.dragAndDrop(".toolbox-item", ".quantum-canvas", {
      targetPosition: { x: 300, y: 200 },
    });
    await page.getByLabel("Start simulation").click();
    await page.getByLabel("Run to completion").click();

    // Amplitudes render once the WASM snapshot comes back. If CSP broke
    // WASM instantiation, the panel would fall into its error/offline
    // state instead and no entries would appear.
    await expect(page.locator(".state-entry").first()).toBeVisible({
      timeout: 15_000,
    });

    expect(violations).toEqual([]);
  });
});
