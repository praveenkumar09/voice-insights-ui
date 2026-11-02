import { useMemo } from 'react'
import { SparkWordmark } from '../brand/SparkWordmark'

/**
 * The sign-in backdrop: Spark floating in a fan of light, waving a spark. Everything is vector and animated with CSS only
 * (float, blink, wave, twinkle, ring). The login screen feeds it three things:
 *   --px / --py  pointer position (-1..1) → Spark's face drifts toward the cursor
 *   is-typing    Spark looks toward the form
 *   is-busy / is-success   the ring spins faster / the spark flares
 * All motion stops under prefers-reduced-motion (see spark-login.css).
 */

const W = 1000
const H = 940
const HEAD = { x: 500, y: 330 }

/** Small deterministic generator so the sparks are the same on every render. */
function rng(seed: number) {
  let s = seed
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

interface Dot { x: number; y: number; r: number; c: string; o: number; d: number; star: boolean }

function makeDots(): Dot[] {
  const r = rng(11)
  const cols = ['#d31145', '#ff5d85', '#ff9a6f']
  const dots: Dot[] = []
  // a drift of sparks around the raised hand
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2
    const dist = 60 + Math.pow(r(), 1.4) * 300
    dots.push({ x: 790 + Math.cos(a) * dist * 1.25, y: 340 + Math.sin(a) * dist * 0.9, r: 1.6 + r() * 4, c: cols[Math.floor(r() * 3)], o: 0.3 + r() * 0.6, d: r() * 5, star: r() < 0.22 })
  }
  // and a few across the whole scene
  for (let i = 0; i < 18; i++) {
    dots.push({ x: 30 + r() * (W - 60), y: 30 + r() * (H - 60), r: 1.2 + r() * 2.6, c: '#d31145', o: 0.12 + r() * 0.3, d: r() * 5, star: false })
  }
  return dots
}

const STAR = 'M0-50C5-15 15-5 50 0 15 5 5 15 0 50-5 15-15 5-50 0-15-5-5-15 0-50Z'

