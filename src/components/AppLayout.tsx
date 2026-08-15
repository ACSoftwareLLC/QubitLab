import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEditorActions } from '../context/EditorActionsContext';
import { SaveCircuitModal } from './SaveCircuitModal';
import { AdminBadge } from './AdminBadge';
import './AuthPage.css';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { actions } = useEditorActions();
  const [saveOpen, setSaveOpen] = useState(false);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--auth-bg)' }}>
      <header className="app-header">
        <div className="app-header-left">
          <Link to="/" className="app-title" style={{ textDecoration: 'none', color: 'inherit' }}>
            QubitLab
          </Link>
          <nav className="app-nav">
            <NavLink to="/" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`} end>
              Home
            </NavLink>
            {user && (
              <NavLink to="/editor" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
                Editor
              </NavLink>
            )}
            {user && (
              <NavLink to="/circuits" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
                My Circuits
              </NavLink>
            )}
            <NavLink to="/community" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
              Community
            </NavLink>
            <NavLink to="/blog" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
              Blog
            </NavLink>
            <NavLink to="/patch-notes" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
              Patch notes
            </NavLink>
            {user && (
              <NavLink to="/account" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
                Account
              </NavLink>
            )}
            {user?.isAdmin && (
              <NavLink to="/admin/analytics" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
                Analytics
              </NavLink>
            )}
            {user?.isAdmin && (
              <NavLink to="/admin/users" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
                Users
              </NavLink>
            )}
          </nav>
        </div>
        <div className="app-header-right">
          {actions && user && (
            <button className="app-save-button" onClick={() => setSaveOpen(true)}>
              Save circuit
            </button>
          )}
          {user && (
            <NavLink to="/account" className="app-user-chip">
              {user.pfpUrl ? (
                <img className="app-avatar" src={user.pfpUrl} alt="" />
              ) : (
                <span className="app-avatar app-avatar-fallback">
                  {user.username.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="app-username">@{user.username}</span>
              {user.isAdmin && <AdminBadge />}
            </NavLink>
          )}
          {user ? (
            <button className="app-logout-button" onClick={() => logout()}>
              Logout
            </button>
          ) : (
            <NavLink to="/login" className="app-save-button">
              Sign in
            </NavLink>
          )}
        </div>
      </header>

      <Outlet />

      <footer className="app-footer">
        <span>© {new Date().getFullYear()} QubitLab</span>
        <div className="app-footer-links">
          <Link to="/privacy">Privacy Policy</Link>
        </div>
      </footer>

      {saveOpen && actions && <SaveCircuitModal onClose={() => setSaveOpen(false)} />}
    </div>
  );
}
