import { config } from '../config.js';

export function pfpUrlFor(userId: string, pfpKey: string | null): string | null {
  return pfpKey ? `/auth/users/${userId}/avatar` : null;
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

export interface PublicUserData {
  id: string;
  username: string;
  pfpUrl: string | null;
  isAdmin: boolean;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  displayName: string;
  createdAt?: string;
}

export function publicUser(u: {
  id: string;
  username: string;
  pfp_key: string | null;
  first_name?: string | null;
  last_name?: string | null;
  bio?: string | null;
  created_at?: string | null;
}): PublicUserData {
  const firstName = u.first_name ?? null;
  const lastName = u.last_name ?? null;
  const bio = u.bio ?? null;
  const data: PublicUserData = {
    id: u.id,
    username: u.username,
    pfpUrl: pfpUrlFor(u.id, u.pfp_key),
    isAdmin: config.admins.includes(u.username),
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
