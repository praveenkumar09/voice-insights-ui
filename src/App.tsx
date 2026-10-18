import { useState } from 'react'
import { AdminRunDetailScreen } from './screens/AdminRunDetailScreen'
import { AdminScreen } from './screens/AdminScreen'
import { CaptureScreen } from './screens/CaptureScreen'
import { LoginScreen } from './screens/LoginScreen'
import { OrchestrationScreen } from './screens/OrchestrationScreen'
import { ThemeToggle } from './components/ThemeToggle'
import { JunoCapsule, JunoModeButton } from './components/juno/mode/JunoCapsule'
import { ReadAloudActions } from './components/juno/mode/ReadAloud'
import { JunoModeProvider, useJunoAction, useJunoScreen } from './components/juno/mode/JunoMode'
import { useAuth } from './hooks/useAuth'
import { useTheme } from './hooks/useTheme'

type View =
  | { name: 'capture' }
  | { name: 'orchestration'; customerId: string }
  | { name: 'admin' }
  | { name: 'admin-detail'; runId: string }

export default function App() {
  return (
    <JunoModeProvider>
      <AppShell />
    </JunoModeProvider>
  )
}

function AppShell() {
  const [view, setView] = useState<View>({ name: 'capture' })
  const inAdmin = view.name === 'admin' || view.name === 'admin-detail'
  const auth = useAuth()
  const { theme, toggleTheme } = useTheme()
  const signedIn = auth.isAuthenticated

  // What Juno can do from anywhere in the app.
  useJunoScreen(signedIn ? (inAdmin ? 'Admin' : view.name === 'orchestration' ? 'The suggestion workspace' : 'The home screen') : null)
  useJunoAction(signedIn && view.name !== 'capture' ? { id: 'go_home', description: 'Go to the home screen', risk: 'open', run: () => setView({ name: 'capture' }) } : null)
  useJunoAction(signedIn && !inAdmin ? { id: 'open_admin', description: 'Open Admin', risk: 'open', run: () => setView({ name: 'admin' }) } : null)
  useJunoAction(signedIn ? {
    id: 'switch_theme', description: 'Switch to light or dark mode', risk: 'open', params: { theme: { type: 'enum', values: ['light', 'dark'] } },
    run: (p) => { if (p.theme !== theme) toggleTheme(); return `Switched to ${p.theme} mode.` },
  } : null)
  useJunoAction(signedIn ? { id: 'log_out', description: 'Log out', risk: 'change', run: () => { window.setTimeout(auth.logout, 600); return 'Logging you out.' } } : null)

  return (
    <div className="app-shell">
      {signedIn && <JunoCapsule />}
      <ReadAloudActions enabled={signedIn} />
      <header className={`app-header${auth.isAuthenticated ? '' : ' app-header--hidden'}`}>
        <div className="app-header__brand">
          <img className="app-header__logo" src="/aia-voice-insights-logo.png" alt="AIA Voice Insights" />
          <div className="app-header__text">
            <h1>Voice Insights</h1>
            <p>Live conversation &rarr; agentic product suggestions</p>
          </div>
        </div>
        {auth.isAuthenticated && (
          <div className="app-header__actions">
            <JunoModeButton />
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
