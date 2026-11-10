import { http } from '../../lib/http'
import type { BrowserSubscription, NotificationType, PushConfig, PushDevice, TypeFlags } from './types'

export const notificationsApi = {
  config: () => http.get<PushConfig>('/api/notifications/config'),
  devices: () => http.get<{ devices: PushDevice[] }>('/api/notifications/devices'),
  register: (sub: BrowserSubscription, label: string, types?: Partial<TypeFlags>) =>
    http.post<PushDevice>('/api/notifications/devices', { ...sub, label, types }),
  setType: (id: number, type: NotificationType, on: boolean) =>
    http.put<PushDevice>(`/api/notifications/devices/${id}`, { types: { [type]: on } }),
  remove: (id: number) => http.delete<void>(`/api/notifications/devices/${id}`),
}
