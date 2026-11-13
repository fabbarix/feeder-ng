import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { PlanScreen } from './screens/PlanScreen'
import { CouldntPlanExclusionsScreen } from './screens/CouldntPlanExclusionsScreen'
import { PlanningRulesScreen } from './screens/PlanningRulesScreen'

// "Plan" is a fixed bottom-bar destination of the shell, so there is no navItem here.
const feature: FeatureModule = {
  routes: [
    { path: '/plan', element: createElement(PlanScreen) },
    { path: '/settings/planning', element: createElement(PlanningRulesScreen) },
    // CRS G2 (RX): the Exclusions that left each Course empty; open to every User.
    { path: '/plan/couldnt-plan/excluded', element: createElement(CouldntPlanExclusionsScreen) },
  ],
}

export const routes = feature.routes

// Small components and hooks Today and others embed (docs/dev/design/t11-planning.md, "Exports for Today").
export { LeftoversTile, ToConfirmTile } from './components/TodayTiles'
export { CouldntPlanNotice } from './components/CouldntPlanNotice'
export type { CouldntPlanNoticeProps } from './components/CouldntPlanNotice'
export { useCouldntPlanNotice } from './hooks/useCouldntPlanNotice'
export type { NoticeGroup } from './hooks/useCouldntPlanNotice'
export { useCouldntFix } from './hooks/useCouldntFix'
export { unplannedOf } from './lib/couldntGroups'
export { TonightHero } from './components/TonightHero'
export { CookFlowSheets } from './components/CookFlowSheets'
export { useCookFlow, useNotCooked } from './hooks/useCookFlow'
export type { CookFlow } from './hooks/useCookFlow'
export { cookPath } from './lib/cook'
export { markSlotPath } from './lib/markSlot'
export { SlotDateSheets } from './components/SlotDateSheets'
export { useSlotDate } from './hooks/useSlotDate'
export type { SlotDateController } from './hooks/useSlotDate'
export { NotServedRow } from './components/NotServedRow'
export { notServedToday } from './lib/slotDate'
export { heroMeal } from './lib/days'
export { heroSelection } from './lib/hero'
export type { HeroAction, HeroDay } from './lib/hero'
export { useCouldntPlan, useLeftovers, useToConfirm } from './hooks/useTodayTiles'
export { usePickLeftover } from './hooks/usePickLeftover'
export { useScreenLeftovers } from './hooks/useScreenLeftovers'
export { usePlan } from './hooks/usePlan'
export { useMarkCooked } from './hooks/useMarkCooked'
export { MarkCookedSheet } from './components/MarkCookedSheet'
export { ShortfallNotice } from './components/ShortfallNotice'
export { PlanningSettingsLink } from './components/PlanningSettingsLink'
export { StockCorrectionSheet } from './components/StockCorrectionSheet'
export { useStockSheet } from './hooks/useStockSheet'
// CRS F: the Course-aware Tonight sheets and the Mark all Cooked sheet, shared with Today.
export { useTonightSheets } from './hooks/useTonightSheets'
export { PlannedMealSheet } from './components/PlannedMealSheet'
export { SwapSheet } from './components/SwapSheet'
export { RecipeChooserSheet } from './components/RecipeChooserSheet'
export { MarkAllCookedSheet } from './components/MarkAllCookedSheet'
export { unresolvedCourseIds } from './lib/courses'
export { toConfirmCourses } from './lib/toConfirm'
export { useAllCookedFlow } from './hooks/useAllCookedFlow'
export type { AllCookedFlow } from './hooks/useAllCookedFlow'
export { AllCookedSheets } from './components/AllCookedSheets'

