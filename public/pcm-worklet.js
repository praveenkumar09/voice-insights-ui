// Mic capture on the audio thread (not the main thread). The previous
// ScriptProcessorNode ran on the main thread, so any UI work (animations,
// React renders) could delay or drop audio buffers — which is what clipped
// words when people spoke quickly. This worklet only ever does audio work.
//
// Per 128-sample block it: (1) applies a gentle automatic gain so quiet
// speakers reach the model at a usable level, (2) resamples to 24kHz when the
// context can't run at 24kHz natively, (3) accumulates ~100ms of PCM16 and
// posts it to the main thread together with a level reading for the waveform.
//
// BACKGROUND FILTER. An earlier absolute "speech gate" (silence below a fixed level) cut real, quiet speech — the
// voice and the room's noise floor are too close for a fixed number to work — so it was removed. This one is
// RELATIVE: a chunk is background only when it is far quieter than the speaker's own typical level, which adapts to
// loud and quiet speakers alike. It is deliberately forgiving: it keeps a half-second after any speech (so soft word
// endings survive), releases the chunk before speech starts (so soft first syllables survive), and can be turned off
// or made stronger from the screen. Decisions use the RAW level, before the gain below lifts quiet sounds.
const TARGET_RATE = 24000
const CHUNK_SAMPLES = 2400 // 100ms at 24kHz
const TARGET_LEVEL = 0.12
const MAX_GAIN = 5
const GATE = 0.004 // below this the signal is background noise — don't amplify it
// The click of pressing the record button lands in the first moments of the stream, and the speech model can
// mishear it as a stray word or phrase. Silence the first 400ms (still sent, as zeros, to keep timing).
const WARMUP_SAMPLES = TARGET_RATE * 0.4

const ABS_MIN = 0.01 // raw level below which a chunk is always treated as room noise
const REF_START = 0.07 // typical raw level of a voice close to the microphone, until the real speaker is heard
const REF_MIN = 0.03 // the speaker reference never decays below this, so background can't become "the speaker"
const REF_DECAY = 0.9985 // per 100ms chunk: forgets a louder past slowly (about a minute)
const HANG_CHUNKS = 5 // keep passing audio for 500ms after the last speech
const PREROLL_CHUNKS = 3 // keep the 300ms before speech opens the gate, so soft first words ("My wife…") survive
const MAX_SILENT_RUN = 3 // send at most 300ms of silence in a row; the rest is dropped so the model never sees long dead stretches

