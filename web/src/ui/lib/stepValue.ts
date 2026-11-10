/** Decimal places of a finite number as written (0.25 -> 2). */
function decimalsOf(n: number): number {
  const text = String(n)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}

/** Clamps `value` into the optional bounds. */
export function clampTo(value: number, min?: number, max?: number): number {
  let out = value
  if (min !== undefined && out < min) out = min
  if (max !== undefined && out > max) out = max
  return out
}

/** One step up (1) or down (-1), rounded to the decimals of the step and the value (no 0.30000000000000004), clamped. */
export function stepValue(value: number, direction: 1 | -1, opts: { step: number; min?: number; max?: number }): number {
  const decimals = Math.max(decimalsOf(opts.step), decimalsOf(value))
  const next = Number((value + direction * opts.step).toFixed(decimals))
  return clampTo(next, opts.min, opts.max)
}
