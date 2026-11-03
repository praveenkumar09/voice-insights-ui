import { useState } from 'react'
import { AdminCampaigns } from '../components/admin/AdminCampaigns'
import { AdminBusinessUnit } from '../components/admin/AdminBusinessUnit'
import { AdminDashboard } from '../components/admin/AdminDashboard'
import { AdminKnowledge } from '../components/admin/AdminKnowledge'
import { AdminSessions } from '../components/admin/AdminSessions'
import { useJunoAction } from '../components/juno/mode/JunoMode'

interface Props {
  onBack: () => void
  onViewRun: (runId: string) => void
}

export function AdminScreen({ onBack, onViewRun }: Props) {
  const [tab, setTab] = useState<'dashboard' | 'sessions' | 'knowledge' | 'unit' | 'campaigns'>('dashboard')

  useJunoAction({ id: 'admin_view', description: 'Show the Admin dashboard, the voice sessions, the knowledge base, the campaigns or the business unit and languages', risk: 'open', params: { view: { type: 'enum', values: ['dashboard', 'sessions', 'knowledge', 'unit', 'campaigns'] } },
    run: (p) => { setTab(p.view === 'sessions' ? 'sessions' : p.view === 'knowledge' ? 'knowledge' : p.view === 'unit' ? 'unit' : p.view === 'campaigns' ? 'campaigns' : 'dashboard') } })

  return (
    <section className="adm">
      <div className="adm-nav">
        <button className="back-btn" onClick={onBack}>&larr; Back</button>
        <div className="adm-tabs" role="tablist" aria-label="Admin views">
          <button role="tab" aria-selected={tab === 'dashboard'} className={tab === 'dashboard' ? 'is-active' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
          <button role="tab" aria-selected={tab === 'sessions'} className={tab === 'sessions' ? 'is-active' : ''} onClick={() => setTab('sessions')}>Voice sessions</button>
          <button role="tab" aria-selected={tab === 'knowledge'} className={tab === 'knowledge' ? 'is-active' : ''} onClick={() => setTab('knowledge')}>Knowledge base</button>
          <button role="tab" aria-selected={tab === 'unit'} className={tab === 'unit' ? 'is-active' : ''} onClick={() => setTab('unit')}>Business unit</button>
          <button role="tab" aria-selected={tab === 'campaigns'} className={tab === 'campaigns' ? 'is-active' : ''} onClick={() => setTab('campaigns')}>Campaigns</button>
        </div>
      </div>
      {tab === 'dashboard' ? <AdminDashboard onViewRun={onViewRun} /> : tab === 'sessions' ? <AdminSessions onViewRun={onViewRun} /> : tab === 'unit' ? <AdminBusinessUnit /> : tab === 'campaigns' ? <AdminCampaigns /> : <AdminKnowledge />}
    </section>
  )
}
