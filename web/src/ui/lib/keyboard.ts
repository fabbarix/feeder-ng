// B9-19 (SHORT-04, decision SHORT 2): on-screen keyboard detection as pure functions. The keyboard is "up" while a text field has
// focus on a coarse pointer; its height is what the visual viewport lost.

/** How long the bar waits after focus leaves a field before it returns, so moving to the next field does not flicker it. */
export const KEYBOARD_RESTORE_MS = 150

/** Input types that bring a keyboard up. Date and time open a picker instead. */
const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password', 'number'])

/** Whether focusing `el` brings the on-screen keyboard up: an enabled, writable text input, a textarea or a contenteditable. */
export function isTextEntry(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    if (el.hasAttribute('disabled') || el.hasAttribute('readonly')) return false
    if ((el as HTMLInputElement | HTMLTextAreaElement).readOnly || (el as HTMLInputElement | HTMLTextAreaElement).disabled) return false
    if (tag === 'TEXTAREA') return true
    return TEXT_TYPES.has((el.getAttribute('type') ?? 'text').toLowerCase())
  }
  const editable = el.getAttribute('contenteditable')
  return editable !== null && editable.toLowerCase() !== 'false'
}

/** The keyboard is open only for a text field on a coarse pointer. */
export function keyboardOpen({ coarse, textEntryFocused }: { coarse: boolean; textEntryFocused: boolean }): boolean {
  return coarse && textEntryFocused
}

/** The keyboard's height: the part of the layout viewport the visual viewport no longer shows below it. Never negative. */
export function keyboardInset({ innerHeight, vvHeight, vvOffsetTop }: { innerHeight: number; vvHeight: number; vvOffsetTop: number }): number {
  return Math.max(0, Math.round(innerHeight - vvHeight - vvOffsetTop))
}
