// Speech-recognition adapter. Production uses the browser's SpeechRecognition
// where it exists; tests use FakeSpeech (adapters/fakes.ts).

export interface SpeechAdapter {
  /** False where the browser has no speech recognition (the toggle is then disabled). */
  readonly supported: boolean
  /** Starts listening; onTranscript gets each recognised phrase. Calling start twice listens once. */
  start(onTranscript: (text: string) => void): void
  /** Stops listening. Safe to call when not started. */
  stop(): void
}

/** The slice of the browser's recogniser the adapter uses. */
export interface RecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start(): void
  stop(): void
}

export interface SpeechWindow {
  SpeechRecognition?: new () => RecognitionLike
  webkitSpeechRecognition?: new () => RecognitionLike
}

/**
 * SpeechRecognition (or webkitSpeechRecognition) from win (default: window).
 * Continuous, final results only (each final result's best transcript goes to
 * onTranscript, trimmed). The browser stops recognition now and then: while
 * started, an `end` restarts it; a `not-allowed` or `service-not-allowed`
 * error stops for good. `supported` is false when neither constructor exists.
 */
export function createBrowserSpeech(win: SpeechWindow = defaultWindow()): SpeechAdapter {
  const Ctor = win.SpeechRecognition ?? win.webkitSpeechRecognition
  let wanted = false
  let refused = false
  let current: RecognitionLike | null = null
  return {
    supported: Ctor !== undefined,
    start(onTranscript) {
      if (!Ctor || wanted) return
      wanted = true
      refused = false
      const rec = new Ctor()
      rec.continuous = true
      rec.interimResults = false
      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i]!
          if (!result.isFinal) continue
          const text = result[0]!.transcript.trim()
          if (text) onTranscript(text)
        }
      }
      rec.onend = () => {
        if (!wanted || refused) return
        try {
          rec.start()
        } catch {
          // already running: nothing to do
        }
      }
      rec.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') refused = true
      }
      current = rec
      try {
        rec.start()
      } catch {
        // the browser refused to start; stays unlistened
      }
    },
    stop() {
      wanted = false
      const rec = current
      current = null
      try {
        rec?.stop()
      } catch {
        // already stopped
      }
    },
  }
}

function defaultWindow(): SpeechWindow {
  return typeof window !== 'undefined' ? (window as unknown as SpeechWindow) : {}
}
