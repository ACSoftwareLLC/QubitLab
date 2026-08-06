import type { HonoContext } from './types.js';

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
};

export async function verifyTurnstileToken(
  c: HonoContext,
  token: string
): Promise<boolean> {
  const secretKey = c.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    // In development, if no secret key is configured, skip verification.
    return true;
  }

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
}
