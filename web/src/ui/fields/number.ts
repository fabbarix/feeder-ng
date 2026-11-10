export type ParsedNumber = { kind: 'empty' } | { kind: 'invalid' } | { kind: 'number'; value: number }

/** Accepts "2.5" and "2,5", surrounding spaces; "" is empty; anything else (including "1e3", "1.2.3") is invalid. */
export function parseNumber(_text: string): ParsedNumber {
  throw new Error('not implemented')
}

export function clamp(_value: number, _min?: number, _max?: number): number {
  throw new Error('not implemented')
}

/** Rounds to the decimals of `step` (and of `value`), so 0.1 + 0.2 steps to 0.3, not 0.30000000000000004. */
export function stepValue(_value: number, _direction: 1 | -1, _opts: { step: number; min?: number; max?: number }): number {
  throw new Error('not implemented')
}
