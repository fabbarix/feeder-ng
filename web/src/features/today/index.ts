import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { TodayScreen } from './components/TodayScreen'

// "Today" is a fixed bottom-bar destination of the shell, so there is no navItem here.
const feature: FeatureModule = { routes: [{ path: '/', element: createElement(TodayScreen) }] }

export const routes = feature.routes
