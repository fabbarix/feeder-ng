import { describe, expect, it } from 'vitest'
import { PositionError, currentPosition, positionPermission } from './geolocation'

function geoThat(outcome: { coords: { latitude: number; longitude: number; accuracy: number } } | { code: number }) {
  return {
    getCurrentPosition: (ok: PositionCallback, fail?: PositionErrorCallback | null) => {
      if ('code' in outcome) fail?.(outcome as GeolocationPositionError)
      else ok(outcome as GeolocationPosition)
    },
  }
}

describe('currentPosition', () => {
  it('maps a fix to lat, lon and accuracy', async () => {
    await expect(currentPosition(geoThat({ coords: { latitude: 1.5, longitude: -2, accuracy: 12 } }))).resolves.toEqual({ lat: 1.5, lon: -2, accuracy: 12 })
  })
  it.each([
    [1, 'denied'],
    [2, 'unavailable'],
    [3, 'timeout'],
  ])('maps error code %i to %s', async (code, reason) => {
    await expect(currentPosition(geoThat({ code }))).rejects.toMatchObject({ name: 'PositionError', reason })
  })
  it('is unsupported without a geolocation API', async () => {
    const err = await currentPosition(null).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PositionError)
    expect((err as PositionError).reason).toBe('unsupported')
  })
})

describe('positionPermission', () => {
  it('reads the permission state', async () => {
    await expect(positionPermission({ query: async () => ({ state: 'granted' }) as PermissionStatus })).resolves.toBe('granted')
  })
  it('is unknown without the Permissions API or when it throws', async () => {
    await expect(positionPermission(null)).resolves.toBe('unknown')
    await expect(positionPermission({ query: async () => Promise.reject(new TypeError('nope')) })).resolves.toBe('unknown')
  })
})
