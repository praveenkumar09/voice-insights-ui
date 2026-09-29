interface Props {
  /** 'down' = fanning out from a single point at the top to 3 points at the bottom; 'up' = the mirror, converging. */
  direction: 'down' | 'up'
  /** true per branch (left-to-right: need, risk, affordability) once that branch has started flowing. */
  active: [boolean, boolean, boolean]
  /** true per branch once that branch has completed. */
  done: [boolean, boolean, boolean]
}

const BRANCH_X = [15, 50, 85]
const BUS_Y = 30

/**
 * Orthogonal "org chart" connector — a single stem to/from a shared bus line,
 * with right-angle drops to each branch. Deliberately not a bezier "fan":
 * curved, swooping connector lines read as a consumer/marketing visual, not
 * an enterprise process diagram — the straight-line, right-angle-elbow style
 * here matches how architecture/org diagrams are drawn in a boardroom deck.
 */
export function ConnectorLine({ direction, active, done }: Props) {
  return (
    <svg className="connector-fan" viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
      {BRANCH_X.map((x, i) => {
        const d =
          direction === 'down'
            ? `M50 0 L50 ${BUS_Y} L${x} ${BUS_Y} L${x} 60`
            : `M${x} 0 L${x} ${BUS_Y} L50 ${BUS_Y} L50 60`
        const classes = ['connector-fan__path']
        if (done[i]) classes.push('is-done')
        else if (active[i]) classes.push('is-active')
        return <path key={i} d={d} className={classes.join(' ')} vectorEffect="non-scaling-stroke" />
      })}
    </svg>
  )
}
