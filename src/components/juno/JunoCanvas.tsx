import { useEffect, useRef, type RefObject } from 'react'

export type FieldMode = 'idle' | 'speaking' | 'listening' | 'thinking' | 'done'

interface Props {
  mode: FieldMode
  /** 0..1 loudness of the customer's voice (only used while listening). */
  level: number
  /** The orb: the field is drawn around wherever this element is. */
  anchor?: RefObject<HTMLElement | null>
}

interface P {
  a: number
  r: number
  s: number
  size: number
  hue: number
  phase: number
}

const PALETTE: Record<FieldMode, [string, string]> = {
  idle: ['255,86,120', '255,212,121'],
  speaking: ['255,86,120', '255,212,121'],
  listening: ['61,224,176', '140,236,255'],
  thinking: ['190,140,255', '255,86,120'],
  done: ['61,224,176', '255,212,121'],
}

const BARS = 84

/**
 * The living backdrop of the Juno stage: a field of particles orbiting the orb, and a ring of radial bars that
 * rises with whoever is talking. Juno speaking pushes energy outward in rose and gold; the customer speaking
 * pulls it inward in teal; thinking spins it into a violet ring. Pure canvas, paused while the tab is hidden,
 * and reduced to a calm static glow for people who prefer reduced motion.
 */
export function JunoCanvas({ mode, level, anchor }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const state = useRef({ mode, level })
  state.current = { mode, level }

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, raf = 0, t = 0, last = performance.now()
    let energy = 0 // smoothed loudness driving the bars and particle pulse
    let blend = 0 // 0 = outward (speaking) .. 1 = inward (listening)
    const rnd = (n: number) => Math.random() * n
    const parts: P[] = Array.from({ length: 130 }, () => ({ a: rnd(Math.PI * 2), r: 0.55 + rnd(0.9), s: 0.0002 + rnd(0.0006), size: 0.6 + rnd(2), hue: rnd(1), phase: rnd(6.28) }))

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null
    ro?.observe(canvas)

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden) return
      const dt = Math.min(60, now - last)
      last = now
      t += dt
      const { mode: m, level: lv } = state.current
      const [c1, c2] = PALETTE[m]
      let cx = w / 2
      let cy = h * 0.4
      const a = anchor?.current
      if (a) {
        const cr = canvas.getBoundingClientRect()
        const ar = a.getBoundingClientRect()
        cx = ar.left - cr.left + ar.width / 2
        cy = ar.top - cr.top + ar.height / 2
      }
      const unit = Math.min(w, h * 1.15) / 2 // everything scales with the stage
      const orbR = anchor?.current ? anchor.current.getBoundingClientRect().width / 2 : Math.min(unit * 0.3, 92)

      // Target loudness: Juno "speaks" in a lively synthetic rhythm, the customer's own voice is the real level.
      const talk = 0.38 + 0.4 * Math.abs(Math.sin(t / 130)) * Math.abs(Math.sin(t / 410 + 1))
      const target = m === 'speaking' ? talk : m === 'listening' ? Math.min(1, lv * 3.2) : m === 'thinking' ? 0.28 : m === 'done' ? 0.12 : 0.08
      energy += (target - energy) * Math.min(1, dt / 90)
      blend += ((m === 'listening' ? 1 : 0) - blend) * Math.min(1, dt / 400)

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'

      // Particles
      const spin = m === 'thinking' ? 5 : m === 'speaking' ? 1.6 : 1
      for (const p of parts) {
        p.a += p.s * dt * spin * (0.6 + p.r * 0.5)
        let r = unit * (0.5 + p.r * 0.55)
        if (m === 'thinking') r = unit * (0.62 + Math.sin(p.phase) * 0.04) + (p.r - 1) * 18
        else if (m === 'speaking') r += Math.sin(t / 260 + p.phase) * 10 + energy * 38 * (1 - blend)
        else if (m === 'listening') r -= energy * 34 + Math.sin(t / 700 + p.phase) * 6
        const x = cx + Math.cos(p.a) * r * 1.18
        const y = cy + Math.sin(p.a) * r * 0.78
        const alpha = (0.25 + 0.55 * Math.sin(t / 900 + p.phase) ** 2) * (m === 'idle' ? 0.55 : 1)
        ctx.fillStyle = `rgba(${p.hue > 0.55 ? c2 : c1},${alpha.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(x, y, p.size * (1 + energy * 0.9), 0, 6.283)
        ctx.fill()
      }

      // Radial bars around the orb
      ctx.lineCap = 'round'
      for (let i = 0; i < BARS; i++) {
        const a = (i / BARS) * Math.PI * 2 - Math.PI / 2
        const wob = 0.5 + 0.5 * Math.sin(i * 0.9 + t / 160) * Math.sin(i * 0.37 - t / 330)
        const hgt = 3 + (m === 'thinking' ? 5 + 9 * Math.abs(Math.sin(i * 0.5 + t / 200)) : energy * 46 * (0.25 + wob))
        const r0 = orbR + 16
        ctx.strokeStyle = `rgba(${i % 3 === 0 ? c2 : c1},${(0.45 + energy * 0.5).toFixed(3)})`
        ctx.lineWidth = Math.max(2, (orbR * 0.05))
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)
        ctx.lineTo(cx + Math.cos(a) * (r0 + hgt), cy + Math.sin(a) * (r0 + hgt))
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    if (reduce) {
      // One calm frame: the field without motion.
      state.current = { mode: 'idle', level: 0 }
      frame(performance.now())
      cancelAnimationFrame(raf)
    } else {
      raf = requestAnimationFrame(frame)
    }
    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
    }
  }, [])

  return <canvas ref={ref} className="jn__field" aria-hidden />
}
