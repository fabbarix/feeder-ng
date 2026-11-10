/** "HH:mm" 24 h. Hour 0..23, minute 0..59. */
export interface TimeParts {
  hour: number
  minute: number
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

/** "07:05" -> {7,5}; "" or malformed -> null. */
export function parseTime(value: string): TimeParts | null {
  const match = TIME.exec(value)
  if (!match) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

export function formatTime(parts: TimeParts): string {
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

/** Step one segment with wrap-around and no carry: 23 + 1 -> 0 (hour); 0 - 1 -> 59 (minute). `step` multiplies the delta (minute step 5). */
export function stepSegment(value: number, direction: 1 | -1, segment: 'hour' | 'minute', step = 1): number {
  const size = segment === 'hour' ? 24 : 60
  const delta = segment === 'hour' ? direction : direction * step
  return (((value + delta) % size) + size) % size
}

export interface DigitResult {
  value: number
  /** Digit held for a second keystroke, or null once the segment is complete. */
  pending: number | null
  /** True when the segment is complete and focus moves on. */
  advance: boolean
}

/**
 * Typing into a segment: a second digit completes the value (clamped to the segment's maximum); a first digit that cannot
 * start a two-digit value (3-9 for the hour, 6-9 for the minute) completes at once, padded ("7" -> 07).
 */
export function applyDigit(pending: number | null, digit: number, segment: 'hour' | 'minute'): DigitResult {
  const max = segment === 'hour' ? 23 : 59
  if (pending !== null) return { value: Math.min(max, pending * 10 + digit), pending: null, advance: true }
  const cannotStartTwoDigits = segment === 'hour' ? digit >= 3 : digit >= 6
  if (cannotStartTwoDigits) return { value: digit, pending: null, advance: true }
  return { value: digit, pending: digit, advance: false }
}

/**
 * Text typed into a segment (an on-screen keypad or a paste): non-digits are ignored, the last two digits count, and the
 * result is clamped to the segment's maximum. Returns null when there is no digit at all (nothing to apply).
 */
export function segmentFromText(raw: string, segment: 'hour' | 'minute'): number | null {
  const digits = raw.replace(/\D/g, '').slice(-2)
  if (digits === '') return null
  const max = segment === 'hour' ? 23 : 59
  return Math.min(max, Number(digits))
}
