import { useState } from 'react'
import { AdminDashboard } from '../components/admin/AdminDashboard'
import { AdminSessions } from '../components/admin/AdminSessions'

interface Props {
  onBack: () => void
  onViewRun: (runId: string) => void
}

export function AdminScreen({ onBack, onViewRun }: Props) {
  const [tab, setTab] = useState<'dashboard' | 'sessions'>('dashboard')

  return (
    <section className="adm">
      <div className="adm-nav">
        <button className="back-btn" onClick={onBack}>&larr; Back</button>
        <div className="adm-tabs" role="tablist" aria-label="Admin views">
          <button role="tab" aria-selected={tab === 'dashboard'} className={tab === 'dashboard' ? 'is-active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'is-active' : ''} onClick={() => setTab('sessions')}>Voice sessions</button>
        </div>
      </div>
      {tab === 'dashboard' ? <AdminDashboard onViewRun={onViewRun} /> : <AdminSessions onViewRun={onViewRun} />}
    </section>
  )
}
