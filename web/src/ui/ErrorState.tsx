import type { ReactNode } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'
import { overlayStrings } from './overlayStrings'
import './ErrorState.css'

export interface ErrorStateProps {
  /** e.g. "The plan could not be loaded." */
  message: string
  onRetry?: () => void
  /** Default 'Try again'. */
  retryLabel?: string
  /** B9-49 (TB-15c): a heading above the message, for a whole page's error ("Something went wrong"). */
  title?: string
  /** The heading's level (default 2); a page error that stands in for the page is its h1. */
  headingLevel?: 1 | 2
  /** The heading's id (a page error's heading is the route-focus target, #page-title). */
  headingId?: string
  /** Actions in place of the single retry button (a page error has Try again and Go to Today). */
  actions?: ReactNode
}

/** Inline danger status tile: role=alert, a warning icon, and an optional retry. Never presented as an empty state. */
export function ErrorState({ message, onRetry, retryLabel = overlayStrings.tryAgain, title, headingLevel = 2, headingId, actions }: ErrorStateProps) {
  const retry = onRetry ? (
    <Button variant="secondary" size="sm" onClick={onRetry}>
      {retryLabel}
    </Button>
  ) : null
  const icon = (
    <span className="error-state__icon" aria-hidden="true">
      <Icon name="error" size={24} />
    </span>
  )
  if (title === undefined) {
    return (
      <div role="alert" className="error-state">
        {icon}
        <p className="error-state__message">{message}</p>
        {actions ?? retry}
      </div>
    )
  }
  const Heading = headingLevel === 1 ? 'h1' : 'h2'
  return (
    <div role="alert" className="error-state" data-titled="true">
      {icon}
      <div className="error-state__text">
        <Heading className="error-state__title" id={headingId} tabIndex={-1}>
          {title}
        </Heading>
        <p className="error-state__message">{message}</p>
      </div>
      {actions || retry ? <div className="error-state__actions">{actions ?? retry}</div> : null}
    </div>
  )
}
