// Settings > Tags: /settings/tags (TagsScreen). Reached from the Settings index, so no nav item.
import type { FeatureModule } from '../../app/features'
import { lazyScreen } from '../../app/lazyScreen'

const feature: FeatureModule = {
  routes: [{ path: '/settings/tags', element: lazyScreen(() => import('./screens/TagsScreen'), 'TagsScreen') }],
}

export const routes = feature.routes
