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

export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  pfpUrl: string | null;
  createdAt: string;
  bannedUntil: string | null;
  bannedReason: string | null;
  isBanned: boolean;
}

export interface AdminAction {
  id: string;
  adminId: string;
  adminUsername: string;
  action: string;
  reason: string;
  metadata: Record<string, unknown> | null;
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

export interface AdminUserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  limit: number;
}

export interface ListAdminUsersOptions {
  search?: string;
  sort?: 'joined' | 'username';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export async function listAdminUsers(options: ListAdminUsersOptions = {}): Promise<AdminUserListResponse> {
  const params = new URLSearchParams();
  if (options.search) params.set('search', options.search);
  if (options.sort) params.set('sort', options.sort);
  if (options.order) params.set('order', options.order);
  if (options.page !== undefined) params.set('page', String(options.page));
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  const res = await fetch(`/auth/admin/users?${params.toString()}`, { credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<AdminUserListResponse>;
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load users');
  }
  return {
    users: data.users ?? [],
    total: data.total ?? 0,
    page: data.page ?? 1,
    limit: data.limit ?? 20,
  };
}

export async function getAdminActions(userId: string): Promise<AdminAction[]> {
  const res = await fetch(`/auth/admin/users/${encodeURIComponent(userId)}/actions`, {
    credentials: 'include',
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; actions?: AdminAction[] };
  if (!res.ok) {
    throw new Error(data.error || 'Failed to load admin actions');
  }
  return data.actions ?? [];
}

export async function deleteUser(userId: string, reason: string): Promise<void> {
  const res = await fetch(`/auth/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to delete user');
  }
}

export type BanDuration = 7 | 30 | 365 | 0;

export async function banUser(
  userId: string,
  reason: string,
  durationDays: BanDuration,
  blacklistEmail = false
): Promise<void> {
  const res = await fetch(`/auth/admin/users/${encodeURIComponent(userId)}/ban`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, durationDays, blacklistEmail }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to ban user');
  }
}

export async function unbanUser(userId: string, reason: string, removeBlacklist = false): Promise<void> {
  const res = await fetch(`/auth/admin/users/${encodeURIComponent(userId)}/unban`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, removeBlacklist }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to unban user');
  }
}
