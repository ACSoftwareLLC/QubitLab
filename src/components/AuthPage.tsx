import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import './AuthPage.css'

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
  ready: (callback: () => void) => void;
}

interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'error-callback'?: () => void;
  'expired-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

async function fetchTurnstileSiteKey(): Promise<string | null> {
  try {
    const res = await fetch('/auth/turnstile-sitekey', { credentials: 'include' });
    const data = (await res.json()) as { siteKey: string | null };
    return data.siteKey;
  } catch {
    return null;
  }
}

export function AuthPage() {
  const navigate = useNavigate()
  const { login, register, error, clearError } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileError, setTurnstileError] = useState(false)
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const turnstileRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)
  const usernameDebounceRef = useRef<number | null>(null)

  useEffect(() => {
    fetchTurnstileSiteKey().then(setTurnstileSiteKey)
  }, [])

  useEffect(() => {
    if (!turnstileSiteKey || !turnstileRef.current || mode !== 'register') {
      return;
    }

    const renderWidget = () => {
      if (!window.turnstile || !turnstileRef.current) return;
      widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
        sitekey: turnstileSiteKey,
        theme: 'dark',
        callback: (token) => {
          setTurnstileToken(token);
          setTurnstileError(false);
        },
        'error-callback': () => {
          setTurnstileToken(null);
          setTurnstileError(true);
        },
        'expired-callback': () => {
          setTurnstileToken(null);
        },
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          clearInterval(interval);
          renderWidget();
        }
      }, 200);
      return () => clearInterval(interval);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      setTurnstileToken(null);
    };
  }, [mode, turnstileSiteKey]);

  useEffect(() => {
    if (mode !== 'register' || username.length < 3) {
      setUsernameAvailable(null)
      return
    }

    if (usernameDebounceRef.current) {
      window.clearTimeout(usernameDebounceRef.current)
    }

    setCheckingUsername(true)
    usernameDebounceRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/auth/check-username?username=${encodeURIComponent(username)}`, {
          credentials: 'include',
        })
        const data = (await res.json()) as { available: boolean }
        setUsernameAvailable(data.available)
      } catch {
        setUsernameAvailable(null)
      } finally {
        setCheckingUsername(false)
      }
    }, 400)

    return () => {
      if (usernameDebounceRef.current) {
        window.clearTimeout(usernameDebounceRef.current)
      }
    }
  }, [username, mode])

  const switchMode = (next: 'login' | 'register') => {
    setMode(next)
    clearError()
    setEmail('')
    setPassword('')
    setConfirm('')
    setTurnstileToken(null)
    setTurnstileError(false)
    setUsernameAvailable(null)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()

    if (mode === 'register' && password !== confirm) {
      return
    }

    if (mode === 'register' && usernameAvailable === false) {
      return
    }

    if (mode === 'register' && turnstileSiteKey && !turnstileToken) {
      return
    }

    const ok =
      mode === 'login'
        ? await login(username, password)
        : await register(username, email, password, turnstileToken || undefined)

    if (ok) {
      setUsername('')
      setEmail('')
      setPassword('')
      setConfirm('')
      setTurnstileToken(null)
      setUsernameAvailable(null)
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
      navigate('/')
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>QubitLab</h1>
        <p className="auth-subtitle">Sign in to design and save circuits.</p>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
            type="button"
          >
            Sign in
          </button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
            type="button"
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form active">
          <label className="auth-label" htmlFor="username">
            Username
          </label>
          <input
            id="username"
            className="auth-input"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={32}
            autoComplete="username"
          />
          {mode === 'register' && username.length >= 3 && (
            <div className="auth-username-status">
              {checkingUsername ? (
                <span className="auth-username-checking">Checking…</span>
              ) : usernameAvailable === true ? (
                <span className="auth-username-available">Username available</span>
              ) : usernameAvailable === false ? (
                <span className="auth-username-taken">Username already taken</span>
              ) : null}
            </div>
          )}

          {mode === 'register' && (
            <>
              <label className="auth-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </>
          )}

          <label className="auth-label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            className="auth-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {mode === 'register' && (
            <>
              <label className="auth-label" htmlFor="confirm">
                Confirm password
              </label>
              <input
                id="confirm"
                className="auth-input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />

              {turnstileSiteKey && (
                <div className="auth-turnstile">
                  <div ref={turnstileRef} />
                  {turnstileError && (
                    <div className="auth-message error">Verification failed. Please try again.</div>
                  )}
                </div>
              )}
            </>
          )}

          <button className="auth-submit" type="submit">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {error && (
          <div className="auth-message error">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
