import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { resolveChip, type LegacyChipTone } from './lib/legacy'
import { isTagColour } from '../lib/tags/palette'
import './Chip.css'

export type ChipKind = 'why' | 'state' | 'status' | 'tag' | 'filter' | 'count'
/** Fixed status palette (plan 3.1): `--status-<name>-fg|bg|solid`. */
export type ChipStatus = 'leftover' | 'spoil' | 'danger' | 'success' | 'pinned' | 'info'
/** @deprecated use `kind` (+ `status`). */
export type ChipTone = LegacyChipTone

export interface ChipProps {
  /** Default `tag`; a clickable chip without a kind is a `filter`. */
  kind?: ChipKind
  /** Colour of `state` and `status` chips. */
  status?: ChipStatus
  /** An outlined status chip (system.md 6): "Leftover for" is `kind="status" status="leftover" outline`. */
  outline?: boolean
  /** @deprecated use `kind` (+ `status`). */
  tone?: ChipTone
  /** An IconName; a ReactNode is still accepted for unmigrated call sites (deprecated). */
  icon?: IconName | ReactNode
  /** Filter chips: on/off. Renders aria-pressed and a Check icon when on. */
  selected?: boolean
  disabled?: boolean
  /** A TagColourId (spec 4.1): a `tag` or `filter` chip is tinted (a filter only while selected) and shows a leading dot. Unknown ids are ignored. */
  tagColour?: string
  onClick?: () => void
  /** Accessible name of a clickable chip when it must say more than its text (it should start with the visible text). */
  label?: string
  /** Id of an element that describes a clickable chip (the screen reader reads it after the name). */
  'aria-describedby'?: string
  children: ReactNode
}

/** Icon a `state` or `status` chip shows when none is given (docs/design/ui-fix-plan.md 4.3). */
const DEFAULT_ICON: Partial<Record<ChipStatus, { state: IconName; status: IconName }>> = {
  pinned: { state: 'pinned', status: 'pinned' },
  info: { state: 'info', status: 'info' },
  success: { state: 'cooked', status: 'cooked' },
  danger: { state: 'notCooked', status: 'spoiled' },
  leftover: { state: 'leftover', status: 'leftover' },
  spoil: { state: 'goesOff', status: 'goesOff' },
}

/** The icon a status shows by default (a `state` chip's glyph; the status chip and ListRow meta use the same). */
export function defaultStatusIcon(status: ChipStatus): IconName | undefined {
  return DEFAULT_ICON[status]?.status
}

function renderIcon(icon: IconName | ReactNode, size: 14): ReactNode {
  return typeof icon === 'string' ? <Icon name={icon as IconName} size={size} /> : icon
}

/**
 * A chip carries meaning, never a raw fact (docs/design/ui-fix-plan.md 4.3). Clickable chips render a button;
 * a filter chip shows aria-pressed and a Check while selected.
 */
export function Chip({ kind, status, outline, tone, icon, selected, disabled, tagColour, onClick, label, 'aria-describedby': describedBy, children }: ChipProps) {
  const resolved = resolveChip({ kind, status, tone, clickable: Boolean(onClick) })
  let finalKind = resolved.kind
  if ((finalKind === 'state' || finalKind === 'status') && !resolved.status) {
    if (import.meta.env.DEV) console.warn(`Chip kind "${finalKind}" needs a status; rendering it as a tag.`)
    finalKind = 'tag'
  }
  const finalStatus = finalKind === 'state' || finalKind === 'status' ? resolved.status : undefined

  // spec 4.1: a Tag colour tints a tag chip, and a filter chip only while it is selected; an unknown id is neutral.
  const tagged = (finalKind === 'tag' || finalKind === 'filter') && isTagColour(tagColour) ? tagColour : undefined
  const showDot = Boolean(tagged) && (finalKind === 'tag' || !selected)

  let leading: ReactNode = null
  if (icon) leading = renderIcon(icon, 14)
  else if (finalKind === 'filter' && selected) leading = <Icon name="tick" size={14} />
  else if (finalStatus) {
    const fallback = DEFAULT_ICON[finalStatus]?.[finalKind === 'state' ? 'state' : 'status']
    if (fallback) leading = <Icon name={fallback} size={14} />
  }

  // One line (system.md 6): the label truncates, and the full text is the tooltip (and the name, unless `label` says more).
  const content = (
    <>
      {showDot ? <span className="chip__dot" aria-hidden="true" /> : null}
      {leading}
      <span className="chip__label">{children}</span>
    </>
  )
  const attrs = {
    'data-kind': finalKind,
    'data-status': finalStatus,
    'data-tone': tone,
    'data-tag-colour': tagged,
    'data-outline': outline ? 'true' : undefined,
    title: typeof children === 'string' ? children : label,
  }

  if (onClick || finalKind === 'filter') {
    return (
      <button
        type="button"
        className="chip"
        {...attrs}
        aria-pressed={finalKind === 'filter' ? selected : undefined}
        aria-label={label}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={onClick}
      >
        {content}
      </button>
    )
  }
  return (
    <span className="chip" {...attrs}>
      {content}
    </span>
  )
}
