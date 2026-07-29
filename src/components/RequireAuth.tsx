import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { AuthPage } from './AuthPage';

/**
 * Shows the login screen in place when logged out (no /login redirect —
 * preserves the app's previous behavior).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <AuthPage />;
  return <>{children}</>;
}
