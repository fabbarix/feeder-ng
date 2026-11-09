import type { UnitSystem } from '../../../lib/units'

/**
 * The signed-in User's metric/imperial display choice. Team T1 builds the preference;
 * until it lands this returns 'metric'. TODO(integration): read T1's preference hook here
 * (the only place in this feature that needs to change).
 */
export function useDisplayUnitSystem(): UnitSystem {
  return 'metric'
}
