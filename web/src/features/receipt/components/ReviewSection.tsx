// One section of the review: its heading with the count, and its rows as a labelled list.
import { ReviewRow } from './ReviewRow'
import type { ReviewRowView } from '../lib/reviewRows'

export interface ReviewSectionProps {
  title: string
  items: ReviewRowView[]
  onToggle: (id: string) => void
  onOpenAdd: (id: string) => void
}

export function ReviewSection({ title, items, onToggle, onOpenAdd }: ReviewSectionProps) {
  return (
    <section className="receipt-section">
      <h2 className="receipt-section__title">{`${title} (${items.length})`}</h2>
      <ul className="receipt-section__list" aria-label={title}>
        {items.map((view) => (
          <ReviewRow key={view.id} view={view} onToggle={onToggle} onOpenAdd={onOpenAdd} />
        ))}
      </ul>
    </section>
  )
}
