// The Shop the User is standing in, from the phone's position and the Shop Locations. React hook.
import { useMemo } from 'react'
import { nearestShop, type NearestShop } from '../lib/nearest'
import type { Shop } from '../types'
import { usePosition, type UsePositionOptions, type PositionStatus } from './usePosition'
import type { Position, PositionFailure } from '../../../lib/geolocation'

export interface UseNearestShop<S extends Shop> {
  /** null until a fix, or when no Shop with a Shop Location is near enough */
  nearest: NearestShop<S> | null
  status: PositionStatus
  /** the fix it was found from; a new object for every fix */
  position: Position | null
  failure: PositionFailure | null
  /** whether any Shop has a Shop Location (otherwise finding one is pointless) */
  anyLocated: boolean
  locate: () => void
}

/** Defaults to auto 'granted': finds the nearest Shop at once only where that shows no prompt. */
export function useNearestShop<S extends Shop>(shops: S[], options: UsePositionOptions = { auto: 'granted' }): UseNearestShop<S> {
  const { status, position, failure, locate } = usePosition(options)
  const nearest = useMemo(() => (position ? nearestShop(shops, position) : null), [shops, position])
  const anyLocated = shops.some((s) => Boolean(s.location))
  return { nearest, status, position, failure, anyLocated, locate }
}
