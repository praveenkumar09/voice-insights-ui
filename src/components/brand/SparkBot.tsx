import { useId, type CSSProperties } from 'react'

/**
 * Spark, the bot. One drawing, five behaviours (styles in spark-bot.css):
 *   idle       floats, blinks, waves its spark
 *   listening  leans in, round attentive eyes, ear cups glow and swell with `level`, sound waves arrive from both sides
 *   thinking   eyes look up, three dots pulse in the visor, a bright dot circles the halo
 *   speaking   mouth moves, sound waves leave the head, the spark and halo pulse
 *   done       happy, waving, sparks twinkle
 * `variant="mark"` is just the head, for small places such as the page header.
 * `level` (0..1) is the voice level that drives the ear glow while listening.
 */
export type SparkMode = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done'

interface Props {
  mode?: SparkMode
  level?: number
  variant?: 'full' | 'mark'
  className?: string
  /** Accessible name. Omit for a purely decorative bot. */
  label?: string
}

const STAR = 'M0-50C5-15 15-5 50 0 15 5 5 15 0 50-5 15-15 5-50 0-15-5-5-15 0-50Z'

export function SparkBot({ mode = 'idle', level = 0, variant = 'full', className = '', label }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const u = (name: string) => `url(#${id}${name})`
  const full = variant === 'full'
  const style = { ['--lvl' as string]: Math.max(0, Math.min(1, level)).toFixed(3) } as CSSProperties

  return (
    <svg
      className={`sb sb--${variant} ${className}`.trim()}
      data-mode={mode}
      viewBox={full ? '-90 -34 800 704' : '10 -30 540 430'}
      style={style}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      overflow="visible"
    >
      <defs>
        <linearGradient id={`${id}W`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".7" stopColor="#eceef4" />
          <stop offset="1" stopColor="#d6dae5" />
        </linearGradient>
        <linearGradient id={`${id}V`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2f3f" />
          <stop offset=".55" stopColor="#12141c" />
          <stop offset="1" stopColor="#3a0b1c" />
        </linearGradient>
        <linearGradient id={`${id}R`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5d85" />
          <stop offset=".55" stopColor="#d31145" />
          <stop offset="1" stopColor="#9c0c34" />
        </linearGradient>
        <linearGradient id={`${id}G`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a9a" />
          <stop offset=".5" stopColor="#d31145" />
          <stop offset="1" stopColor="#ff9a6f" />
        </linearGradient>
        <radialGradient id={`${id}C`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".25" stopColor="#ffd7a0" />
          <stop offset=".6" stopColor="#ff4d78" stopOpacity=".9" />
          <stop offset="1" stopColor="#d31145" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}g`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" /></filter>
        <filter id={`${id}s`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="22" /></filter>
        <filter id={`${id}d`} x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="18" stdDeviation="14" floodColor="#7a0f2c" floodOpacity=".26" /></filter>
        <path id={`${id}star`} d={STAR} />
        {/* the head's shape, so its glossy highlight can never overhang the outline */}
        <clipPath id={`${id}hc`}><rect x="96" y="96" width="368" height="292" rx="132" /></clipPath>
      </defs>

      {full && <ellipse className="sb-shadow" cx="280" cy="690" rx="130" ry="13" fill="#6d0723" fillOpacity=".32" filter={u('g')} />}

      <g className="sb-float" filter={u('d')}>
        {full && (
          <>
            {/* halo ring */}
            <g className="sb-ring"><circle cx="280" cy="262" r="238" stroke="#d31145" strokeWidth="1.5" strokeOpacity=".25" strokeDasharray="2 12" fill="none" /></g>
            <circle cx="280" cy="262" r="214" stroke={u('G')} strokeWidth="3" strokeOpacity=".5" fill="none" />
            <circle className="sb-halo" cx="280" cy="262" r="196" stroke={u('G')} strokeWidth="14" strokeOpacity=".85" filter={u('g')} fill="none" />
            <circle cx="280" cy="262" r="196" stroke={u('G')} strokeWidth="6" fill="none" />
            {/* a bright dot that circles the ring while Spark thinks */}
            <g className="sb-orbit"><circle cx="280" cy="66" r="10" fill="#fff" /><circle cx="280" cy="66" r="22" fill={u('C')} filter={u('g')} /></g>

            {/* thruster */}
            <g className="sb-thrust">
              <ellipse cx="280" cy="606" rx="82" ry="22" fill="#ff5d85" fillOpacity=".85" filter={u('g')} />
              <ellipse cx="280" cy="600" rx="44" ry="10" fill="#fff" fillOpacity=".85" filter={u('g')} />
            </g>

            {/* left arm */}
            <path d="M178 452C142 484 124 520 120 556" stroke="#cfd3df" strokeWidth="54" strokeLinecap="round" fill="none" />
            <path d="M178 452C142 484 124 520 120 556" stroke={u('W')} strokeWidth="46" strokeLinecap="round" fill="none" />
            <circle cx="120" cy="560" r="32" fill={u('W')} stroke="#cfd3df" strokeWidth="2" />

            {/* the waving arm and the spark it holds */}
            <g className="sb-wave sb-arm-up">
              <path d="M350 454C440 470 556 440 584 372" stroke="#cfd3df" strokeWidth="54" strokeLinecap="round" fill="none" />
              <path d="M350 454C440 470 556 440 584 372" stroke={u('W')} strokeWidth="46" strokeLinecap="round" fill="none" />
              <circle cx="590" cy="358" r="34" fill={u('W')} stroke="#cfd3df" strokeWidth="2" />
              <g className="sb-hand-spark">
                <circle cx="596" cy="290" r="88" fill={u('C')} filter={u('g')} />
                <use href={`#${id}star`} transform="translate(596 290) scale(1.3)" fill="#ff9a6f" filter={u('g')} opacity=".85" />
                <use href={`#${id}star`} transform="translate(596 290) scale(1.12)" fill={u('G')} />
                <use href={`#${id}star`} transform="translate(596 290) scale(.4)" fill="#fff" />
              </g>
            </g>
            {/* resting arm (listening, thinking): hangs at the side, the spark held low */}
            <g className="sb-arm-down">
              <path d="M350 456C404 470 430 510 426 554" stroke="#cfd3df" strokeWidth="54" strokeLinecap="round" fill="none" />
              <path d="M350 456C404 470 430 510 426 554" stroke={u('W')} strokeWidth="46" strokeLinecap="round" fill="none" />
              <circle cx="426" cy="560" r="32" fill={u('W')} stroke="#cfd3df" strokeWidth="2" />
              <g className="sb-hand-spark">
                <circle cx="452" cy="534" r="44" fill={u('C')} filter={u('g')} />
                <use href={`#${id}star`} transform="translate(452 534) scale(.62)" fill={u('G')} />
                <use href={`#${id}star`} transform="translate(452 534) scale(.22)" fill="#fff" />
              </g>
            </g>

            {/* body */}
            <rect x="172" y="392" width="216" height="206" rx="92" fill={u('W')} stroke="#d3d7e1" strokeWidth="2" />
            <ellipse cx="230" cy="430" rx="40" ry="14" fill="#fff" opacity=".8" transform="rotate(-25 230 430)" />
            <circle cx="280" cy="496" r="46" fill={u('R')} />
            <circle cx="280" cy="496" r="46" stroke="#ffb0c4" strokeOpacity=".7" strokeWidth="3" fill="none" />
            <g className="sb-chest"><use href={`#${id}star`} transform="translate(280 496) scale(.56)" fill="#fff" /></g>
            <rect x="228" y="372" width="104" height="30" rx="15" fill="#1b1d27" />

          </>
        )}

        {/* sound arriving (listening) and leaving (speaking) */}
        <g className="sb-waves sb-waves--in" fill="none" strokeLinecap="round">
          {[0, 1, 2].map((i) => (
            <g key={i} className="sb-wave-pair" style={{ animationDelay: `${i * 0.45}s` }}>
              <path d={`M${20 - i * 30} 170Q${-12 - i * 30} 244 ${20 - i * 30} 318`} stroke="#2fd3a7" strokeWidth="9" />
              <path d={`M${540 + i * 30} 170Q${572 + i * 30} 244 ${540 + i * 30} 318`} stroke="#2fd3a7" strokeWidth="9" />
            </g>
          ))}
        </g>
        <g className="sb-waves sb-waves--out" fill="none" strokeLinecap="round">
          {[0, 1, 2].map((i) => (
            <g key={i} className="sb-wave-pair" style={{ animationDelay: `${i * 0.4}s` }}>
              <path d={`M${20 - i * 30} 170Q${-12 - i * 30} 244 ${20 - i * 30} 318`} stroke="#ff5d85" strokeWidth="9" />
              <path d={`M${540 + i * 30} 170Q${572 + i * 30} 244 ${540 + i * 30} 318`} stroke="#ff5d85" strokeWidth="9" />
            </g>
          ))}
        </g>

        {/* head, tilting a little with what it is doing */}
        <g className="sb-head">
          {/* ear cups: they glow with the voice while listening */}
          <circle cx="82" cy="244" r="54" fill={u('W')} stroke="#d3d7e1" strokeWidth="2" />
          <circle cx="82" cy="244" r="34" fill="#1b1d27" />
          <g className="sb-ear"><circle cx="82" cy="244" r="34" stroke={u('G')} strokeWidth="10" fill="none" /></g>
          <circle cx="478" cy="244" r="54" fill={u('W')} stroke="#d3d7e1" strokeWidth="2" />
          <circle cx="478" cy="244" r="34" fill="#1b1d27" />
          <g className="sb-ear"><circle cx="478" cy="244" r="34" stroke={u('G')} strokeWidth="10" fill="none" /></g>

          <rect x="96" y="96" width="368" height="292" rx="132" fill={u('W')} stroke="#d3d7e1" strokeWidth="2" />
          <ellipse cx="206" cy="134" rx="78" ry="20" fill="#fff" opacity=".85" transform="rotate(-14 206 134)" clipPath={u('hc')} />

          <g className="sb-face">
            <rect x="134" y="144" width="292" height="196" rx="86" fill={u('V')} />
            <rect x="134" y="144" width="292" height="196" rx="86" stroke="#ff5d85" strokeOpacity=".28" strokeWidth="2" fill="none" />
            <path d="M168 176C216 156 332 152 392 176" stroke="#fff" strokeOpacity=".28" strokeWidth="7" strokeLinecap="round" fill="none" />
            <ellipse cx="190" cy="296" rx="30" ry="15" fill="#ff2d60" opacity=".35" filter={u('g')} />
            <ellipse cx="370" cy="296" rx="30" ry="15" fill="#ff2d60" opacity=".35" filter={u('g')} />

            {/* happy eyes (idle, speaking, done) */}
            <g className="sb-eyes sb-eyes--happy" strokeLinecap="round" fill="none">
              <path d="M176 246Q202 204 228 246" stroke="#ff2d60" strokeWidth="16" filter={u('g')} opacity=".95" />
              <path d="M332 246Q358 204 384 246" stroke="#ff2d60" strokeWidth="16" filter={u('g')} opacity=".95" />
              <path d="M176 246Q202 204 228 246" stroke="#ff7a9a" strokeWidth="10" />
              <path d="M332 246Q358 204 384 246" stroke="#ff7a9a" strokeWidth="10" />
            </g>
            {/* round, attentive eyes (listening, thinking) */}
            <g className="sb-eyes sb-eyes--round">
              <g className="sb-eye">
                <circle cx="202" cy="226" r="24" fill="#ff2d60" filter={u('g')} opacity=".9" />
                <circle cx="202" cy="226" r="19" fill="#ff7a9a" />
                <circle cx="202" cy="226" r="9" fill="#2a0612" /><circle cx="197" cy="220" r="4" fill="#fff" />
              </g>
              <g className="sb-eye">
                <circle cx="358" cy="226" r="24" fill="#ff2d60" filter={u('g')} opacity=".9" />
                <circle cx="358" cy="226" r="19" fill="#ff7a9a" />
                <circle cx="358" cy="226" r="9" fill="#2a0612" /><circle cx="353" cy="220" r="4" fill="#fff" />
              </g>
            </g>

            {/* mouths */}
            <path className="sb-smile" d="M254 284Q280 308 306 284" stroke="#ff5d85" strokeWidth="8" strokeLinecap="round" fill="none" />
            <g className="sb-mouth"><ellipse cx="280" cy="294" rx="28" ry="13" fill="#ff5d85" /><ellipse cx="280" cy="299" rx="15" ry="5" fill="#9c0c34" /></g>
            <g className="sb-thinkdots" fill="#ff7a9a">
              <circle cx="248" cy="294" r="6.5" /><circle cx="280" cy="294" r="6.5" /><circle cx="312" cy="294" r="6.5" />
            </g>
          </g>

          {/* antenna */}
          <rect x="274" y="52" width="12" height="52" rx="6" fill="#1b1d27" />
          <g className="sb-antenna">
            <circle cx="280" cy="44" r="46" fill={u('C')} filter={u('g')} />
            <use href={`#${id}star`} transform="translate(280 36) scale(.86)" fill="#ff2d60" filter={u('g')} opacity=".9" />
            <use href={`#${id}star`} transform="translate(280 36) scale(.7)" fill={u('R')} />
            <use href={`#${id}star`} transform="translate(280 36) scale(.24)" fill="#fff" />
          </g>
        </g>
      </g>
    </svg>
  )
}
