import type { ReactElement } from 'react'
import type { NotificationType, PushDevice, PushSupport } from '../types'

export interface NotificationSettingsViewProps {
  support: PushSupport
  quietHours: { start: string; end: string } | undefined
  thisDevice: PushDevice | undefined
  otherDevices: PushDevice[]
  busy: boolean
  onEnable: () => void
  onDisable: () => void
  onSetType: (deviceId: number, type: NotificationType, on: boolean) => void
  onRemove: (deviceId: number) => void
}

/**
 * Renders the notification settings Tile. By support: 'unsupported' / 'needs-install' /
 * 'denied' show their message and nothing else. 'supported' without a device shows the
 * button "Turn on notifications on this device" (disabled while busy). With this device:
 * a switch (role="switch", named by the type label, with its hint) per type, checked from
 * the device's flags, calling onSetType(id, type, !checked); a "Turn off notifications on
 * this device" button; the quiet-hours note; and "Your other devices" with a
 * "Remove <label>" button each. Not implemented yet.
 */
export function NotificationSettingsView(_props: NotificationSettingsViewProps): ReactElement {
  throw new Error('NotificationSettingsView: not implemented')
}
