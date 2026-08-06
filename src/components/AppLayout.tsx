import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEditorActions } from '../context/EditorActionsContext';
import { SaveCircuitModal } from './SaveCircuitModal';
import './AuthPage.css';

export function AppLayout() {
  const { user, logout } = useAuth();
  const { actions } = useEditorActions();
  const [saveOpen, setSaveOpen] = useState(false);

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--auth-bg)' }}>
      <header className="app-header">
        <div className="app-header-left">
          <h2 className="app-title">Quantum DnD</h2>
          <nav className="app-nav">
            <NavLink to="/editor" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
              Editor
            </NavLink>
            <NavLink to="/circuits" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
              My Circuits
            </NavLink>
            <NavLink to="/marketplace" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
              Marketplace
            </NavLink>
            <NavLink to="/account" className={({ isActive }) => `app-nav-link ${isActive ? 'active' : ''}`}>
              Account
            </NavLink>
          </nav>
        </div>
        <div className="app-header-right">
          {actions && (
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
            </NavLink>
          )}
          <button className="app-logout-button" onClick={() => logout()}>
            Logout
          </button>
        </div>
      </header>

      <Outlet />

      {saveOpen && actions && <SaveCircuitModal onClose={() => setSaveOpen(false)} />}
    </div>
  );
}
