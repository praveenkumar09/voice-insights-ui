/**
 * Juno's own voice coming back through the microphone. The microphone is closed while Juno speaks, but the speech service answers a
 * second or two after the audio, and a speaker leaks into a microphone whatever the echo cancellation: the words of Juno's last answer
 * can arrive as if the advisor had said them. A line made (almost) only of Juno's own recent words, in the same order, is that echo.
 * Short lines are never judged: "why?" or "stop" may well be the advisor.
 */
const words = (s: string) => s.toLowerCase().replace(/[’']/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)
const pairs = (w: string[]) => w.slice(1).map((x, i) => `${w[i]} ${x}`)

export function isEcho(heard: string, spoken: string[]): boolean {
  const h = words(heard)
  if (h.length < 4) return false
  const said = new Set(spoken.flatMap((t) => pairs(words(t))))
  if (said.size === 0) return false
  const hp = pairs(h)
  return hp.filter((p) => said.has(p)).length / hp.length >= 0.6
}
