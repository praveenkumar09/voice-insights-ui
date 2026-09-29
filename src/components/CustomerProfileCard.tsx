import type { CustomerProfile } from '../types'

interface Props {
  profile: CustomerProfile | null
}

const FIELDS: { key: keyof CustomerProfile; label: string }[] = [
  { key: 'customerName', label: 'Name' },
  { key: 'age', label: 'Age' },
  { key: 'occupation', label: 'Occupation' },
  { key: 'incomeBand', label: 'Income band' },
  { key: 'dependents', label: 'Dependents' },
]

export function CustomerProfileCard({ profile }: Props) {
  const rows = FIELDS.filter((f) => {
    const value = profile?.[f.key]
    return value !== null && value !== undefined && value !== ''
  })

  return (
    <div className="glass-card profile-card">
      <div className="glass-card__label">
        Customer Profile
        {rows.length > 0 && <span className="profile-card__badge">AI extracted</span>}
      </div>

      {rows.length === 0 && (
        <p className="profile-card__empty">Fields will populate live as the conversation unfolds.</p>
      )}

      {rows.length > 0 && (
        <dl className="profile-card__grid">
          {rows.map((f) => (
            <div className="profile-card__row" key={f.key}>
              <dt>{f.label}</dt>
              <dd>{String(profile?.[f.key])}</dd>
            </div>
          ))}
        </dl>
      )}

      {profile?.goalsAndConcerns && profile.goalsAndConcerns.length > 0 && (
        <div className="profile-card__section">
          <span className="profile-card__section-label">Goals &amp; concerns</span>
          <div className="profile-card__tags">
            {profile.goalsAndConcerns.map((g, i) => (
              <span className="profile-card__tag" key={i}>
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {profile?.existingPolicies && profile.existingPolicies.length > 0 && (
        <div className="profile-card__section">
          <span className="profile-card__section-label">Existing policies</span>
          <div className="profile-card__tags">
            {profile.existingPolicies.map((p, i) => (
              <span className="profile-card__tag profile-card__tag--muted" key={i}>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
