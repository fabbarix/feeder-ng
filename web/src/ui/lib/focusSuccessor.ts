// B9-14 / A11Y-07: where focus goes when the focused row leaves its list. Pure.

/**
 * The next row of `before` after `focused` that is still in `after`, else the previous one still there, else null. A row
 * that is still in the list is its own answer; a key that was never in the list has none.
 */
export function focusSuccessor<T extends string>(before: readonly T[], after: readonly T[], focused: T): T | null {
  const kept = new Set(after)
  if (kept.has(focused)) return focused
  const at = before.indexOf(focused)
  if (at < 0) return null
  for (let i = at + 1; i < before.length; i++) if (kept.has(before[i]!)) return before[i]!
  for (let i = at - 1; i >= 0; i--) if (kept.has(before[i]!)) return before[i]!
  return null
}
