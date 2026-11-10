import { describe, expect, it } from 'vitest'
import { pushSupport, urlBase64ToUint8Array, type PushEnvironment } from './webpush'

const capable: PushEnvironment = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  permission: 'default',
  isIos: false,
  isStandalone: false,
}

describe('urlBase64ToUint8Array', () => {
  it('decodes base64url without padding', () => {
    // "hello?>" is aGVsbG8_Pg in base64url (contains the url-safe "_")
    expect(Array.from(urlBase64ToUint8Array('aGVsbG8_Pg'))).toEqual([104, 101, 108, 108, 111, 63, 62])
  })

  it('accepts padded input and "-" for "+"', () => {
    expect(Array.from(urlBase64ToUint8Array('-_-_'))).toEqual([251, 255, 191])
    expect(Array.from(urlBase64ToUint8Array('aGk='))).toEqual([104, 105])
  })

  it('decodes a 65-byte VAPID key to 65 bytes', () => {
    const key = btoa(String.fromCharCode(...new Uint8Array(65).fill(4))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(urlBase64ToUint8Array(key)).toHaveLength(65)
  })
})

describe('pushSupport', () => {
  it('is supported when everything is there and permission is not blocked', () => {
    expect(pushSupport(capable)).toBe('supported')
    expect(pushSupport({ ...capable, permission: 'granted' })).toBe('supported')
  })

  it('is denied when the User blocked notifications', () => {
    expect(pushSupport({ ...capable, permission: 'denied' })).toBe('denied')
  })

  it('is unsupported without a service worker, PushManager or Notification', () => {
    expect(pushSupport({ ...capable, hasServiceWorker: false })).toBe('unsupported')
    expect(pushSupport({ ...capable, hasPushManager: false })).toBe('unsupported')
    expect(pushSupport({ ...capable, hasNotification: false })).toBe('unsupported')
  })

  it('asks iPhone and iPad Users to install Feeder first', () => {
    expect(pushSupport({ ...capable, hasPushManager: false, isIos: true, isStandalone: false })).toBe('needs-install')
  })

  it('works on iOS once installed', () => {
    expect(pushSupport({ ...capable, isIos: true, isStandalone: true })).toBe('supported')
  })
})
