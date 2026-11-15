// B9-27 (RX-05): whether a line-clamped text is cut, so "Show more" shows only when there is more. It measures the element after
// every render of its deps and again when its box is resized (a rotated phone, a wider column).
import { useLayoutEffect, useState, type RefObject } from 'react'

/** True when the element's content is taller than its box (the clamp cuts it). False until measured, and without layout (jsdom). */
export function useIsClamped(ref: RefObject<HTMLElement | null>, deps: readonly unknown[] = []): boolean {
  const [clamped, setClamped] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the caller says what changes the text
  }, [ref, ...deps])
  return clamped
}
