// Web Push for the service worker: the push and notificationclick handlers live with the notifications feature.
import { registerPushHandlers, type SwScope } from '../../features/notifications/sw/push'
import type { WorkerScope } from '../extensions'

export function register(sw: WorkerScope): void {
  registerPushHandlers(sw as unknown as SwScope)
}
