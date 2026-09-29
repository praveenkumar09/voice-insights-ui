import { useState, type CSSProperties, type FormEvent } from 'react'
import { ThemeToggle } from '../components/ThemeToggle'
import type { Theme } from '../hooks/useTheme'

type Mode = 'login' | 'signup' | 'forgot'

interface Props {
  onLogin: (email: string, password: string) => Promise<void>
  onSignup: (email: string, password: string) => Promise<void>
  onResetPassword: (email: string, newPassword: string, confirmPassword: string) => Promise<void>
  theme: Theme
  onToggleTheme: () => void
}

const MIN_PASSWORD_LENGTH = 5

const TITLES: Record<Mode, string> = {
  login: 'Welcome back',
  signup: 'Create your account',
  forgot: 'Reset your password',
}

const SUBMIT_LABELS: Record<Mode, string> = {
  login: 'Sign in',
  signup: 'Sign up',
  forgot: 'Reset password',
}

/** Staggered reveal delay for the nth element in the card's entrance cascade. */
function delay(step: number): CSSProperties {
  return { animationDelay: `${0.05 + step * 0.06}s` }
}

export function LoginScreen({ onLogin, onSignup, onResetPassword, theme, onToggleTheme }: Props) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [success, setSuccess] = useState(false)
  const [resetNotice, setResetNotice] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setSuccess(false)
    setResetNotice(false)
    setPassword('')
    setConfirmPassword('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }
    if (mode === 'forgot' && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'login') await onLogin(email, password)
      else if (mode === 'signup') await onSignup(email, password)
      else {
        await onResetPassword(email, password, confirmPassword)
        setSuccess(true)
        window.setTimeout(() => {
          setSuccess(false)
          setBusy(false)
          setMode('login')
          setPassword('')
          setConfirmPassword('')
          setResetNotice(true)
        }, 550)
        return
      }
      // Login/signup unmount this screen once the session is set; flash the check first.
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-screen__overlay" />
      <ThemeToggle theme={theme} onToggle={onToggleTheme} className="auth-screen__theme" />

      <div className="auth-card">
        <div className="auth-card__inner" key={mode}>
          <h2 className="auth-stagger" style={delay(0)}>
            {TITLES[mode]}
          </h2>

          {resetNotice && mode === 'login' && (
            <p className="auth-card__notice auth-stagger" style={delay(1)}>
              Password reset — sign in with your new password.
            </p>
          )}

          <form className="auth-form" onSubmit={handleSubmit}>
            <label className="auth-field auth-stagger" style={delay(2)}>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>

            <label className="auth-field auth-stagger" style={delay(3)}>
              <span>{mode === 'forgot' ? 'New password' : 'Password'}</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 5 characters"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            {mode === 'forgot' && (
              <label className="auth-field auth-stagger" style={delay(4)}>
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                />
              </label>
            )}

            {error && (
              <p className="auth-form__error auth-stagger" style={delay(0)}>
                {error}
              </p>
            )}

            <button
              type="submit"
              className={`auth-submit${success ? ' is-success' : ''} auth-stagger`}
              style={delay(mode === 'forgot' ? 5 : 4)}
              disabled={busy}
            >
              {success ? (
                <svg className="auth-submit__check" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8">
                  <path d="M5 12.5 10 17 19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : busy ? (
                'Please wait…'
              ) : (
                SUBMIT_LABELS[mode]
              )}
            </button>
          </form>

          <div className="auth-links auth-stagger" style={delay(mode === 'forgot' ? 6 : 5)}>
            {mode === 'login' && (
              <>
                <button type="button" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
                <button type="button" onClick={() => switchMode('signup')}>
                  Don&rsquo;t have an account? Sign up
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button type="button" onClick={() => switchMode('login')}>
                Already have an account? Sign in
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" onClick={() => switchMode('login')}>
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
