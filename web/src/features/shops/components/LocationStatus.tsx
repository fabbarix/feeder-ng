import { Button } from '../../../ui'
import type { Position, PositionFailure } from '../../../lib/geolocation'
import type { PositionStatus } from '../hooks/usePosition'
import { formatDistance, goodForSaving } from '../lib/nearest'
import { strings } from '../strings'

export interface LocationStatusProps {
  status: PositionStatus
  position: Position | null
  failure: PositionFailure | null
  onRetry: () => void
}

/** One status line about the phone's position for a Shop Location, with "Try again" when a retry can help. */
export function LocationStatus({ status, position, failure, onRetry }: LocationStatusProps) {
  const retry = status === 'failed' && (failure === 'timeout' || failure === 'unavailable')
  const text =
    status === 'locating' || status === 'idle'
      ? strings.locating
      : status === 'ready' && position
        ? goodForSaving(position)
          ? strings.locatedWithin(formatDistance(position.accuracy))
          : strings.locationTooRough(formatDistance(position.accuracy))
        : failure === 'denied'
          ? strings.locationDenied
          : failure === 'unsupported'
            ? strings.locationUnsupported
            : strings.locationUnavailable
  return (
    <div className="shop-location">
      <p className="pg__muted" role="status">
        {text}
      </p>
      {retry ? (
        <Button variant="tertiary" size="sm" onClick={onRetry}>
          {strings.tryAgain}
        </Button>
      ) : null}
    </div>
  )
}
