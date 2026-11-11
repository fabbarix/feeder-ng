// Shop Location on the Shop screen: picks the Shop the User is standing in as the Shop the list is priced at. Where
// location is already allowed this happens on open; otherwise on a tap of "Find the Shop I am in". React hook.
import { useEffect, useRef } from 'react'
import { useToast } from '../../../ui/Toast'
import { useNearestShop } from '../../shops/hooks/useNearestShop'
import { useShops } from '../../shops/hooks/useShops'
import { formatDistance } from '../../shops/lib/nearest'
import type { PositionStatus } from '../../shops/hooks/usePosition'
import { shopStrings } from '../strings'

export interface UseShopHere {
  status: PositionStatus
  /** whether any Shop has a Shop Location, so finding one can work */
  anyLocated: boolean
  /** a tap: asks for the position (may prompt) and reports what it found */
  find: () => void
}

export interface UseShopHereOptions {
  shopId: number | null
  setShopId: (id: number | null) => void
  /** offered when no saved Shop is near: opens "Add Shop" */
  onAddHere: () => void
}

export function useShopHere({ shopId, setShopId, onAddHere }: UseShopHereOptions): UseShopHere {
  const { shops } = useShops()
  const near = useNearestShop(shops)
  const toast = useToast()
  const tapped = useRef(false)
  const handled = useRef<unknown>(null)

  useEffect(() => {
    if (near.status === 'failed' && tapped.current) {
      tapped.current = false
      toast.show(near.failure === 'denied' ? shopStrings.locationOff : shopStrings.locationFailed, { status: 'error', durationMs: 4000 })
      return
    }
    if (near.status !== 'ready' || handled.current === near.position) return
    handled.current = near.position
    const wasTap = tapped.current
    tapped.current = false
    if (!near.nearest) {
      if (wasTap) toast.show(shopStrings.noShopNearby, { actionLabel: shopStrings.addShopHere, onAction: onAddHere })
      return
    }
    const { shop, metres } = near.nearest
    if (shop.id === shopId) {
      if (wasTap) toast.show(shopStrings.atShop(shop.name, formatDistance(metres)))
      return
    }
    const before = shopId
    setShopId(shop.id)
    toast.show(shopStrings.atShop(shop.name, formatDistance(metres)), { actionLabel: shopStrings.undo, onAction: () => setShopId(before) })
    // the fix and the result are what matter; the callbacks change every render
  }, [near.status, near.position, near.failure])

  return {
    status: near.status,
    anyLocated: near.anyLocated,
    find: () => {
      tapped.current = true
      near.locate()
    },
  }
}
