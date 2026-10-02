interface Props {
  title: string
  text: string
  /** Who the content is for — the quickest way to tell the documents apart. */
  audience: { label: string; kind: 'internal' | 'customer' | 'both' }[]
}

/** A one-line "what you are looking at" band at the top of each stage, with who it is for. */
export function StageIntro({ title, text, audience }: Props) {
  return (
    <div className="stage-intro">
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      <div className="stage-intro__tags">
        {audience.map((a) => (
          <span key={a.label} className={`audience audience--${a.kind}`}>{a.label}</span>
        ))}
      </div>
    </div>
  )
}
