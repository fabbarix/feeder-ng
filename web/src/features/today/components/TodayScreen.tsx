import type { ReactElement } from 'react'
/**
 * The Today route: useToday() -> TodayView. Builds one element per tile id from the
 * owning features' components (T11 NextMealTile, ToConfirmTile, CouldntPlanNotice,
 * LeftoversTile; T10 SpoiledTile; this feature's AdvanceStepsTile, UseSoonTile,
 * StreakTile) and passes the Shopping List screen (T13) as `shopping`. Wired after
 * those features are merged. Stub: an empty page so the shell keeps working.
 */
export function TodayScreen(): ReactElement {
  return <div />
}
