export interface PublicUserProfile {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  displayName: string;
  pfpUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
}

export async function getUserProfile(username: string): Promise<PublicUserProfile> {
  const res = await fetch(`/auth/users/${encodeURIComponent(username)}`, {
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    user?: PublicUserProfile;
  };
  if (!res.ok || !data.user) {
    throw new Error(data.error || 'Failed to load user profile');
  }
  return data.user;
}
