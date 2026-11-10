import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { NotificationSettingsScreen } from './components/NotificationSettingsScreen'

const feature: FeatureModule = { routes: [{ path: '/settings/notifications', element: createElement(NotificationSettingsScreen) }] }

export const routes = feature.routes

// For the service worker (T13 calls it from its entry): import from './sw/push'.
