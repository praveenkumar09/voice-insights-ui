import { useState } from 'react'
import { AdminRunDetailScreen } from './screens/AdminRunDetailScreen'
import { AdminScreen } from './screens/AdminScreen'
import { CaptureScreen } from './screens/CaptureScreen'
import { LoginScreen } from './screens/LoginScreen'
import { OrchestrationScreen } from './screens/OrchestrationScreen'
import { ThemeToggle } from './components/ThemeToggle'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'

type View =
  | { name: 'capture' }
  | { name: 'orchestration'; customerId: string }
  | { name: 'admin' }
  | { name: 'admin-detail'; runId: string }

export default function App() {
  const [view, setView] = useState<View>({ name: 'capture' })
  const inAdmin = view.name === 'admin' || view.name === 'admin-detail'
  const auth = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="app-shell">
      <header className={`app-header${auth.isAuthenticated ? '' : ' app-header--hidden'}`}>
        <div className="app-header__brand">
          <img className="app-header__logo" src="/aia-voice-insights-logo.png" alt="AIA Voice Insights" />
          <div className="app-header__text">
            <h1>Voice Insights</h1>
            <p>Live conversation &rarr; agentic product recommendations</p>
          </div>
        </div>
        {auth.isAuthenticated && (
          <div className="app-header__actions">
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button
              className="app-header__admin-link"
              onClick={() => (inAdmin ? setView({ name: 'capture' }) : setView({ name: 'admin' }))}
            >
              {inAdmin ? '← Back to Home' : 'Admin'}
            </button>
            <button className="app-header__admin-link" onClick={auth.logout}>
              Log out<span className="app-header__email"> ({auth.email})</span>
            </button>
          </div>
        )}
      </header>

      <main className="app-main">
        {auth.checking && <p className="capture-screen__hint">Loading&hellip;</p>}

        {!auth.checking && !auth.isAuthenticated && (
          <LoginScreen
            onLogin={auth.login}
            onSignup={auth.signup}
            onResetPassword={auth.resetPassword}
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        )}

        {!auth.checking && auth.isAuthenticated && (
          <>
            {view.name === 'capture' && (
              <CaptureScreen onReady={(customerId) => setView({ name: 'orchestration', customerId })} />
            )}
            {view.name === 'orchestration' && (
              <OrchestrationScreen customerId={view.customerId} onBack={() => setView({ name: 'capture' })} />
            )}
            {view.name === 'admin' && (
              <AdminScreen
                onBack={() => setView({ name: 'capture' })}
                onViewRun={(runId) => setView({ name: 'admin-detail', runId })}
              />
            )}
            {view.name === 'admin-detail' && (
              <AdminRunDetailScreen runId={view.runId} onBack={() => setView({ name: 'admin' })} />
            )}
          </>
        )}
      </main>
    </div>
  )
}
