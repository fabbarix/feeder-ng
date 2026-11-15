// SAFE-01 (B9-18): the notice an editor shows when it brings back a reload draft, or offers one. An info status Tile, a status
// region named by its title; it never takes focus. The history icon leads (decorative, as the approved safe-01 mock draws it), the
// title and meta follow, and the buttons are outline (secondary), small, in the order given; at most two. They sit under the text,
// or at its end when the notice is wide (DraftNotice.css). The words come from lib/drafts/draftCopy.ts, so every editor with a
// reload draft says the same.
import { useId } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'
import { Tile } from './Tile'
import './DraftNotice.css'

export interface DraftNoticeAction {
  label: string
  onClick: () => void
  ariaLabel?: string
}

export interface DraftNoticeProps {
  title: string
  meta?: string
  /** At most two; a third is a programming error and is not drawn. */
  actions: DraftNoticeAction[]
}

const MAX_ACTIONS = 2

export function DraftNotice({ title, meta, actions }: DraftNoticeProps) {
  const titleId = useId()
  return (
    <Tile variant="status" status="info" span="full" role="status" aria-labelledby={titleId} className="draft-notice">
      <div className="draft-notice__body">
        <Icon name="history" size={20} />
        <div className="draft-notice__text">
          <p id={titleId} className="draft-notice__title">
            {title}
          </p>
          {meta ? <p className="draft-notice__meta">{meta}</p> : null}
        </div>
        {actions.length > 0 ? (
          <div className="draft-notice__actions">
            {actions.slice(0, MAX_ACTIONS).map((action) => (
              <Button key={action.label} variant="secondary" size="sm" aria-label={action.ariaLabel} onClick={action.onClick}>
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </Tile>
  )
}
