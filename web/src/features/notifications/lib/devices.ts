import { NOTIFICATION_TYPES, type NotificationType, type PushDevice } from '../types'

/** The device whose endpointHash matches this browser's, or undefined. */
export function findThisDevice(devices: PushDevice[], endpointHash: string | null): PushDevice | undefined {
  if (!endpointHash) return undefined
  return devices.find((d) => d.endpointHash === endpointHash)
}

/** Hex SHA-256 of a push endpoint (Web Crypto), the same value the server calls endpointHash. */
export async function hashEndpoint(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Types turned on for a device, in display order. */
export function enabledTypes(device: PushDevice): NotificationType[] {
  return NOTIFICATION_TYPES.filter((t) => device.types[t])
}

/** "Android phone", "iPhone", "iPad", "Mac", "Windows PC", "Linux PC", else "This browser". */
export function defaultDeviceLabel(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return 'iPhone'
  if (/iPad/.test(userAgent)) return 'iPad'
  if (/Android/.test(userAgent)) return 'Android phone'
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac'
  if (/Windows/.test(userAgent)) return 'Windows PC'
  if (/Linux|X11/.test(userAgent)) return 'Linux PC'
  return 'This browser'
}
