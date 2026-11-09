import type { PushSupport } from '../types'

/** Converts a base64url VAPID public key to the bytes PushManager.subscribe wants. Not implemented yet. */
export function urlBase64ToUint8Array(_key: string): Uint8Array {
  throw new Error('urlBase64ToUint8Array: not implemented')
}

/** What the browser exposes, as plain data so the decision is testable. */
export interface PushEnvironment {
  hasServiceWorker: boolean
  hasPushManager: boolean
  hasNotification: boolean
  permission: 'default' | 'granted' | 'denied'
  isIos: boolean
  isStandalone: boolean
}

/**
 * 'unsupported' without service workers, PushManager or Notification (an iOS browser tab
 * that is not installed also lacks PushManager: that case is 'needs-install' when isIos
 * and not standalone); 'denied' when permission is denied; otherwise 'supported'.
 * Not implemented yet.
 */
export function pushSupport(_env: PushEnvironment): PushSupport {
  throw new Error('pushSupport: not implemented')
}
