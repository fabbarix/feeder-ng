import { describe, expect, it } from 'vitest'
import type { PushDevice } from '../types'
import { defaultDeviceLabel, enabledTypes, findThisDevice, hashEndpoint } from './devices'

const flags = { advanceStep: false, startCooking: false, confirmCooked: false, leftoverUseBy: false, stockSpoil: false, timerFinished: false, accessRequest: false }
const device = (id: number, hash: string, on: Partial<typeof flags> = {}): PushDevice => ({
  id,
  label: `d${id}`,
  createdAt: '2026-11-09T12:00:00Z',
  endpointHash: hash,
  types: { ...flags, ...on },
})

describe('findThisDevice', () => {
  it('matches by endpoint hash', () => {
    const list = [device(1, 'aa'), device(2, 'bb')]
    expect(findThisDevice(list, 'bb')?.id).toBe(2)
  })
  it('is undefined for no hash or no match', () => {
    expect(findThisDevice([device(1, 'aa')], null)).toBeUndefined()
    expect(findThisDevice([device(1, 'aa')], 'zz')).toBeUndefined()
  })
})

describe('hashEndpoint', () => {
  it('is the hex sha-256 of the endpoint', async () => {
    // sha256("abc")
    expect(await hashEndpoint('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('enabledTypes', () => {
  it('lists the types that are on, in display order', () => {
    expect(enabledTypes(device(1, 'a', { timerFinished: true, advanceStep: true }))).toEqual(['advanceStep', 'timerFinished'])
    expect(enabledTypes(device(1, 'a'))).toEqual([])
  })
})

describe('defaultDeviceLabel', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36', 'Android phone'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 'iPhone'],
    ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 'iPad'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 'Mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Windows PC'],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', 'Linux PC'],
    ['curl/8', 'This browser'],
  ])('%s -> %s', (ua, label) => {
    expect(defaultDeviceLabel(ua)).toBe(label)
  })
})
