// Settings > Tags: /settings/tags (TagsScreen). Reached from the Settings index, so no nav item.
import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { TagsScreen } from './screens/TagsScreen'

const feature: FeatureModule = {
  routes: [{ path: '/settings/tags', element: createElement(TagsScreen) }],
}

export const routes = feature.routes
