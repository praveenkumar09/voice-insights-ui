/**
 * Only one voice feature should hold the microphone at a time. A debrief, a rehearsal, an Ask conversation or a spoken correction
 * claims it while it is listening; Juno mode, which listens in the background for "Hey Juno", steps aside while anyone else has it and
 * comes back when it is released.
 */
const owners = new Set<string>()
const listeners = new Set<(busy: boolean) => void>()

const notify = () => listeners.forEach((fn) => fn(owners.size > 0))

export const voiceLock = {
  claim(id: string) {
    if (owners.has(id)) return
    owners.add(id)
    notify()
  },
  release(id: string) {
    if (owners.delete(id)) notify()
  },
  busy: () => owners.size > 0,
  subscribe(fn: (busy: boolean) => void) {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
}
