// One section of the review: its heading with the count, and its rows as a labelled list. The whole row is the target (A11Y-09): a click
// anywhere on a row that is not on one of its own controls toggles its checkbox, or opens Add… on a row that is not set up. One listener
// for the list; the keyboard uses the row's checkbox or button.
import type { MouseEvent } from 'react'
import { ReviewRow } from './ReviewRow'
import type { ReviewRowView } from '../lib/reviewRows'

export interface ReviewSectionProps {
  title: string
  items: ReviewRowView[]
  onToggle: (id: string) => void
  onOpenAdd: (id: string) => void
}

export function ReviewSection({ title, items, onToggle, onOpenAdd }: ReviewSectionProps) {
  const onClick = (e: MouseEvent<HTMLUListElement>) => {
    const target = e.target as Element
    if (target.closest('button, input, label, a')) return
    const id = target.closest<HTMLElement>('li[data-proposal]')?.dataset.proposal
    const view = items.find((v) => v.id === id)
    if (!view || (view.isMissing && !view.hasCheckbox)) return
    if (view.needsForm) onOpenAdd(view.id)
    else onToggle(view.id)
  }
  return (
    <section className="receipt-section">
      <h2 className="receipt-section__title">{`${title} (${items.length})`}</h2>
      <ul className="receipt-section__list" aria-label={title} onClick={onClick}>
        {items.map((view) => (
          <ReviewRow key={view.id} view={view} onToggle={onToggle} onOpenAdd={onOpenAdd} />
        ))}
      </ul>
    </section>
  )
}
