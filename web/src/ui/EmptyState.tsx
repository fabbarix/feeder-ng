import type { ReactNode } from 'react'

export interface EmptyStateProps {
  title: string
  description?: string
  illustration?: ReactNode
  action?: ReactNode
}

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
