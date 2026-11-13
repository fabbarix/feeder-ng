// The Filters panel of a filter header: the shared Popover (a popover from 768 px, a bottom sheet below) with a spaced body and the
// footer "Clear filters" and "Show …" (docs/design/recipes-filter.md 4, 8, 13.3; pantry-filter.md 5).
import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { Button } from '../Button'
import { Popover } from '../Popover/Popover'
import { filterBarStrings } from './strings'
import './FilterBar.css'

export interface FiltersPanelProps {
  id?: string
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  /** Filters in force: Clear filters is off while there are none. */
  count: number
  onClear: () => void
  /** The footer button that closes the panel ("Show Recipes", "Show Stock"); never "Done" (GLOSSARY) or "Close" (the sheet's ✕). */
  showLabel: string
  /** A feature class beside `filter-panel` (its width). */
  className?: string
  /** The panel's sections (FilterSection). */
  children: ReactNode
}

export function FiltersPanel({ id, open, onClose, anchorRef, count, onClear, showLabel, className, children }: FiltersPanelProps): ReactNode {
  const clear = useRef<HTMLButtonElement>(null)
  const show = useRef<HTMLButtonElement>(null)
  // Clear filters turns off once it has nothing to clear: its focus moves to the Show button.
  useEffect(() => {
    if (!open || count > 0) return
    const active = document.activeElement
    if (active === clear.current || active === document.body || active === null) show.current?.focus()
  }, [count, open])

  return (
    <Popover
      id={id}
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      title={filterBarStrings.panelTitle}
      className={['filter-panel', className].filter(Boolean).join(' ')}
      footer={
        <>
          <Button ref={clear} variant="tertiary" size="sm" disabled={count === 0} onClick={onClear}>
            {filterBarStrings.clear}
          </Button>
          <Button ref={show} variant="secondary" size="sm" onClick={onClose}>
            {showLabel}
          </Button>
        </>
      }
    >
      <div className="filter-panel__body">{children}</div>
    </Popover>
  )
}
