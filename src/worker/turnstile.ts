import type { HonoContext } from './types.js';

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
};

function isLocalhost(c: HonoContext): boolean {
  const host = c.req.header('host') ?? '';
  return /^(localhost|127\.0\.0\.1|::1)(:\d+)?$/i.test(host);
}

// Turnstile is required whenever both keys are configured. If keys are missing,
// verification is skipped only in local development; production deployments
// without keys fail closed.
export function shouldRequireTurnstile(c: HonoContext): boolean {
  const siteKey = c.env.TURNSTILE_SITE_KEY?.trim();
  const secretKey = c.env.TURNSTILE_SECRET_KEY?.trim();
  if (siteKey && secretKey) {
    return true;
  }
  return !isLocalhost(c);
}

export async function verifyTurnstileToken(
  c: HonoContext,
  token: string
): Promise<boolean> {
  const secretKey = c.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    // No secret key: fail closed. The caller decides whether to enforce.
    return false;
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: secretKey, response: token }),
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as TurnstileVerifyResponse;
    return data.success === true;
  } catch {
    // Network or parsing error: fail closed.
    return false;
  }
}