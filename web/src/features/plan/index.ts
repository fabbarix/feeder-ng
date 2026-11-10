import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { PlanScreen } from './screens/PlanScreen'
import { PlanningRulesScreen } from './screens/PlanningRulesScreen'

// "Plan" is a fixed bottom-bar destination of the shell, so there is no navItem here.
const feature: FeatureModule = {
  routes: [
    { path: '/plan', element: createElement(PlanScreen) },
    { path: '/settings/planning', element: createElement(PlanningRulesScreen) },
  ],
}

export const routes = feature.routes

// Small components and hooks Today and others embed (docs/dev/design/t11-planning.md, "Exports for Today").
export { CouldntPlanNotice, LeftoversTile, ToConfirmTile } from './components/TodayTiles'
export { TonightHero } from './components/TonightHero'
export { CookFlowSheets } from './components/CookFlowSheets'
export { useCookFlow, useNotCooked } from './hooks/useCookFlow'
export type { CookFlow } from './hooks/useCookFlow'
export { cookPath } from './lib/cook'
export { heroMeal } from './lib/days'
export { heroSelection } from './lib/hero'
export type { HeroAction, HeroDay } from './lib/hero'
export { useCouldntPlan, useLeftovers, useToConfirm } from './hooks/useTodayTiles'
export { usePlan } from './hooks/usePlan'
export { useMarkCooked } from './hooks/useMarkCooked'
export { MarkCookedSheet } from './components/MarkCookedSheet'
export { ShortfallNotice } from './components/ShortfallNotice'
export { PlanningSettingsLink } from './components/PlanningSettingsLink'
export { StockCorrectionSheet } from './components/StockCorrectionSheet'
export { useStockSheet } from './hooks/useStockSheet'
