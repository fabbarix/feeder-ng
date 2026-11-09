import type { UnitSystem } from '../../../lib/units'
import { usePreferences } from '../../settings/hooks/usePreferences'

/**
 * The signed-in User's metric/imperial display choice (the `units` preference owned by the settings feature).
 * Defaults to 'metric' while the preference loads.
 */
export function useDisplayUnitSystem(): UnitSystem {
  return usePreferences().preferences.units
}
