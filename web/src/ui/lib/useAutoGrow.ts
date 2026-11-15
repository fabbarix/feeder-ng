import { useLayoutEffect, type RefObject } from 'react'

const DEFAULT_MAX_ROWS = 12
const FALLBACK_LINE_HEIGHT = 20

const supportsFieldSizing = () => typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content')

/**
 * A11Y-12: a textarea grows with its text up to `maxRows` lines (default 12), then scrolls. Where the browser has
 * `field-sizing: content` the CSS does it and this hook does nothing.
 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, options: { maxRows?: number } = {}): void {
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || supportsFieldSizing()) return
    const style = getComputedStyle(el)
    const line = parseFloat(style.lineHeight) || FALLBACK_LINE_HEIGHT
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0)
    const max = maxRows * line + padding
    el.style.height = 'auto'
    const content = el.scrollHeight
    el.style.height = `${Math.min(content, max)}px`
    el.style.overflowY = content > max ? 'auto' : 'hidden'
  }, [ref, value, maxRows])
}
