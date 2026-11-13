// Unit System and the household's date for the Used from section. STUB (b5-ufw red): the developer reads the display
// Unit System (useDisplayUnitSystem) and the plan view's `today` (react-query ['plan','view']).
import type { UnitSystem } from '../../../lib/units'

export interface CookContext {
  unitSystem: UnitSystem
  /** The household's date, YYYY-MM-DD. */
  today: string
}

export function useCookContext(): CookContext {
  return { unitSystem: 'metric', today: new Date().toISOString().slice(0, 10) }
}
