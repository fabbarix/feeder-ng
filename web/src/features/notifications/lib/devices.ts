import type { NotificationType, PushDevice } from '../types'

/** The device whose endpointHash matches this browser's, or undefined. Not implemented yet. */
export function findThisDevice(_devices: PushDevice[], _endpointHash: string | null): PushDevice | undefined {
  throw new Error('findThisDevice: not implemented')
}

/** Hex SHA-256 of a push endpoint (Web Crypto), the same value the server calls endpointHash. Not implemented yet. */
export async function hashEndpoint(_endpoint: string): Promise<string> {
  throw new Error('hashEndpoint: not implemented')
}

/** Types turned on for a device, in display order. Not implemented yet. */
export function enabledTypes(_device: PushDevice): NotificationType[] {
  throw new Error('enabledTypes: not implemented')
}

/** "Chrome on Android"-style default label from a user agent: "Android phone", "iPhone", "iPad", "Mac", "Windows PC", "Linux PC", else "This browser". Not implemented yet. */
export function defaultDeviceLabel(_userAgent: string): string {
  throw new Error('defaultDeviceLabel: not implemented')
}
