import { useEffect, useRef, useState } from 'react'

/**
 * Counts a number up to its target. Time-based (not frame-counted) so it takes the same time on every screen, eases
 * out, and jumps straight to the value for anyone who has asked their system to reduce motion.
 */
export function useCountUp(target: number, duration = 1100, decimals = 0): number {
  const [value, setValue] = useState(0)
  const shown = useRef(0)
  shown.current = value

  useEffect(() => {
    if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    const from = shown.current
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(from + (target - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setValue(target)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  const f = Math.pow(10, decimals)
  return Math.round(value * f) / f
}
