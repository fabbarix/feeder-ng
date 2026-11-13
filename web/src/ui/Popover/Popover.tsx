// hf-recipes-filter: a panel anchored to its trigger from 768 px (a non-modal dialog, floated in the top layer), and the modal
// BottomSheet below that (docs/design/recipes-filter.md 7.1). Escape and an outside click close it; closing it by its own
// controls returns focus to the trigger.
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { BottomSheet } from '../BottomSheet'
import { floatingPopoverAttr, useFloatingPopover } from '../lib/useFloatingPopover'
import { useMediaQuery } from '../lib/useMediaQuery'
import { INTERACTIVE_SELECTOR } from '../lib/useModalDialog'
import './Popover.css'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  /** The trigger: the panel floats under it and gets focus back when it closes. */
  anchorRef: RefObject<HTMLElement | null>
  /** Shown as the heading of the panel (and the name of its dialog). */
  title: string
  className?: string
  /** The panel's id (the trigger's aria-controls). */
  id?: string
  children?: ReactNode
  footer?: ReactNode
}

export function Popover({ open, onClose, anchorRef, title, className, id, children, footer }: PopoverProps) {
  const phone = !useMediaQuery('(min-width: 768px)')
  if (phone) {
    return (
      <BottomSheet open={open} onClose={onClose} title={title} footer={footer}>
        <div id={id}>{children}</div>
      </BottomSheet>
    )
  }
  return open ? (
    <FloatingPopover onClose={onClose} anchorRef={anchorRef} title={title} className={className} id={id} footer={footer}>
      {children}
    </FloatingPopover>
  ) : null
}

type FloatingProps = Omit<PopoverProps, 'open'>

function FloatingPopover({ onClose, anchorRef, title, className, id, children, footer }: FloatingProps) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFloatingPopover(true, anchorRef, panel, 'flex')

  // Opening puts focus on the first control of the body.
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>(INTERACTIVE_SELECTOR)?.focus()
  }, [])

  // Outside click and Escape close it. A key that the field inside already used (Escape clears its search) is left alone.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panel.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      onClose()
      anchorRef.current?.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchorRef, onClose])

  // Closed by one of its own controls (Done, Clear): focus that was inside, or lost with the removed panel, goes back to the trigger.
  useEffect(() => {
    const el = panel.current
    return () => {
      const active = document.activeElement
      if (!active || active === document.body || (el && el.contains(active))) anchorRef.current?.focus()
    }
  }, [anchorRef])

  return (
    <div ref={panel} id={id} role="dialog" aria-labelledby={titleId} popover={floatingPopoverAttr()} className={['popover', className].filter(Boolean).join(' ')}>
      <h2 id={titleId} className="popover__title">
        {title}
      </h2>
      <div className="popover__body">{children}</div>
      {footer ? <div className="popover__footer">{footer}</div> : null}
    </div>
  )
}
