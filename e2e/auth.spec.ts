import { test, expect } from '@playwright/test';

/**
 * These tests rely on the dev seed accounts from `npm run db:seed:dev`.
 * The default dev credentials are:
 *   devadmin / devpassword
 *   devuser / devpassword
 */
const DEV_USERNAME = process.env.QUBITLAB_DEV_USERNAME ?? 'devuser';
const DEV_PASSWORD = process.env.QUBITLAB_DEV_PASSWORD ?? 'devpassword';

test.describe('authenticated smoke tests', () => {
  test('login with seeded dev account returns a user and sets a cookie', async ({ request }) => {
    const response = await request.post('/auth/login', {
      data: {
        username: DEV_USERNAME,
        password: DEV_PASSWORD,
      },
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.user.username).toBe(DEV_USERNAME);

    const setCookie = response.headers()['set-cookie'];
    expect(setCookie).toContain('sessionId=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
  });

  test('session persists across /auth/me requests', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    const loginResponse = await page.request.post('/auth/login', {
      data: {
        username: DEV_USERNAME,
        password: DEV_PASSWORD,
      },
    });
    expect(loginResponse.status()).toBe(200);

    const meResponse = await page.request.get('/auth/me');
    expect(meResponse.status()).toBe(200);
    const meBody = await meResponse.json();
    expect(meBody.user.username).toBe(DEV_USERNAME);

    await context.close();
  });

  test('circuit list is reachable for authenticated users', async ({ request }) => {
    await request.post('/auth/login', {
      data: {
        username: DEV_USERNAME,
        password: DEV_PASSWORD,
      },
    });

    const response = await request.get('/auth/circuits');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.circuits)).toBe(true);
  });
});
