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
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileError, setTurnstileError] = useState(false)
  const turnstileRef = useRef<HTMLDivElement | null>(null)
  const widgetIdRef = useRef<string | null>(null)

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

  const switchMode = (next: 'login' | 'register') => {
    setMode(next)
    clearError()
    setPassword('')
    setConfirm('')
    setTurnstileToken(null)
    setTurnstileError(false)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()

    if (mode === 'register' && password !== confirm) {
      return
    }

    if (mode === 'register' && turnstileSiteKey && !turnstileToken) {
      return
    }

    const ok =
      mode === 'login'
        ? await login(username, password)
        : await register(username, password, turnstileToken || undefined)

    if (ok) {
      setUsername('')
      setPassword('')
      setConfirm('')
      setTurnstileToken(null)
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
