import type { FeatureModule } from '../../app/features'
import { lazyScreen } from '../../app/lazyScreen'

const feature: FeatureModule = { routes: [{ path: '/settings/notifications', element: lazyScreen(() => import('./components/NotificationSettingsScreen'), 'NotificationSettingsScreen') }] }

export const routes = feature.routes

// For the service worker (T13 calls it from its entry): import from './sw/push'.
