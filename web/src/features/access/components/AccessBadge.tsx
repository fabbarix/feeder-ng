import { badgeText } from '../lib/requests'
import '../access.css'

/** The count badge on the avatar button (hidden at 0). Place it inside a positioned parent. TB-15e: decoration only (aria-hidden):
 *  the avatar button's own name already counts the requests ("Your menu, 3 sign-in requests waiting"). */
export function AccessBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="access-badge" aria-hidden="true">
      {badgeText(count)}
    </span>
  )
}
