import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Button } from './Button'
import { uiStrings } from './strings'
import './BottomSheet.css'

export interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children?: ReactNode
}

/** A modal panel that rises from the bottom. Escape, backdrop and Close all dismiss it. */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="sheet-layer">
      <div data-testid="bottom-sheet-backdrop" className="sheet-backdrop" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="sheet"
      >
        <h2 id={titleId} className="sheet__title">
          {title}
        </h2>
        <div className="sheet__body">{children}</div>
        <Button variant="ghost" onClick={onClose}>
          {uiStrings.close}
        </Button>
      </div>
    </div>
  )
}
