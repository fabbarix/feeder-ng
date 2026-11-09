import type { BrowserSubscription, NotificationType, PushConfig, PushDevice, PushSupport } from '../types'
import type { PushEnvironment } from '../lib/webpush'

/** The browser's push machinery behind a seam, so the hook is tested with a fake. */
export interface PushPort {
  environment(): PushEnvironment
  userAgent(): string
  currentSubscription(): Promise<BrowserSubscription | null>
  requestPermission(): Promise<'default' | 'granted' | 'denied'>
  subscribe(applicationServerKey: Uint8Array): Promise<BrowserSubscription>
  unsubscribe(): Promise<void>
}

/** The real port over navigator.serviceWorker, PushManager and Notification. Not implemented yet. */
export const browserPushPort: PushPort = {
  environment: () => {
    throw new Error('browserPushPort: not implemented')
  },
  userAgent: () => '',
  currentSubscription: async () => null,
  requestPermission: async () => 'default',
  subscribe: async () => {
    throw new Error('browserPushPort: not implemented')
  },
  unsubscribe: async () => {},
}

export interface NotificationSettings {
  loading: boolean
  error: Error | null
  support: PushSupport
  config: PushConfig | undefined
  /** this browser's registered device, if any */
  thisDevice: PushDevice | undefined
  otherDevices: PushDevice[]
  busy: boolean
  /** ask permission, subscribe with the server's VAPID key, register (label from the user agent) */
  enable(): Promise<void>
  /** unsubscribe this browser and delete its device */
  disable(): Promise<void>
  setType(deviceId: number, type: NotificationType, on: boolean): Promise<void>
  removeDevice(deviceId: number): Promise<void>
}

/** react-query over /api/notifications/*, plus the port. Not implemented yet. */
export function useNotificationSettings(_port: PushPort = browserPushPort): NotificationSettings {
  throw new Error('useNotificationSettings: not implemented')
}
