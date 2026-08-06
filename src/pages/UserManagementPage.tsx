import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  searchAdminUsers,
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

export function UserManagementPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [actions, setActions] = useState<AdminAction[]>([]);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [modal, setModal] = useState<'delete' | 'ban' | 'unban' | null>(null);
  const searchTimer = useRef<number | null>(null);

  const performSearch = useCallback(async (term: string) => {
    setError(null);
    if (!term.trim()) {
      setUsers([]);
      return;
    }
    setLoading(true);
    try {
      const results = await searchAdminUsers(term.trim(), 20);
      setUsers(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchTimer.current) {
      window.clearTimeout(searchTimer.current);
    }
    searchTimer.current = window.setTimeout(() => {
      performSearch(query);
    }, 250);
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
  }, [query, performSearch]);

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
    setModal(null);
    if (selected) {
      performSearch(query);
      getAdminActions(selected.id).then(setActions).catch(() => {});
    }
  };

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

        <div className="uma-layout">
          <div className="uma-main">
            {loading && users.length === 0 && (
              <div className="uma-empty-state">
                <span className="uma-spinner" aria-hidden="true" /> Searching…
              </div>
            )}

            {!loading && query.trim() && users.length === 0 && (
              <div className="uma-empty-state">No users found matching &quot;{query}&quot;.</div>
            )}

            {!query.trim() && users.length === 0 && (
              <div className="uma-empty-state">Start typing a username or email to search.</div>
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
