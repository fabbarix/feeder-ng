// B9-37 stub (RX-02; pinned by RecipeEditorScreen.flow.test.tsx): the Household's Cool-down, Leftover Use-by and Frozen Use-by, named in the
// footnote under the Planning overrides. Reads the Household settings (the same query key as useHouseholdFrozenUseBy).
export interface HouseholdPlanningDefaults {
  cooldownDays: number
  leftoverUseByDays: number
  frozenUseByDays: number
}

export function useHouseholdPlanningDefaults(): HouseholdPlanningDefaults {
  throw new Error('B9-37: useHouseholdPlanningDefaults is not built yet')
}
