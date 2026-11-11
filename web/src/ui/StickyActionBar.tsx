import { useEffect, useRef, useState, type ReactNode } from 'react'
import './StickyActionBar.css'

export interface StickyActionBarProps {
  /** Usually a FormActions row. */
  children: ReactNode
  /** Accessible name of the group (default "Actions"). */
  label?: string
  /** Where the inner row aligns: the whole Page column (default) or the narrow form column. */
  column?: 'page' | 'narrow'
}

/**
 * The actions of a page form, stuck to the bottom of the viewport: opaque, as wide as the Page container, aligned to the form column.
 * Pages only; sheets and dialogs own their FormActions footer.
 */
export function StickyActionBar({ children, label = 'Actions', column = 'page' }: StickyActionBarProps) {
  const sentinel = useRef<HTMLSpanElement>(null)
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const el = sentinel.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      const last = entries[entries.length - 1]
      if (last) setStuck(!last.isIntersecting)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <>
      {/* The sentinel stays at the bar's natural position (it is not inside the sticky element, which would carry it along). */}
      <span ref={sentinel} className="sticky-action-bar__sentinel" aria-hidden="true" />
      <div className="sticky-action-bar" role="group" aria-label={label} data-column={column} data-stuck={stuck ? 'true' : 'false'}>
        <div className="sticky-action-bar__inner">{children}</div>
      </div>
    </>
  )
}
