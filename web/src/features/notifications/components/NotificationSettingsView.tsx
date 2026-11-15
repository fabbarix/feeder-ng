import type { ReactElement } from 'react'
import { Button, Tile } from '../../../ui'
import { notificationStrings as s } from '../strings'
import type { NotificationType, PushDevice, PushSupport } from '../types'
import { DeviceRows, TypeSwitches } from './NotificationLists'
import '../notifications.css'

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
  /** B9-49 (SET-14g): Safari on iPhone: the needs-install line names Share and Add to Home Screen. */
  iosSafari?: boolean
}

const SUPPORT_MESSAGE: Partial<Record<PushSupport, string>> = {
  unsupported: s.unsupported,
  'needs-install': s.needsInstall,
  denied: s.denied,
}

/**
 * Renders the notification settings Tile. By support: 'unsupported' / 'needs-install' /
 * 'denied' show their message and nothing else. 'supported' without a device shows the
 * button "Turn on notifications on this device" (disabled while busy). With this device:
 * a switch per type, checked from the device's flags, calling onSetType(id, type, !checked);
 * a "Turn off notifications on this device" button; the quiet-hours note; and "Your other
 * devices" with a "Remove <label>" button each.
 */
export function NotificationSettingsView(props: NotificationSettingsViewProps): ReactElement {
  const message = props.support === 'needs-install' && props.iosSafari ? s.needsInstallIosSafari : SUPPORT_MESSAGE[props.support]
  if (message) {
    return (
      <Tile as="section" span="full" aria-label={s.title}>
        <p className="notifications__muted">{message}</p>
      </Tile>
    )
  }
  const { thisDevice } = props
  return (
    <Tile as="section" span="full" aria-label={s.title}>
      {thisDevice ? (
        <ThisDevice device={thisDevice} busy={props.busy} onSetType={props.onSetType} onDisable={props.onDisable} />
      ) : (
        <Button type="button" block="phone" onClick={props.onEnable} disabled={props.busy}>
          {props.busy ? s.enabling : s.enable}
        </Button>
      )}
      {props.quietHours ? (
        <p className="notifications__muted">{s.quietHours(props.quietHours.start, props.quietHours.end)}</p>
      ) : null}
      {props.otherDevices.length > 0 ? <OtherDevices devices={props.otherDevices} onRemove={props.onRemove} /> : null}
    </Tile>
  )
}

function ThisDevice({
  device,
  busy,
  onSetType,
  onDisable,
}: {
  device: PushDevice
  busy: boolean
  onSetType: NotificationSettingsViewProps['onSetType']
  onDisable: () => void
}) {
  return (
    <div className="notifications__this">
      <h2 className="notifications__heading">{s.thisDeviceHeading}</h2>
      <TypeSwitches types={device.types} onChange={(type, on) => onSetType(device.id, type, on)} />
      <Button type="button" variant="secondary" onClick={onDisable} disabled={busy}>
        {s.disable}
      </Button>
    </div>
  )
}

function OtherDevices({ devices, onRemove }: { devices: PushDevice[]; onRemove: (id: number) => void }) {
  return (
    <section>
      <h2 className="notifications__heading">{s.otherDevices}</h2>
      <DeviceRows devices={devices} onRemove={onRemove} />
    </section>
  )
}
