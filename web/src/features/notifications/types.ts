export type NotificationType =
  | 'advanceStep'
  | 'startCooking'
  | 'confirmCooked'
  | 'leftoverUseBy'
  | 'stockSpoil'
  | 'timerFinished'
  | 'accessRequest'

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'advanceStep',
  'startCooking',
  'confirmCooked',
  'leftoverUseBy',
  'stockSpoil',
  'timerFinished',
  'accessRequest',
]

export type TypeFlags = Record<NotificationType, boolean>

export interface PushDevice {
  id: number
  label: string
  createdAt: string
  /** hex sha-256 of the push endpoint: how the browser recognises "this device" */
  endpointHash: string
  types: TypeFlags
}

export interface PushConfig {
  vapidPublicKey: string
  types: NotificationType[]
  quietHours: { start: string; end: string }
  timeZone: string
}

/** A browser subscription as PushSubscription.toJSON() gives it. */
export interface BrowserSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type PushSupport = 'supported' | 'unsupported' | 'needs-install' | 'denied'
