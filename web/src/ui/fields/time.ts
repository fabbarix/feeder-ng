/** "HH:mm" 24 h. Hour 0..23, minute 0..59. */
export interface TimeParts {
  hour: number
  minute: number
}

/** "07:05" -> {7,5}; "" or malformed -> null. */
export function parseTime(_value: string): TimeParts | null {
  throw new Error('not implemented')
}

export function formatTime(_parts: TimeParts): string {
  throw new Error('not implemented')
}

/** Step one segment with wrap-around and no carry: 23 + 1 -> 0 (hour); 0 - 1 -> 59 (minute). `step` multiplies the delta (minute step 5). */
export function stepSegment(_value: number, _direction: 1 | -1, _segment: 'hour' | 'minute', _step?: number): number {
  throw new Error('not implemented')
}
