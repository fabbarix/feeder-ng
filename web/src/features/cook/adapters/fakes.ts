// Test doubles for the adapters (used by the cook and board tests).
import type { AlarmAdapter } from './alarm'
import type { SpeechAdapter } from './speech'
import type { WakeLockAdapter } from './wakeLock'

export class FakeSpeech implements SpeechAdapter {
  supported: boolean
  listening = false
  startCalls = 0
  stopCalls = 0
  private handler: ((text: string) => void) | null = null
  constructor(supported = true) {
    this.supported = supported
  }
  start(onTranscript: (text: string) => void): void {
    this.startCalls += 1
    this.listening = true
    this.handler = onTranscript
  }
  stop(): void {
    this.stopCalls += 1
    this.listening = false
    this.handler = null
  }
  /** Pretends the microphone heard `text`. */
  say(text: string): void {
    this.handler?.(text)
  }
}

export class FakeWakeLock implements WakeLockAdapter {
  supported: boolean
  held = false
  acquireCalls = 0
  releaseCalls = 0
  constructor(supported = true) {
    this.supported = supported
  }
  async acquire(): Promise<void> {
    this.acquireCalls += 1
    if (this.supported) this.held = true
  }
  async release(): Promise<void> {
    this.releaseCalls += 1
    this.held = false
  }
  /** The system dropped the lock (tab hidden). */
  systemRelease(): void {
    this.held = false
  }
}

export class FakeAlarm implements AlarmAdapter {
  ringing = false
  playCalls = 0
  stopCalls = 0
  play(): void {
    this.playCalls += 1
    this.ringing = true
  }
  stop(): void {
    this.stopCalls += 1
    this.ringing = false
  }
}
