import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { notificationsApi } from '../api'
import { defaultDeviceLabel, findThisDevice, hashEndpoint } from '../lib/devices'
import { pushSupport, urlBase64ToUint8Array, type PushEnvironment } from '../lib/webpush'
import type { BrowserSubscription, NotificationType, PushConfig, PushDevice, PushSupport } from '../types'

/** The browser's push machinery behind a seam, so the hook is tested with a fake. */
export interface PushPort {
  environment(): PushEnvironment
  userAgent(): string
  currentSubscription(): Promise<BrowserSubscription | null>
  requestPermission(): Promise<'default' | 'granted' | 'denied'>
  subscribe(applicationServerKey: Uint8Array<ArrayBuffer>): Promise<BrowserSubscription>
  unsubscribe(): Promise<void>
}

async function readyRegistration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.ready
}

function toBrowserSubscription(sub: PushSubscription): BrowserSubscription {
  const json = sub.toJSON()
  return { endpoint: sub.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } }
}

/** The real port over navigator.serviceWorker, PushManager and Notification. */
export const browserPushPort: PushPort = {
  environment: () => ({
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'denied',
    isIos: /iPhone|iPad|iPod/.test(navigator.userAgent),
    isStandalone:
      window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
  }),
  userAgent: () => navigator.userAgent,
  currentSubscription: async () => {
    const sub = await (await readyRegistration()).pushManager.getSubscription()
    return sub ? toBrowserSubscription(sub) : null
  },
  requestPermission: () => Notification.requestPermission(),
  subscribe: async (applicationServerKey) => {
    const sub = await (await readyRegistration()).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
    return toBrowserSubscription(sub)
  },
  unsubscribe: async () => {
    const sub = await (await readyRegistration()).pushManager.getSubscription()
    await sub?.unsubscribe()
  },
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

const keys = {
  config: ['notifications', 'config'] as const,
  devices: ['notifications', 'devices'] as const,
  thisBrowser: ['notifications', 'this-browser'] as const,
}

const NO_DEVICES: PushDevice[] = []

/** react-query over /api/notifications/*, plus the port. */
export function useNotificationSettings(port: PushPort = browserPushPort): NotificationSettings {
  const queryClient = useQueryClient()
  const config = useQuery({ queryKey: keys.config, queryFn: notificationsApi.config })
  const devices = useQuery({ queryKey: keys.devices, queryFn: () => notificationsApi.devices().then((r) => r.devices) })
  const browser = useQuery({
    queryKey: keys.thisBrowser,
    queryFn: async () => {
      const sub = await port.currentSubscription()
      return sub ? hashEndpoint(sub.endpoint) : null
    },
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.devices }),
      queryClient.invalidateQueries({ queryKey: keys.thisBrowser }),
    ])
  }
  const enableMutation = useMutation({
    mutationFn: async () => {
      if (!config.data) return
      const permission = await port.requestPermission()
      if (permission !== 'granted') return
      const sub = await port.subscribe(urlBase64ToUint8Array(config.data.vapidPublicKey))
      await notificationsApi.register(sub, defaultDeviceLabel(port.userAgent()))
    },
    onSettled: refresh,
  })
  const disableMutation = useMutation({
    mutationFn: async () => {
      const mine = findThisDevice(devices.data ?? NO_DEVICES, browser.data ?? null)
      if (mine) await notificationsApi.remove(mine.id)
      await port.unsubscribe()
    },
    onSettled: refresh,
  })
  const setTypeMutation = useMutation({
    mutationFn: ({ id, type, on }: { id: number; type: NotificationType; on: boolean }) => notificationsApi.setType(id, type, on),
    onSettled: refresh,
  })
  const removeMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.remove(id),
    onSettled: refresh,
  })

  const all = devices.data ?? NO_DEVICES
  const thisDevice = findThisDevice(all, browser.data ?? null)
  const busy =
    enableMutation.isPending || disableMutation.isPending || setTypeMutation.isPending || removeMutation.isPending

  return {
    loading: config.isPending || devices.isPending,
    error: (config.error ?? devices.error) as Error | null,
    support: pushSupport(port.environment()),
    config: config.data,
    thisDevice,
    otherDevices: all.filter((d) => d.id !== thisDevice?.id),
    busy,
    enable: async () => {
      if (pushSupport(port.environment()) !== 'supported') return
      await enableMutation.mutateAsync()
    },
    disable: async () => {
      await disableMutation.mutateAsync()
    },
    setType: async (deviceId, type, on) => {
      await setTypeMutation.mutateAsync({ id: deviceId, type, on })
    },
    removeDevice: async (deviceId) => {
      await removeMutation.mutateAsync(deviceId)
    },
  }
}
