import type { HonoContext } from "./types.js";

type TurnstileVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
};

function isLocalhost(c: HonoContext): boolean {
  const host = c.req.header("host") ?? "";
  return /^(localhost|127\.0\.0\.1|::1)(:\d+)?$/i.test(host);
}

// Turnstile is required when a site key is configured, unless explicitly skipped.
// If no site key is present, verification is skipped only in local development;
// production deployments without keys fail closed.
export function shouldRequireTurnstile(c: HonoContext): boolean {
  if (c.env.TURNSTILE_SKIP_VERIFICATION === "true") {
    return false;
  }
  const siteKey = c.env.TURNSTILE_SITE_KEY?.trim();
  if (siteKey) {
    return true;
  }
  return !isLocalhost(c);
}

export async function verifyTurnstileToken(
  c: HonoContext,
  token: string,
): Promise<boolean> {
  // Explicitly skip verification if the bypass flag is set.
  if (c.env.TURNSTILE_SKIP_VERIFICATION === "true") {
    return true;
  }

  const secretKey = c.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    // Fail closed if keys are expected but not provided.
    return false;
  }

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: secretKey, response: token }),
      },
    );

    if (!response.ok) {
      console.error(
        `[turnstile] siteverify HTTP ${response.status} for ${c.req.path}`,
      );
      return false;
    }

    const data = (await response.json()) as TurnstileVerifyResponse;
    if (data.success !== true) {
      // error-codes name the actual cause (invalid-input-secret = secret/widget
      // mismatch, bad hostname = widget allowlist missing the origin, etc.)
      console.error(
        `[turnstile] verification failed for ${c.req.path}:`,
        JSON.stringify(data["error-codes"] ?? []),
      );
    }
    return data.success === true;
  } catch (err) {
    // Fail closed on network errors.
    console.error(
      `[turnstile] siteverify request threw for ${c.req.path}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
