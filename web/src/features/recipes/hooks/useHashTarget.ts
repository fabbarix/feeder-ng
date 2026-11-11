import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

/** How long the target stays highlighted (rx-pt.md section 5.3). */
const HIGHLIGHT_MS = 2000

/** The number after `prefix` in a location hash such as `#preference-member-2`, or null. */
function targetOf(hash: string, prefix: string): number | null {
  if (!hash.startsWith(`#${prefix}`)) return null
  const rest = hash.slice(prefix.length + 1)
  return /^\d+$/.test(rest) ? Number(rest) : null
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * For the location hash `#<prefix><n>` returns n while the element with that id is highlighted, scrolls it into view
 * once per hash (smoothly, or at once for reduced motion), and clears the highlight after about two seconds.
 * Null otherwise, and when the element is not on the page (yet): the check runs after every render, so a table
 * that loads later is still reached. See rx-pt.md section 5.3.
 */
export function useHashTarget(prefix: string): number | null {
  const { hash } = useLocation()
  const [lit, setLit] = useState<number | null>(null)
  const handled = useRef('')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const id = targetOf(hash, prefix)
    if (id === null || handled.current === hash) return
    const element = document.getElementById(`${prefix}${id}`)
    if (!element) return
    handled.current = hash
    element.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
    setLit(id)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setLit(null), HIGHLIGHT_MS)
  })

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return lit
}
