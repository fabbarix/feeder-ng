// The phone's position for the Shop Location (nearest Shop, "Add Shop here"). A thin, typed adapter over
// navigator.geolocation and navigator.permissions; no React. Positions never leave the Household's own server.

export interface Position {
  lat: number
  lon: number
  /** metres, 95% radius as the browser reports it */
  accuracy: number
}

/** Why no position: the User said no, the phone could not tell, it took too long, or there is no GPS API here. */
export type PositionFailure = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export class PositionError extends Error {
  constructor(readonly reason: PositionFailure) {
    super(reason)
    this.name = 'PositionError'
  }
}

/** 'unknown' where the Permissions API is missing (older Safari): ask on a tap, never on load. */
export type PositionPermission = 'granted' | 'prompt' | 'denied' | 'unknown'

type Geo = Pick<Geolocation, 'getCurrentPosition'>
type Perms = Pick<Permissions, 'query'>

const OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 }

function defaultGeo(): Geo | null {
  return typeof navigator !== 'undefined' && navigator.geolocation ? navigator.geolocation : null
}

function defaultPerms(): Perms | null {
  return typeof navigator !== 'undefined' && navigator.permissions ? navigator.permissions : null
}

/** One position fix; rejects with a PositionError. `geo` is injectable for tests. */
export function currentPosition(geo: Geo | null = defaultGeo()): Promise<Position> {
  if (!geo) return Promise.reject(new PositionError('unsupported'))
  return new Promise((resolve, reject) => {
    geo.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(new PositionError(err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable')),
      OPTIONS,
    )
  })
}

/** Whether a fix would prompt; never throws. `perms` is injectable for tests. */
export async function positionPermission(perms: Perms | null = defaultPerms()): Promise<PositionPermission> {
  if (!perms) return 'unknown'
  try {
    const status = await perms.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'unknown'
  }
}
