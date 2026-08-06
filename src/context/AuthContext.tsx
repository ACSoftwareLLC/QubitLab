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
  firstName: string | null;
  lastName: string | null;
  bio: string | null;
  displayName: string;
  pfpUrl: string | null;
  isAdmin: boolean;
}

interface ProfileBody extends Record<string, string | null | undefined> {
  firstName?: string | null;
  lastName?: string | null;
  bio?: string | null;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, password: string, turnstileToken?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateUsername: (username: string) => Promise<string | null>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<string | null>;
  updateProfile: (body: ProfileBody) => Promise<string | null>;
  uploadAvatar: (file: File) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const authFetch = async (
  method: string,
  path: string,
  body?: Record<string, unknown> | FormData
) => {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const res = await fetch(path, {
    method,
    credentials: 'include',
    // FormData sets its own multipart Content-Type (with boundary) — never override it.
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; user?: User };
  return { ok: res.ok, status: res.status, data };
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

  const register = useCallback(async (username: string, password: string, turnstileToken?: string) => {
    const { ok, data } = await authFetch('POST', '/auth/register', { username, password, turnstileToken });
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

  // Account mutators return an error message on failure, null on success.
  const updateUsername = useCallback(async (username: string) => {
    const { ok, status, data } = await authFetch('PATCH', '/auth/account/username', { username });
    if (status === 401) {
      setUser(null);
      return 'Session expired';
    }
    if (ok && data.user) {
      setUser(data.user);
      return null;
    }
    return data.error || 'Failed to update username';
  }, []);

  const updatePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const { ok, status, data } = await authFetch('PATCH', '/auth/account/password', {
      currentPassword,
      newPassword,
    });
    if (status === 401) {
      setUser(null);
      return 'Session expired';
    }
    if (ok) return null;
    return data.error || 'Failed to update password';
  }, []);

  const updateProfile = useCallback(async (body: ProfileBody) => {
    const { ok, status, data } = await authFetch('PATCH', '/auth/account/profile', body);
    if (status === 401) {
      setUser(null);
      return 'Session expired';
    }
    if (ok && data.user) {
      setUser(data.user);
      return null;
    }
    return data.error || 'Failed to update profile';
  }, []);

  const uploadAvatar = useCallback(async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    const { ok, status, data } = await authFetch('POST', '/auth/account/avatar', form);
    if (status === 401) {
      setUser(null);
      return 'Session expired';
    }
    if (ok && data.user) {
      setUser(data.user);
      return null;
    }
    return data.error || 'Failed to upload avatar';
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        register,
        logout,
        clearError,
        updateUsername,
        updatePassword,
        updateProfile,
        uploadAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
