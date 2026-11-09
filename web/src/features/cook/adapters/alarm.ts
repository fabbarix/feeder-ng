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
export function createWebAudioAlarm(_makeContext?: () => AudioContextLike | null): AlarmAdapter {
  throw new Error('TODO')
}
