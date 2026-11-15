import { DISCLOSURE_OPEN_EVENT } from '../Disclosure'

const INVALID = '[aria-invalid="true"], [data-invalid-target]'
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'

const isDisabled = (el: Element) => (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true'
const isFocusable = (el: Element) => el.matches(FOCUSABLE) && !isDisabled(el) && (el as HTMLElement).tabIndex >= 0

/** Opens every closed Disclosure around `el`, outermost last; each opens synchronously so the field is shown before focus. */
function openDisclosuresAround(el: Element) {
  for (let section = el.closest('[data-disclosure]'); section; section = section.parentElement?.closest('[data-disclosure]') ?? null) {
    section.dispatchEvent(new CustomEvent(DISCLOSURE_OPEN_EVENT))
  }
}

/** Hidden by an ancestor other than a Disclosure body (which opens on request). */
function isHidden(el: Element) {
  for (let node = el.closest('[hidden]'); node; node = node.parentElement?.closest('[hidden]') ?? null) {
    if (!node.classList.contains('disclosure__body')) return true
  }
  return false
}

/** The element to focus for an invalid target: itself, its [data-focus-target], or its first focusable descendant (a group's tab stop). */
function focusTargetOf(el: HTMLElement): HTMLElement | null {
  if (isFocusable(el)) return el
  const marked = el.querySelector<HTMLElement>('[data-focus-target]')
  if (marked && !isDisabled(marked)) return marked
  return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).find((c) => isFocusable(c) && !isHidden(c)) ?? null
}

/**
 * SAFE-04: focuses the first invalid control under `root` in DOM order (`[aria-invalid="true"]` or a `[data-invalid-target]`
 * section), skipping disabled and hidden ones. It opens a closed Disclosure around it first, scrolls it to the centre (the
 * scroll margin keeps it clear of the bars) and focuses it without a second scroll. Returns the element focused, or null.
 */
export function focusFirstInvalid(root: ParentNode | null | undefined): HTMLElement | null {
  if (!root) return null
  for (const candidate of Array.from(root.querySelectorAll<HTMLElement>(INVALID))) {
    if (isDisabled(candidate) || isHidden(candidate)) continue
    const target = focusTargetOf(candidate)
    if (!target) continue
    openDisclosuresAround(target)
    target.scrollIntoView({ block: 'center' })
    target.focus({ preventScroll: true })
    return target
  }
  return null
}
