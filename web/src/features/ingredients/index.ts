import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { IngredientScreen } from './screens/IngredientScreen'
import { IngredientsScreen } from './screens/IngredientsScreen'

// Reachable from the avatar ("Your") menu. No bottom-bar item: the bar is fixed by the shell.
const feature: FeatureModule = {
  routes: [
    { path: '/ingredients', element: createElement(IngredientsScreen) },
    { path: '/ingredients/:id', element: createElement(IngredientScreen) },
  ],
  navItems: [{ id: 'ingredients', label: 'Ingredients', path: '/ingredients', placement: 'menu', order: 30 }],
}

export const routes = feature.routes
export const navItems = feature.navItems
