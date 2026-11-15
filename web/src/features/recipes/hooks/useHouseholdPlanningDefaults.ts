// B9-37 (RX-02): the Household's Cool-down, Leftover Use-by and Frozen Use-by, named in the footnote under the Planning overrides.
// Reads the Household settings (the same query key as useHouseholdFrozenUseBy, so one request serves both).
import { useQuery } from '@tanstack/react-query'
import { http } from '../../../lib/http'

export interface HouseholdPlanningDefaults {
  cooldownDays: number
  leftoverUseByDays: number
  frozenUseByDays: number
}

interface SettingsBody {
  defaultCooldownDays?: number
  defaultLeftoverUseByDays?: number
  frozenUseByDays?: number
}

/** The server's defaults for a new Household (internal/household.DefaultSettings) until the settings are read. */
const FALLBACK: HouseholdPlanningDefaults = { cooldownDays: 7, leftoverUseByDays: 3, frozenUseByDays: 90 }

export function useHouseholdPlanningDefaults(): HouseholdPlanningDefaults {
  const q = useQuery({ queryKey: ['household', 'settings'], queryFn: () => http.get<SettingsBody>('/api/household/settings') })
  return {
    cooldownDays: q.data?.defaultCooldownDays ?? FALLBACK.cooldownDays,
    leftoverUseByDays: q.data?.defaultLeftoverUseByDays ?? FALLBACK.leftoverUseByDays,
    frozenUseByDays: q.data?.frozenUseByDays ?? FALLBACK.frozenUseByDays,
  }
}
