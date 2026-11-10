import type { ReactNode } from 'react'
import type { IconName } from './icons'

export interface EmptyStateProps {
  title: string
  description?: string
  /** Rendered 64 px duotone in a 96 px soft circle. */
  icon?: IconName
  /** @deprecated use `icon`. */
  illustration?: ReactNode
  /** Heading level of the title (default 2). */
  headingLevel?: 2 | 3
  action?: ReactNode
}

/** STUB (WP3 designer, old behaviour retained). Inside the empty region, not a page takeover. */
export function EmptyState({ title, description, illustration, action }: EmptyStateProps) {
  return (
    <section className="empty-state">
      {illustration ? <div className="empty-state__art">{illustration}</div> : null}
      <h2 className="empty-state__title">{title}</h2>
      {description ? <p className="empty-state__text">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </section>
  )
}
