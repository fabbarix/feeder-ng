import type { FeatureModule } from '../../app/features'
import { lazyScreen } from '../../app/lazyScreen'

// "Plan" is a fixed bottom-bar destination of the shell, so there is no navItem here.
const feature: FeatureModule = {
  routes: [
    { path: '/plan', element: lazyScreen(() => import('./screens/PlanScreen'), 'PlanScreen') },
    { path: '/settings/planning', element: lazyScreen(() => import('./screens/PlanningRulesScreen'), 'PlanningRulesScreen') },
    // CRS G2 (RX): the Exclusions that left each Course empty; open to every User.
    { path: '/plan/couldnt-plan/excluded', element: lazyScreen(() => import('./screens/CouldntPlanExclusionsScreen'), 'CouldntPlanExclusionsScreen') },
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
export { cookLinkFor, cookPath } from './lib/cook'
// B9-44 (PC-02 on Today): Today shows the flows' ONE shortfall notice itself.
export { ShortfallSheets } from './components/ShortfallSheets'
export { markSlotPath } from './lib/markSlot'
export { SlotDateSheets } from './components/SlotDateSheets'
export { useSlotDate } from './hooks/useSlotDate'
export type { SlotDateController } from './hooks/useSlotDate'
export { NotServedRow } from './components/NotServedRow'
export { notServedToday } from './lib/slotDate'
export { heroMeal } from './lib/days'
export { heroNextChange, heroSelection, justServed, movedToConfirm, withJustServed } from './lib/hero'
// B9-47 (TB 7): the Kitchen board builds its hero's eyebrow from the same parts as Today's.
export { heroEyebrow, isStartPart } from './lib/hero'
// B9-39 (TB-01): the clock Today's hero moves on by.
export { useHeroClock } from './hooks/useHeroClock'
export { useMovedToConfirm } from './hooks/useMovedToConfirm'
// B9-44 (TB-02): Today's Advance Steps move focus the same way when a row goes after Done.
export { useRowFocusAfterRemoval } from './hooks/useRowFocusAfterRemoval'
export type { HeroAction, HeroDay } from './lib/hero'
export { useCouldntPlan, useLeftovers, useToConfirm } from './hooks/useTodayTiles'
export { usePickLeftover } from './hooks/usePickLeftover'
export { useScreenLeftovers } from './hooks/useScreenLeftovers'
export { usePlan } from './hooks/usePlan'
export { useMarkCooked } from './hooks/useMarkCooked'
export { MarkCookedSheet } from './components/MarkCookedSheet'
// B9-45 (PC-02): the ONE Stock-shortfall notice and the ONE Correct Stock sheet live in features/stock; Today and Cook Mode import them from here.
export { ShortfallNotice } from '../stock/components/ShortfallNotice'
export { StockCorrectionSheet } from '../stock/components/StockCorrectionSheet'
export { PlanningSettingsLink } from './components/PlanningSettingsLink'
// CRS F: the Course-aware Tonight sheets and the Mark all Cooked sheet, shared with Today.
export { useTonightSheets } from './hooks/useTonightSheets'
export { PlannedMealSheet } from './components/PlannedMealSheet'
// B9-26 (PC-01): the What changed sheet, mounted by Today with useTonightSheets(...).review.
export { ReplanReviewSheet } from './components/ReplanReviewSheet'
export { SwapSheet } from './components/SwapSheet'
export { RecipeChooserSheet } from './components/RecipeChooserSheet'
export { MarkAllCookedSheet } from './components/MarkAllCookedSheet'
export { unresolvedCourseIds } from './lib/courses'
export { toConfirmCourses } from './lib/toConfirm'
export { useAllCookedFlow } from './hooks/useAllCookedFlow'
export type { AllCookedFlow } from './hooks/useAllCookedFlow'
export { AllCookedSheets } from './components/AllCookedSheets'
// B9-39 (B9-32 question 2): Today's compact Couldn't plan tile offers "Show which meals" too.
export { CouldntMealsSheet } from './components/CouldntMealsSheet'
export { usePlanFixSheets } from './hooks/usePlanFixSheets'

