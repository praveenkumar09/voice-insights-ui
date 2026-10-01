import { useEffect, useRef, useState } from 'react'

/**
 * mm:ss while `running`. By default it restarts from 00:00 each time `running` turns true and freezes when it
 * turns false. With `accumulate`, pausing and resuming carries on from where it left off (a multi-take
 * dictation is one total time); change `resetKey` to start a fresh total.
 */
export function useElapsed(running: boolean, accumulate = false, resetKey = 0) {
  const [seconds, setSeconds] = useState(0)
  const base = useRef(0)
  const latest = useRef(0)
  latest.current = seconds

  useEffect(() => {
    base.current = 0
    setSeconds(0)
  }, [resetKey])

  useEffect(() => {
    if (!running) {
      base.current = latest.current
      return
    }
    const offset = accumulate ? base.current : 0
    if (!accumulate) setSeconds(0)
    const started = Date.now()
    const id = setInterval(() => setSeconds(offset + Math.floor((Date.now() - started) / 1000)), 500)
    return () => clearInterval(id)
  }, [running, accumulate])

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
