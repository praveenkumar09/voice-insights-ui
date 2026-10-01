import { useEffect, useRef } from 'react'

interface Props {
  amplitude: number
  active: boolean
}

const BARS = 56

/**
 * Real-time voice waveform. The mic amplitude is the only input; each bar
 * eases toward a target derived from it (with a travelling phase offset so
 * the shape ripples instead of pulsing as one block). Idle, it settles into
 * a calm breathing line so the stage never looks dead.
 */
export function LiveWaveform({ amplitude, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ampRef = useRef(0)
  const activeRef = useRef(active)

  useEffect(() => {
    ampRef.current = amplitude
  }, [amplitude])
  useEffect(() => {
    activeRef.current = active
  }, [active])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const heights = new Array(BARS).fill(0.06)
    let raf = 0
    let t = 0

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { clientWidth, clientHeight } = canvas
      canvas.width = clientWidth * dpr
      canvas.height = clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = () => {
      t += 0.045
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      const gap = 4
      const barW = Math.max(2, (w - gap * (BARS - 1)) / BARS)
      const amp = Math.min(1, ampRef.current * 1.6)
      const live = activeRef.current

      const grad = ctx.createLinearGradient(0, 0, w, 0)
      grad.addColorStop(0, '#ff5678')
      grad.addColorStop(0.5, '#d31145')
      grad.addColorStop(1, '#9c0c34')

      for (let i = 0; i < BARS; i++) {
        const centre = 1 - Math.abs(i - BARS / 2) / (BARS / 2) // taller in the middle
        const wave = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 0.42)
        const target = live
          ? 0.07 + amp * (0.35 + 0.65 * wave) * (0.35 + 0.65 * centre)
          : 0.05 + 0.03 * Math.sin(t + i * 0.3)
        heights[i] += (target - heights[i]) * (live ? 0.28 : 0.08)

        const bh = Math.max(3, heights[i] * h)
        const x = i * (barW + gap)
        const y = (h - bh) / 2
        ctx.globalAlpha = live ? 0.55 + 0.45 * centre : 0.35
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(x, y, barW, bh, barW / 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="live-waveform" aria-hidden />
}
