// The nearest Shop to the phone (Shop Location). Pure TypeScript, no React.
import type { Position } from '../../../lib/geolocation'
import type { Shop, ShopLocation } from '../types'

const EARTH_RADIUS_M = 6_371_000

/** A Shop counts as "here" within this many metres, plus the fix's own accuracy … */
export const NEAR_METRES = 200
/** … but never further than this, however poor the fix. */
export const MAX_NEAR_METRES = 1000

/** Great-circle (haversine) distance in metres. */
export function distanceMetres(a: ShopLocation, b: ShopLocation): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** How far a Shop may be and still be the one the User is in. */
export function nearRadius(accuracy: number): number {
  const slack = Number.isFinite(accuracy) && accuracy > 0 ? accuracy : 0
  return Math.min(NEAR_METRES + slack, MAX_NEAR_METRES)
}

export interface NearestShop<S extends Shop = Shop> {
  shop: S
  metres: number
}

/** The closest Shop with a Shop Location within nearRadius(position.accuracy); null when none is that close. */
export function nearestShop<S extends Shop>(shops: S[], position: Position): NearestShop<S> | null {
  const limit = nearRadius(position.accuracy)
  let best: NearestShop<S> | null = null
  for (const shop of shops) {
    if (!shop.location) continue
    const metres = distanceMetres(position, shop.location)
    if (metres <= limit && (best === null || metres < best.metres)) best = { shop, metres }
  }
  return best
}

/** "40 m", "950 m", "1.2 km". */
export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.max(0, Math.round(metres / 10) * 10)} m`
  return `${(metres / 1000).toFixed(1)} km`
}

/** Whether a fix is good enough to save as a Shop Location (a city-wide guess is not). */
export const SAVE_ACCURACY_METRES = 150
export function goodForSaving(position: Position): boolean {
  return Number.isFinite(position.accuracy) && position.accuracy <= SAVE_ACCURACY_METRES
}

/** The Shop Location to save with a new Shop: the fix when the User wants it and it is good enough, else null. */
export function locationToSave(wanted: boolean, position: Position | null): ShopLocation | null {
  return wanted && position && goodForSaving(position) ? { lat: position.lat, lon: position.lon } : null
}
