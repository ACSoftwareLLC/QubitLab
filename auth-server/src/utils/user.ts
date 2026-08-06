import { config } from '../config.js';

export function pfpUrlFor(userId: string, pfpKey: string | null): string | null {
  return pfpKey ? `/auth/users/${userId}/avatar` : null;
}

export function publicUser(u: { id: string; username: string; pfp_key: string | null }) {
  return {
    id: u.id,
    username: u.username,
    pfpUrl: pfpUrlFor(u.id, u.pfp_key),
    isAdmin: config.admins.includes(u.username),
  };
}
