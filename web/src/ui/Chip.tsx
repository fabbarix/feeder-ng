import type { ReactNode } from 'react'
import type { IconName } from './icons'
import type { LegacyChipTone } from './lib/legacy'

export type ChipKind = 'why' | 'state' | 'status' | 'tag' | 'filter' | 'count'
/** Fixed status palette (plan 3.1): `--status-<name>-fg|bg|solid`. */
export type ChipStatus = 'leftover' | 'spoil' | 'danger' | 'success' | 'pinned'
/** @deprecated use `kind` (+ `status`). */
export type ChipTone = LegacyChipTone

export interface ChipProps {
  /** Default `tag`; a clickable chip without a kind is a `filter`. */
  kind?: ChipKind
  /** Colour of `state` and `status` chips. */
  status?: ChipStatus
  /** @deprecated use `kind` (+ `status`). */
  tone?: ChipTone
  /** An IconName; a ReactNode is still accepted for unmigrated call sites (deprecated). */
  icon?: IconName | ReactNode
  /** Filter chips: on/off. Renders aria-pressed and a Check icon when on. */
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  'data-kind'?: string
  children: ReactNode
}

/** STUB (WP3 designer, existing implementation retained). Spec: docs/dev/design/wp3-primitives-a.md. */
export function Chip({ tone = 'neutral', icon, selected, disabled, onClick, 'data-kind': dataKind, children }: ChipProps) {
  const content = (
    <>
      {icon ? <span className="chip__icon" aria-hidden="true">{icon}</span> : null}
      {children}
    </>
  )
  if (onClick) {
    return (
      <button type="button" className="chip chip--button" data-tone={tone} data-kind={dataKind} aria-pressed={selected} disabled={disabled} onClick={onClick}>
        {content}
      </button>
    )
  }
  return <span className="chip" data-tone={tone} data-kind={dataKind}>{content}</span>
}
