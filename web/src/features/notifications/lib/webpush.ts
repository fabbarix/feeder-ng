import type { PushSupport } from '../types'

/** Converts a base64url VAPID public key to the bytes PushManager.subscribe wants. Padding is optional. */
export function urlBase64ToUint8Array(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(key.length / 4) * 4, '=')
  const raw = atob(padded)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
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
 */
export function pushSupport(env: PushEnvironment): PushSupport {
  if (!env.hasServiceWorker || !env.hasNotification) return 'unsupported'
  if (!env.hasPushManager) return env.isIos && !env.isStandalone ? 'needs-install' : 'unsupported'
  if (env.permission === 'denied') return 'denied'
  return 'supported'
}
