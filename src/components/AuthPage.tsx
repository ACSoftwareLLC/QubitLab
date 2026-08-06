import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.tsx'
import './AuthPage.css'

export function AuthPage() {
  const navigate = useNavigate()
  const { login, register, error, clearError } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')

  const switchMode = (next: 'login' | 'register') => {
    setMode(next)
    clearError()
    setPassword('')
    setConfirm('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    clearError()

    if (mode === 'register' && password !== confirm) {
      return
    }

    const ok =
      mode === 'login'
        ? await login(username, password)
        : await register(username, password)

    if (ok) {
      setUsername('')
      setPassword('')
      setConfirm('')
      navigate('/')
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>Quantum DnD</h1>
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
