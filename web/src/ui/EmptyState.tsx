import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import './EmptyState.css'

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

/** Inside the empty region, not a page takeover (docs/design/ui-fix-plan.md 4.11). */
export function EmptyState({ title, description, icon, illustration, headingLevel = 2, action }: EmptyStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <section className="empty-state">
      {icon ? (
        <div className="empty-state__art">
          <Icon name={icon} size={64} weight="duotone" />
        </div>
      ) : illustration ? (
        <div className="empty-state__art">{illustration}</div>
      ) : null}
      <Heading className="empty-state__title">{title}</Heading>
      {description ? <p className="empty-state__text">{description}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </section>
  )
}