export function SparkScene() {
  const dots = useMemo(makeDots, [])
  const rays = useMemo(() => Array.from({ length: 36 }, (_, i) => i * 10), [])

  return (
    <svg className="spark-scene" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="spWhite" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset=".7" stopColor="#eceef4" />
          <stop offset="1" stopColor="#d6dae5" />
        </linearGradient>
        <linearGradient id="spVisor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2f3f" />
          <stop offset=".55" stopColor="#12141c" />
          <stop offset="1" stopColor="#3a0b1c" />
        </linearGradient>
        <linearGradient id="spRed" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5d85" />
          <stop offset=".55" stopColor="#d31145" />
          <stop offset="1" stopColor="#9c0c34" />
        </linearGradient>
        <linearGradient id="spRing" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a9a" />
          <stop offset=".5" stopColor="#d31145" />
          <stop offset="1" stopColor="#ff9a6f" />
        </linearGradient>
        <radialGradient id="spCore" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" />
          <stop offset=".25" stopColor="#ffd7a0" />
          <stop offset=".6" stopColor="#ff4d78" stopOpacity=".9" />
          <stop offset="1" stopColor="#d31145" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="spRayFade" gradientUnits="userSpaceOnUse" cx={HEAD.x} cy={HEAD.y} r="640">
          <stop offset="0" stopColor="#d31145" stopOpacity=".22" />
          <stop offset=".55" stopColor="#d31145" stopOpacity=".07" />
          <stop offset="1" stopColor="#d31145" stopOpacity="0" />
        </radialGradient>
        <filter id="spGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" /></filter>
        <filter id="spSoft" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="26" /></filter>
        <filter id="spDrop" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="22" stdDeviation="16" floodColor="#7a0f2c" floodOpacity=".28" /></filter>
        <path id="spStar" d={STAR} />
      </defs>

      {/* fan of light, turning very slowly */}
      <g className="sp-rays">
        {rays.map((a) => (
          <path key={a} d="M0 0L-26 -700L26 -700Z" transform={`translate(${HEAD.x} ${HEAD.y}) rotate(${a})`} fill="url(#spRayFade)" />
        ))}
      </g>

      {/* ribbons of light that lead the eye toward the sign-in card */}
      <g className="sp-ribbons" fill="none" strokeLinecap="round">
        <path d="M600 800C760 860 930 800 1060 640S1180 380 1300 400" stroke="#d31145" strokeOpacity=".16" strokeWidth="3" />
        <path d="M600 780C770 850 950 780 1080 610S1190 350 1300 366" stroke="#ff5d85" strokeOpacity=".2" strokeWidth="2" />
        <path d="M600 760C780 840 970 760 1100 580S1200 320 1300 332" stroke="#ff9a6f" strokeOpacity=".22" strokeWidth="2" />
      </g>

      {/* floor glow */}
      <ellipse cx="500" cy="728" rx="240" ry="26" fill="#9c0c34" fillOpacity=".34" filter="url(#spSoft)" />
      <ellipse className="sp-shadow" cx="500" cy="722" rx="120" ry="12" fill="#6d0723" fillOpacity=".35" filter="url(#spGlow)" />

      {/* sparks */}
      <g className="sp-dots">
        {dots.map((d, i) =>
          d.star ? (
            <use key={i} href="#spStar" transform={`translate(${d.x} ${d.y}) scale(${0.1 + (d.r % 2) * 0.1})`} fill={d.c} opacity={d.o + 0.2} className="sp-twinkle" style={{ animationDelay: `${d.d}s` }} />
          ) : (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.c} opacity={d.o} className="sp-twinkle" style={{ animationDelay: `${d.d}s` }} />
          ),
        )}
      </g>

      {/* Spark */}
      <svg x="130" y="22" width="740" height="700" viewBox="-20 -30 740 700" overflow="visible" className="sp-bot-wrap">
        <g className="sp-float" filter="url(#spDrop)">
          {/* halo ring light */}
          <g className="sp-ring">
            <circle cx="280" cy="262" r="238" stroke="#d31145" strokeWidth="1.5" strokeOpacity=".25" strokeDasharray="2 12" fill="none" />
          </g>
          <circle cx="280" cy="262" r="214" stroke="url(#spRing)" strokeWidth="3" strokeOpacity=".55" fill="none" />
          <circle className="sp-halo" cx="280" cy="262" r="196" stroke="url(#spRing)" strokeWidth="16" strokeOpacity=".9" filter="url(#spGlow)" fill="none" />
          <circle cx="280" cy="262" r="196" stroke="url(#spRing)" strokeWidth="7" fill="none" />

          {/* thruster */}
          <g className="sp-thrust">
            <ellipse cx="280" cy="606" rx="82" ry="22" fill="#ff5d85" fillOpacity=".85" filter="url(#spGlow)" />
            <ellipse cx="280" cy="600" rx="44" ry="10" fill="#fff" fillOpacity=".85" filter="url(#spGlow)" />
          </g>

          {/* left arm */}
          <path d="M178 452C142 484 124 520 120 556" stroke="#cfd3df" strokeWidth="54" strokeLinecap="round" fill="none" />
          <path d="M178 452C142 484 124 520 120 556" stroke="url(#spWhite)" strokeWidth="46" strokeLinecap="round" fill="none" />
          <circle cx="120" cy="560" r="32" fill="url(#spWhite)" stroke="#cfd3df" strokeWidth="2" />

          {/* waving arm + the spark */}
          <g className="sp-wave">
            <path d="M350 454C440 470 556 440 584 372" stroke="#cfd3df" strokeWidth="54" strokeLinecap="round" fill="none" />
            <path d="M350 454C440 470 556 440 584 372" stroke="url(#spWhite)" strokeWidth="46" strokeLinecap="round" fill="none" />
            <circle cx="590" cy="358" r="34" fill="url(#spWhite)" stroke="#cfd3df" strokeWidth="2" />
            <g className="sp-hand-spark">
              <circle cx="596" cy="290" r="88" fill="url(#spCore)" filter="url(#spGlow)" />
              <use href="#spStar" transform="translate(596 290) scale(1.3)" fill="#ff9a6f" filter="url(#spGlow)" opacity=".85" />
              <use href="#spStar" transform="translate(596 290) scale(1.12)" fill="url(#spRing)" />
              <use href="#spStar" transform="translate(596 290) scale(.4)" fill="#fff" />
            </g>
          </g>

          {/* body */}
          <rect x="172" y="392" width="216" height="206" rx="92" fill="url(#spWhite)" stroke="#d3d7e1" strokeWidth="2" />
          <ellipse cx="230" cy="430" rx="40" ry="14" fill="#fff" opacity=".8" transform="rotate(-25 230 430)" />
          <circle cx="280" cy="496" r="46" fill="url(#spRed)" />
          <circle cx="280" cy="496" r="46" stroke="#ffb0c4" strokeOpacity=".7" strokeWidth="3" fill="none" />
          <g className="sp-chest"><use href="#spStar" transform="translate(280 496) scale(.56)" fill="#fff" /></g>
          <rect x="228" y="372" width="104" height="30" rx="15" fill="#1b1d27" />

          {/* ear cups */}
          <circle cx="82" cy="244" r="54" fill="url(#spWhite)" stroke="#d3d7e1" strokeWidth="2" />
          <circle cx="82" cy="244" r="34" fill="#1b1d27" /><circle cx="82" cy="244" r="34" stroke="url(#spRing)" strokeWidth="10" fill="none" />
          <circle cx="478" cy="244" r="54" fill="url(#spWhite)" stroke="#d3d7e1" strokeWidth="2" />
          <circle cx="478" cy="244" r="34" fill="#1b1d27" /><circle cx="478" cy="244" r="34" stroke="url(#spRing)" strokeWidth="10" fill="none" />

          {/* head */}
          <rect x="96" y="96" width="368" height="292" rx="132" fill="url(#spWhite)" stroke="#d3d7e1" strokeWidth="2" />
          <ellipse cx="190" cy="132" rx="84" ry="22" fill="#fff" opacity=".85" transform="rotate(-14 190 132)" />

          {/* the face follows the pointer */}
          <g className="sp-face">
            <rect x="134" y="144" width="292" height="196" rx="86" fill="url(#spVisor)" />
            <rect x="134" y="144" width="292" height="196" rx="86" stroke="#ff5d85" strokeOpacity=".28" strokeWidth="2" fill="none" />
            <path d="M168 176C216 156 332 152 392 176" stroke="#fff" strokeOpacity=".28" strokeWidth="7" strokeLinecap="round" fill="none" />
            <ellipse cx="190" cy="296" rx="30" ry="15" fill="#ff2d60" opacity=".35" filter="url(#spGlow)" />
            <ellipse cx="370" cy="296" rx="30" ry="15" fill="#ff2d60" opacity=".35" filter="url(#spGlow)" />
            <g className="sp-eyes" strokeLinecap="round" fill="none">
              <path d="M176 246Q202 204 228 246" stroke="#ff2d60" strokeWidth="16" filter="url(#spGlow)" opacity=".95" />
              <path d="M332 246Q358 204 384 246" stroke="#ff2d60" strokeWidth="16" filter="url(#spGlow)" opacity=".95" />
              <path d="M176 246Q202 204 228 246" stroke="#ff7a9a" strokeWidth="10" />
              <path d="M332 246Q358 204 384 246" stroke="#ff7a9a" strokeWidth="10" />
            </g>
            <path className="sp-smile" d="M254 282Q280 306 306 282" stroke="#ff5d85" strokeWidth="8" strokeLinecap="round" fill="none" opacity=".95" />
          </g>

          {/* antenna */}
          <rect x="274" y="52" width="12" height="52" rx="6" fill="#1b1d27" />
          <g className="sp-antenna">
            <circle cx="280" cy="44" r="46" fill="url(#spCore)" filter="url(#spGlow)" />
            <use href="#spStar" transform="translate(280 36) scale(.86)" fill="#ff2d60" filter="url(#spGlow)" opacity=".9" />
            <use href="#spStar" transform="translate(280 36) scale(.7)" fill="url(#spRed)" />
            <use href="#spStar" transform="translate(280 36) scale(.24)" fill="#fff" />
          </g>
        </g>
      </svg>

      {/* wordmark + line */}
      <SparkWordmark x={254} y={778} height={64} className="sp-wordmark" />
      <text x="500" y="896" textAnchor="middle" className="sp-tagline">Ignite every conversation.</text>
    </svg>
  )
}
