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
// NOTE: a "speech gate" (send silence unless the level beats the room's noise
// floor) was tried to stop the speech model inventing text from room noise. It
// cut real, quiet speech — the voice and the noise floor are too close in an
// ordinary room — so it was removed. Do not reintroduce a level gate without
// testing on quiet and fast speakers.
const TARGET_RATE = 24000
const CHUNK_SAMPLES = 2400 // 100ms at 24kHz
const TARGET_LEVEL = 0.12
const MAX_GAIN = 5
const GATE = 0.004 // below this the signal is background noise — don't amplify it
// The click of pressing the record button lands in the first moments of the stream, and the speech model can
// mishear it as a stray word or phrase. Silence the first 400ms (still sent, as zeros, to keep timing).
const WARMUP_SAMPLES = TARGET_RATE * 0.4

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
      this.port.postMessage({ pcm: this.buf.buffer, amp: Math.min(1, rms * 4) }, [this.buf.buffer])
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
