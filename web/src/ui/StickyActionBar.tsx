import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useScrollFocusClearOfBar, useStickyBarClearance } from './useStickyBarClearance'
import './StickyActionBar.css'

export interface StickyActionBarProps {
  /** Usually a FormActions row. */
  children: ReactNode
  /** Accessible name of the group (default "Actions"). */
  label?: string
  /** The column the bar is as wide as: the whole Page column (default), the narrow form column (720) or the editor form column (840). */
  column?: 'page' | 'narrow' | 'form'
  /** Whether the bar floats (default true). False ends the form in flow, without floating, for a bar with nothing to do yet (SHORT-06). */
  sticky?: boolean
}

/**
 * The actions of a page form, stuck to the bottom of the viewport: opaque, one row, as wide as its column.
 * Pages only; sheets and dialogs own their FormActions footer.
 */
export function StickyActionBar({ children, label = 'Actions', column = 'page', sticky = true }: StickyActionBarProps) {
  const sentinel = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  useStickyBarClearance(bar, sticky)
  useScrollFocusClearOfBar(bar, sticky)
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
      <div ref={bar} className="sticky-action-bar" role="group" aria-label={label} data-column={column} data-sticky={sticky ? 'true' : 'false'} data-stuck={stuck ? 'true' : 'false'}>
        <div className="sticky-action-bar__inner">{children}</div>
      </div>
    </>
  )
}
