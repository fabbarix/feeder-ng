// The Scanned list's row for a background read of this Shop (b8-rxweb, design 3.3): reading, ready or failed. It shows what
// lib/backgroundCopy.rowView says; the press decisions are the footer's (onOpen, onDismiss).
import { IconButton, ListRow } from '../../../ui'
import { PHOTOS_PATH, REVIEW_PATH, rowView } from '../lib/backgroundCopy'
import type { BackgroundRead } from '../lib/backgroundRead'
import { receiptStrings as t } from '../strings'

export interface BackgroundReadRowProps {
  state: BackgroundRead
  isAdmin: boolean
  /** Opens the progress, the photos or the Receipt review. */
  onOpen: (to: typeof PHOTOS_PATH | typeof REVIEW_PATH) => void
  onDismiss: () => void
}

export function BackgroundReadRow({ state, isAdmin, onOpen, onDismiss }: BackgroundReadRowProps) {
  const view = rowView(state, { isAdmin })
  const to = view.goes === 'review' ? REVIEW_PATH : PHOTOS_PATH
  if (view.kind === 'reading') {
    // The title is the polite live region; the row's name is the same words, so the button is still named by its title.
    return (
      <ListRow
        title={<span role="status" aria-live="polite">{view.title}</span>}
        aria-label={view.title}
        meta={view.meta}
        icon="receipt"
        chevron
        onActivate={() => onOpen(to)}
      />
    )
  }
  if (view.kind === 'ready') {
    return <ListRow title={view.title} meta={view.meta} icon="receipt" chevron onActivate={() => onOpen(to)} />
  }
  return (
    <ListRow
      title={view.title}
      meta={view.meta}
      icon="receipt"
      chevron
      onActivate={() => {
        onDismiss()
        onOpen(to)
      }}
      trailing={<IconButton icon="close" label={t.dismiss} onClick={onDismiss} />}
    />
  )
}
