import type { ReactNode } from 'react'

export type ChipTone = 'neutral' | 'accent' | 'spoil' | 'leftover'

export interface ChipProps {
  tone?: ChipTone
  icon?: ReactNode
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  'data-kind'?: string
  children: ReactNode
}

/** A pill. A button (with aria-pressed when selected is given) when clickable. */
export function Chip({ tone = 'neutral', icon, selected, disabled, onClick, 'data-kind': kind, children }: ChipProps) {
  const content = (
    <>
      {icon ? <span className="chip__icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        className="chip chip--button"
        data-tone={tone}
        data-kind={kind}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
      >
        {content}
      </button>
    )
  }
  return (
    <span className="chip" data-tone={tone} data-kind={kind}>
      {content}
    </span>
  )
}
