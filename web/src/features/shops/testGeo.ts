// Test helper: a fake phone position (navigator.geolocation and navigator.permissions) for the Shop Location tests.
type Fix = { lat: number; lon: number; accuracy: number } | { code: 1 | 2 | 3 }

export function fakeGeo(fix: Fix, permission: PermissionState = 'prompt') {
  const getCurrentPosition = (ok: PositionCallback, fail?: PositionErrorCallback | null) => {
    if ('code' in fix) fail?.({ code: fix.code } as GeolocationPositionError)
    else ok({ coords: { latitude: fix.lat, longitude: fix.lon, accuracy: fix.accuracy } } as GeolocationPosition)
  }
  const calls = { count: 0 }
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: (...args: Parameters<typeof getCurrentPosition>) => (calls.count++, getCurrentPosition(...args)) },
  })
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: permission }) } })
  return calls
}

export function clearGeo() {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })
  Object.defineProperty(navigator, 'permissions', { configurable: true, value: undefined })
}
