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
}

/** Inline danger status tile: role=alert, a warning icon, and an optional retry. Never presented as an empty state. */
export function ErrorState({ message, onRetry, retryLabel = overlayStrings.tryAgain }: ErrorStateProps) {
  return (
    <div role="alert" className="error-state">
      <span className="error-state__icon" aria-hidden="true">
        <Icon name="error" size={24} />
      </span>
      <p className="error-state__message">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  )
}
