import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listAdminUsers,
  getAdminActions,
  deleteUser,
  banUser,
  unbanUser,
  type AdminUser,
  type AdminAction,
  type BanDuration,
} from '../api/users';
import './UserManagementPage.css';

const BAN_OPTIONS: { label: string; value: BanDuration }[] = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '365 days', value: 365 },
  { label: 'Permanent', value: 0 },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  if (iso.startsWith('9999')) return 'Permanent';
  return new Date(iso).toLocaleString();
}

function formatAction(action: string): string {
  return action
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function ActionRow({ action }: { action: AdminAction }) {
  return (
    <div className="uma-action">
      <div className="uma-action-header">
        <span className={`uma-action-badge ${action.action}`}>{formatAction(action.action)}</span>
        <span className="uma-action-time">{formatDate(action.createdAt)}</span>
      </div>
      <div className="uma-action-meta">
        by {action.adminUsername ? `@${action.adminUsername}` : 'unknown admin'}
      </div>
      <p className="uma-action-reason">{action.reason}</p>
    </div>
  );
}

function DeleteModal({
  user,
  onClose,
  onDeleted,
}: {
  user: AdminUser;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (confirmText !== user.username) {
      setError(`Type "${user.username}" to confirm deletion`);
      return;
    }
    setBusy(true);
    try {
      await deleteUser(user.id, reason.trim() || 'No reason provided');
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uma-modal-backdrop" onClick={onClose}>
      <div className="uma-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="uma-modal-title">
          <i className="bi bi-exclamation-triangle" /> Delete @{user.username}
        </h2>
        <p className="uma-modal-warning">
          This will permanently delete the account, all circuits, sessions, and uploaded images.
          Blogs authored by this user will remain but become orphaned.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="uma-label" htmlFor="delete-reason">
            Reason for deletion
          </label>
          <textarea
            id="delete-reason"
            className="uma-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Repeated spam after warnings"
            required
            rows={3}
          />

          <label className="uma-label" htmlFor="delete-confirm">
            Type <strong>@{user.username}</strong> to confirm
          </label>
          <input
            id="delete-confirm"
            className="uma-input"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            required
            autoComplete="off"
          />

          {error && <div className="uma-error">{error}</div>}

          <div className="uma-modal-actions">
            <button type="button" className="uma-button secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="uma-button danger" disabled={busy}>
              {busy ? 'Deleting…' : 'Delete user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BanModal({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState('');
  const [duration, setDuration] = useState<BanDuration>(7);
  const [blacklistEmail, setBlacklistEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await banUser(user.id, reason.trim() || 'No reason provided', duration, blacklistEmail);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ban failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uma-modal-backdrop" onClick={onClose}>
      <div className="uma-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="uma-modal-title">
          <i className="bi bi-slash-circle" /> Ban @{user.username}
        </h2>
        <p className="uma-modal-subtitle">Banned users cannot share circuits to the community.</p>
        <form onSubmit={handleSubmit}>
          <label className="uma-label">Ban duration</label>
          <div className="uma-duration-grid">
            {BAN_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`uma-duration-option ${duration === opt.value ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="ban-duration"
                  value={opt.value}
                  checked={duration === opt.value}
                  onChange={() => setDuration(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>

          <label className="uma-label" htmlFor="ban-reason">
            Reason
          </label>
          <textarea
            id="ban-reason"
            className="uma-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Harassment and abuse"
            required
            rows={3}
          />

          <label className="uma-checkbox">
            <input
              type="checkbox"
              checked={blacklistEmail}
              onChange={(e) => setBlacklistEmail(e.target.checked)}
            />
            <span>Blacklist email address{user.email ? ` (${user.email})` : ''}</span>
          </label>
          <p className="uma-hint">Email addresses containing &quot;abuse&quot; in the reason are blacklisted automatically.</p>

          {error && <div className="uma-error">{error}</div>}

          <div className="uma-modal-actions">
            <button type="button" className="uma-button secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="uma-button danger" disabled={busy}>
              {busy ? 'Banning…' : 'Ban user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UnbanModal({
  user,
  onClose,
  onChanged,
}: {
  user: AdminUser;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [reason, setReason] = useState('');
  const [removeBlacklist, setRemoveBlacklist] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await unbanUser(user.id, reason.trim() || 'No reason provided', removeBlacklist);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unban failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uma-modal-backdrop" onClick={onClose}>
      <div className="uma-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="uma-modal-title">
          <i className="bi bi-check-circle" /> Unban @{user.username}
        </h2>
        <form onSubmit={handleSubmit}>
          <label className="uma-label" htmlFor="unban-reason">
            Reason
          </label>
          <textarea
            id="unban-reason"
            className="uma-textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Appeal accepted"
            required
            rows={3}
          />

          <label className="uma-checkbox">
            <input
              type="checkbox"
              checked={removeBlacklist}
              onChange={(e) => setRemoveBlacklist(e.target.checked)}
            />
            <span>Remove email from blacklist{user.email ? ` (${user.email})` : ''}</span>
          </label>

          {error && <div className="uma-error">{error}</div>}

          <div className="uma-modal-actions">
            <button type="button" className="uma-button secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="uma-button primary" disabled={busy}>
              {busy ? 'Unbanning…' : 'Unban user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const PER_PAGE_OPTIONS = [10, 20, 50, 100];

type SortMode = 'joined' | 'username';

function getPaginationItems(current: number, total: number): (number | string)[] {
  if (total <= 1) return [];
  const items: (number | string)[] = [];
  const delta = 1;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);

  items.push(1);
  if (left > 2) items.push('...');
  for (let i = left; i <= right; i += 1) {
    items.push(i);
  }
  if (right < total - 1) items.push('...');
  if (total > 1) items.push(total);
  return items;
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const items = getPaginationItems(page, totalPages);
  return (
    <div className="uma-pagination">
      <button
        type="button"
        className="uma-page-button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        <i className="bi bi-chevron-left" />
      </button>
      {items.map((item, idx) =>
        typeof item === 'number' ? (
          <button
            key={idx}
            type="button"
            className={`uma-page-button ${item === page ? 'active' : ''}`}
            onClick={() => onPageChange(item)}
            aria-label={`Page ${item}`}
            aria-current={item === page ? 'page' : undefined}
          >
            {item}
          </button>
        ) : (
          <span key={idx} className="uma-page-ellipsis">
            {item}
          </span>
        )
      )}
      <button
        type="button"
        className="uma-page-button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        <i className="bi bi-chevron-right" />
      </button>
    </div>
  );
}

export function UserManagementPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState<SortMode>('joined');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [modal, setModal] = useState<'delete' | 'ban' | 'unban' | null>(null);
  const searchTimer = useRef<number | null>(null);

  const order: 'asc' | 'desc' = sort === 'joined' ? 'desc' : 'asc';
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const fetchUsers = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await listAdminUsers({
        search: debouncedQuery.trim() || undefined,
        sort,
        order,
        page,
        limit,
      });
      if (result.total > 0 && result.page > Math.max(1, Math.ceil(result.total / result.limit))) {
        setPage(Math.max(1, Math.ceil(result.total / result.limit)));
      } else {
        setUsers(result.users);
        setTotal(result.total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, sort, order, page, limit]);

  useEffect(() => {
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
    }
    searchTimer.current = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [query, sort, limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!selected) {
      setActions([]);
      return;
    }
    let cancelled = false;
    setActionsLoading(true);
    getAdminActions(selected.id)
      .then((rows) => {
        if (cancelled) return;
        setActions(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setActions([]);
        setError(err instanceof Error ? err.message : 'Failed to load actions');
      })
      .finally(() => {
        if (!cancelled) setActionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const handleActionComplete = () => {
    const completedModal = modal;
    setModal(null);
    if (completedModal === 'delete') {
      setSelected(null);
    }
    fetchUsers();
    if (selected && completedModal !== 'delete') {
      getAdminActions(selected.id).then(setActions).catch(() => {});
    }
  };

  const handleSortToggle = () => {
    setSort((prev) => (prev === 'joined' ? 'username' : 'joined'));
  };

  const showingStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const showingEnd = Math.min(page * limit, total);

  const selectedActions = useMemo(() => {
    return actions;
  }, [actions]);

  if (!user?.isAdmin) {
    return (
      <div className="uma-page">
        <div className="uma-content">
          <div className="uma-empty-state">Only admins can manage users.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="uma-page">
      <div className="uma-content">
        <div className="uma-header">
          <div>
            <h1 className="uma-title">
              <i className="bi bi-people-gear" /> User management
            </h1>
            <p className="uma-subtitle">Search, ban, delete, and review administrative actions.</p>
          </div>
        </div>

        <div className="uma-search-row">
          <i className="bi bi-search uma-search-icon" />
          <input
            className="uma-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by username or email…"
            autoComplete="off"
          />
          {query && (
            <button className="uma-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
              <i className="bi bi-x-lg" />
            </button>
          )}
        </div>

        {error && (
          <div className="uma-error-banner">
            <i className="bi bi-exclamation-triangle" /> {error}
          </div>
        )}

        <div className="uma-toolbar">
          <div className="uma-toolbar-left">
            <span className="uma-toolbar-label">Sort by</span>
            <button
              type="button"
              className="uma-button secondary"
              onClick={handleSortToggle}
              aria-label={sort === 'joined' ? 'Switch to alphabetical order' : 'Switch to recent signups'}
            >
              {sort === 'joined' ? (
                <>
                  <i className="bi bi-clock-history" /> Recent signups
                </>
              ) : (
                <>
                  <i className="bi bi-sort-alpha-down" /> Alphabetical
                </>
              )}
            </button>
          </div>
          <div className="uma-toolbar-right">
            <label className="uma-toolbar-label">
              Show
              <select
                className="uma-select"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                aria-label="Results per page"
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              per page
            </label>
            <span className="uma-total-text">
              Showing {showingStart}–{showingEnd} of {total} user{total !== 1 ? 's' : ''}
            </span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>

        <div className="uma-layout">
          <div className="uma-main">
            {loading && users.length === 0 && (
              <div className="uma-empty-state">
                <span className="uma-spinner" aria-hidden="true" /> Loading users…
              </div>
            )}

            {!loading && users.length === 0 && (
              <div className="uma-empty-state">
                {debouncedQuery.trim()
                  ? `No users found matching "${debouncedQuery}".`
                  : 'No users found.'}
              </div>
            )}

            {users.length > 0 && (
              <div className="uma-table-wrap">
                <table className="uma-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Email</th>
                      <th>Joined</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        className={selected?.id === u.id ? 'selected' : ''}
                        onClick={() => setSelected(u)}
                      >
                        <td>
                          <div className="uma-user-cell">
                            {u.pfpUrl ? (
                              <img className="uma-avatar" src={u.pfpUrl} alt="" />
                            ) : (
                              <span className="uma-avatar uma-avatar-fallback">
                                {u.username.charAt(0).toUpperCase()}
                              </span>
                            )}
                            <span className="uma-username">@{u.username}</span>
                          </div>
                        </td>
                        <td className="uma-email">{u.email || '—'}</td>
                        <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                        <td>
                          {u.isBanned ? (
                            <span className="uma-status banned">
                              Banned {u.bannedUntil?.startsWith('9999') ? 'permanently' : 'until ' + formatDate(u.bannedUntil)}
                            </span>
                          ) : (
                            <span className="uma-status active">Active</span>
                          )}
                        </td>
                        <td>
                          <div className="uma-row-actions">
                            <button
                              className="uma-icon-button"
                              title="View action history"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(u);
                              }}
                            >
                              <i className="bi bi-clock-history" />
                            </button>
                            {u.isBanned ? (
                              <button
                                className="uma-icon-button success"
                                title="Unban user"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(u);
                                  setModal('unban');
                                }}
                              >
                                <i className="bi bi-check-circle" />
                              </button>
                            ) : (
                              <button
                                className="uma-icon-button danger"
                                title="Ban user"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelected(u);
                                  setModal('ban');
                                }}
                              >
                                <i className="bi bi-slash-circle" />
                              </button>
                            )}
                            <button
                              className="uma-icon-button danger"
                              title="Delete user"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(u);
                                setModal('delete');
                              }}
                            >
                              <i className="bi bi-trash" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="uma-sidebar">
            <h2 className="uma-sidebar-title">
              <i className="bi bi-clock-history" /> Action history
            </h2>
            {selected ? (
              <>
                <div className="uma-sidebar-user">
                  {selected.pfpUrl ? (
                    <img className="uma-avatar" src={selected.pfpUrl} alt="" />
                  ) : (
                    <span className="uma-avatar uma-avatar-fallback">
                      {selected.username.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div>
                    <div className="uma-username">@{selected.username}</div>
                    <div className="uma-sidebar-email">{selected.email || 'No email'}</div>
                  </div>
                </div>
                {actionsLoading ? (
                  <div className="uma-empty-state">
                    <span className="uma-spinner" aria-hidden="true" /> Loading…
                  </div>
                ) : selectedActions.length === 0 ? (
                  <div className="uma-empty-state small">No administrative actions recorded.</div>
                ) : (
                  <div className="uma-action-list">
                    {selectedActions.map((action) => (
                      <ActionRow key={action.id} action={action} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="uma-empty-state small">Select a user to view their action history.</div>
            )}
          </aside>
        </div>
      </div>

      {selected && modal === 'delete' && (
        <DeleteModal user={selected} onClose={() => setModal(null)} onDeleted={handleActionComplete} />
      )}
      {selected && modal === 'ban' && (
        <BanModal user={selected} onClose={() => setModal(null)} onChanged={handleActionComplete} />
      )}
      {selected && modal === 'unban' && (
        <UnbanModal user={selected} onClose={() => setModal(null)} onChanged={handleActionComplete} />
      )}
    </div>
  );
}
