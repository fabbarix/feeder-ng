import { badgeText } from '../lib/requests'
import { accessStrings } from '../strings'
import '../access.css'

/** The count badge on the avatar button (hidden at 0). Place it inside a positioned parent. */
export function AccessBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="access-badge" role="img" aria-label={accessStrings.waitingLabel(count)}>
      {badgeText(count)}
    </span>
  )
}
