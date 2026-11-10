// Timer alarm sound adapter. Production beeps with WebAudio; tests use FakeAlarm.

export interface AlarmAdapter {
  /** Starts a repeating beep (a beep every second) until stop(). Playing twice rings once. */
  play(): void
  stop(): void
}

export interface AudioContextLike {
  currentTime: number
  destination: unknown
  state: string
  resume(): Promise<void>
  close(): Promise<void>
  createOscillator(): { frequency: { value: number }; connect(n: unknown): void; start(t: number): void; stop(t: number): void }
  createGain(): { gain: { value: number }; connect(n: unknown): void }
}

/** A 0.3 s sine beep at 880 Hz every second. The AudioContext is created on the first play(); an unavailable one makes play() a no-op. */
export function createWebAudioAlarm(makeContext: () => AudioContextLike | null = defaultContext): AlarmAdapter {
  let ctx: AudioContextLike | null = null
  let tried = false
  let timer: ReturnType<typeof setInterval> | null = null

  const beep = (context: AudioContextLike) => {
    const osc = context.createOscillator()
    const gain = context.createGain()
    gain.gain.value = 0.3
    osc.frequency.value = 880
    osc.connect(gain)
    gain.connect(context.destination)
    const t = context.currentTime
    osc.start(t)
    osc.stop(t + 0.3)
  }

  return {
    play() {
      if (timer !== null) return
      if (!tried) {
        tried = true
        ctx = makeContext()
      }
      if (!ctx) return
      if (ctx.state === 'suspended') void ctx.resume()
      const context = ctx
      beep(context)
      timer = setInterval(() => beep(context), 1000)
    },
    stop() {
      if (timer !== null) clearInterval(timer)
      timer = null
    },
  }
}

function defaultContext(): AudioContextLike | null {
  try {
    const w = window as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike }
    const Ctor = w.AudioContext ?? w.webkitAudioContext
    return Ctor ? new Ctor() : null
  } catch {
    return null
  }
}
