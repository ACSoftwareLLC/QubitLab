import type { Context } from 'hono';

export type WorkerBindings = {
  DB: D1Database;
  AVATARS: R2Bucket;
  THUMBNAILS: R2Bucket;
  SESSION_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  TURNSTILE_SITE_KEY: string;
  ADMINS: string;
  DISABLE_RATE_LIMIT?: string;
};

export type SessionUser = {
  id: string;
  username: string;
  pfp_key: string | null;
  first_name: string | null;
  last_name: string | null;
  bio: string | null;
  isAdmin: boolean;
};

export type HonoEnv = {
  Bindings: WorkerBindings;
  Variables: {
    user: SessionUser | null;
  };
};

export type HonoContext = Context<HonoEnv>;

export type PublicUserData = {
  id: string;
  username: string;
  pfpUrl: string | null;
  isAdmin: boolean;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  displayName: string;
  createdAt?: string;
};

export function publicUser(
  u: {
    id: string;
    username: string;
    pfp_key: string | null;
    first_name?: string | null;
    last_name?: string | null;
    bio?: string | null;
    created_at?: string | null;
  },
  admins: string
): PublicUserData {
  const firstName = u.first_name ?? null;
  const lastName = u.last_name ?? null;
  const bio = u.bio ?? null;
  const adminList = admins.split(',').map((s) => s.trim()).filter(Boolean);
  const data: PublicUserData = {
    id: u.id,
    username: u.username,
    pfpUrl: u.pfp_key ? `/auth/users/${u.id}/avatar` : null,
    isAdmin: adminList.includes(u.username),
    firstName,
    lastName,
    bio,
    displayName: displayNameFor({ username: u.username, first_name: firstName, last_name: lastName }),
  };
  if (u.created_at) {
    data.createdAt = u.created_at;
  }
  return data;
}

export function displayNameFor(u: {
  username: string;
  first_name: string | null;
  last_name: string | null;
}): string {
  const first = u.first_name?.trim();
  const last = u.last_name?.trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  return u.username;
}
