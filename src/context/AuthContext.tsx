import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export interface User {
  id: string;
  username: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const authFetch = async (
  method: string,
  path: string,
  body?: Record<string, unknown>
) => {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; user?: User };
  return { ok: res.ok, data };
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const { ok, data } = await authFetch('GET', '/auth/me');
      if (ok && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const login = useCallback(async (username: string, password: string) => {
    const { ok, data } = await authFetch('POST', '/auth/login', { username, password });
    if (ok && data.user) {
      setUser(data.user);
      setError(null);
      return true;
    }
    setError(data.error || 'Login failed');
    return false;
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const { ok, data } = await authFetch('POST', '/auth/register', { username, password });
    if (ok && data.user) {
      setUser(data.user);
      setError(null);
      return true;
    }
    setError(data.error || 'Registration failed');
    return false;
  }, []);

  const logout = useCallback(async () => {
    await authFetch('POST', '/auth/logout');
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{ user, loading, error, login, register, logout, clearError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