class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super()
    this.env = 0
    this.gain = 1
    this.buf = new Int16Array(CHUNK_SAMPLES)
    this.len = 0
    this.levelSum = 0
    this.levelCount = 0
    this.pos = 0 // fractional read position when resampling
    this.carry = 0 // last sample of the previous block, for interpolation across blocks
    this.warmup = WARMUP_SAMPLES
    this.gateOn = true
    this.gateRatio = 0.28
    this.ref = REF_START
    this.hang = 0
    this.prevRms = 0
    this.silentRun = 0
    this.speakerLevel = 0 // the reference as it stood when speech was last heard — what the page remembers for next time
    this.noLearn = false // a sound that is not the customer (Juno's own "Mm-hm") is playing: keep passing audio, but do not learn from it
    this.frozen = false // Juno is speaking out loud: its voice must not teach the filter what "the speaker" sounds like
    this.savedRef = REF_START
    this.queue = [] // recent background chunks, held briefly so they can be released if speech begins right after them
    this.hangChunks = HANG_CHUNKS
    this.minRun = 2 // loud chunks in a row needed to open the gate; 1 lets a one-word answer ("No.") through (set only for short-answer debriefs)
    this.port.onmessage = (e) => {
      const d = e.data || {}
      if (typeof d.gate === 'boolean') this.gateOn = d.gate
      if (typeof d.ratio === 'number') this.gateRatio = d.ratio
      if (typeof d.minRun === 'number') this.minRun = d.minRun >= 2 ? 2 : 1
      if (typeof d.hang === 'number') this.hangChunks = Math.max(1, Math.min(20, d.hang))
      if (typeof d.learn === 'boolean') this.noLearn = !d.learn
      if (typeof d.freeze === 'boolean' && d.freeze !== this.frozen) {
        if (d.freeze) {
          this.savedRef = this.ref
        } else {
          this.ref = this.savedRef // back to the customer's own level, as it was before Juno spoke
          this.hang = 0
          this.prevRms = 0
        }
        this.frozen = d.freeze
      }
      if (typeof d.ref === 'number') this.ref = Math.max(REF_MIN, Math.min(0.3, d.ref)) // a remembered voice level from earlier sessions
    }
  }

  /** Is this 100ms chunk foreground (speech) rather than background? Also tracks the speaker's typical level. */
  decide(rms) {
    if (!this.gateOn) return true
    if (this.frozen) return false
    // Speech opens the gate only if it stays loud for two chunks (200ms): a short burst from a TV or a slammed door
    // is not an utterance. (Once open, the half-second hangover bridges the natural dips inside real speech.)
    const sustained = this.minRun <= 1 ? rms : Math.min(rms, this.prevRms)
    this.prevRms = rms
    const loud = sustained >= Math.max(ABS_MIN, this.gateRatio * this.ref)
    if (this.noLearn) {
      if (loud) this.hang = this.hangChunks
      else if (this.hang > 0) this.hang--
      return loud || this.hang > 0
    }
    if (loud) {
      this.ref += (rms - this.ref) * (rms > this.ref ? 0.3 : 0.05)
      this.speakerLevel = this.ref
      this.hang = this.hangChunks
    } else if (this.hang > 0) {
      this.hang--
    }
    this.ref = Math.max(REF_MIN, this.ref * REF_DECAY)
    return loud || this.hang > 0
  }

  /** Send a chunk on to the page. */
  pass(c) {
    this.silentRun = 0
    this.port.postMessage({ pcm: c.buf.buffer, amp: c.amp, gated: false, ref: this.speakerLevel }, [c.buf.buffer])
  }

  /** A chunk that stayed background: a short stretch is sent as silence (so the server still finds the gap between
   *  utterances); beyond that nothing is sent at all. */
  background(c) {
    this.silentRun++
    if (this.silentRun > MAX_SILENT_RUN) {
      this.port.postMessage({ amp: c.amp, gated: true, ref: this.speakerLevel })
      return
    }
    c.buf.fill(0)
    this.port.postMessage({ pcm: c.buf.buffer, amp: c.amp, gated: true, ref: this.speakerLevel }, [c.buf.buffer])
  }

  push(sample) {
    if (this.warmup > 0) {
      this.warmup--
      sample = 0
    }
    const s = Math.max(-1, Math.min(1, sample))
    this.buf[this.len++] = s < 0 ? s * 0x8000 : s * 0x7fff
    if (this.len === CHUNK_SAMPLES) {
      const rms = Math.sqrt(this.levelSum / Math.max(1, this.levelCount))
      const open = this.warmup > 0 ? true : this.decide(rms)
      this.queue.push({ buf: this.buf, open, amp: Math.min(1, rms * 4) })
      if (open || !this.gateOn) {
        // Speech: everything held so far (the lead-in) goes with it.
        for (const c of this.queue) this.pass(c)
        this.queue.length = 0
      } else {
        while (this.queue.length > PREROLL_CHUNKS) this.background(this.queue.shift())
      }
      this.buf = new Int16Array(CHUNK_SAMPLES)
      this.len = 0
      this.levelSum = 0
      this.levelCount = 0
    }
  }

  process(inputs) {
    const input = inputs[0] && inputs[0][0]
    if (!input) return true

    let sq = 0
    for (let i = 0; i < input.length; i++) sq += input[i] * input[i]
    const rms = Math.sqrt(sq / input.length)
    this.env += (rms - this.env) * (rms > this.env ? 0.3 : 0.02)
    const desired = this.env > GATE ? Math.min(MAX_GAIN, Math.max(1, TARGET_LEVEL / this.env)) : 1
    // Rise slowly (no pumping on breaths), fall fast (no clipping on loud words).
    this.gain += (desired - this.gain) * (desired > this.gain ? 0.02 : 0.25)

    const ratio = sampleRate / TARGET_RATE
    for (let i = 0; i < input.length; i++) {
      const x = input[i] * this.gain
      this.levelSum += input[i] * input[i]
      this.levelCount++
      if (ratio === 1) {
        this.push(x)
      } else {
        // Linear-interpolating resampler for contexts that couldn't run at 24kHz.
        while (this.pos < 1) {
          this.push(this.carry + (x - this.carry) * this.pos)
          this.pos += ratio
        }
        this.pos -= 1
        this.carry = x
      }
    }
    return true
  }
}

registerProcessor('pcm-worklet', PcmWorklet)
