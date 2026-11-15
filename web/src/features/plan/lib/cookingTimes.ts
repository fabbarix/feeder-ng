// B9-51 (PC-14 and amendment A2): the Earliest start and the Latest start of the Household, as Planning rules shows and saves them.
// Plain TypeScript, no React. TEST-AUTHOR STUBS: the developer implements every function; the signatures and the tests are the contract.

export const DEFAULT_EARLIEST_START = '06:30'
export const DEFAULT_LATEST_START = '22:00'

/** null is Off. */
export interface CookingTimes {
  earliestStart: string | null
  latestStart: string | null
}

export function cookingTimesOf(_settings: { earliestStart?: string | null; latestStart?: string | null }): CookingTimes {
  throw new Error('not implemented')
}

export function cookingTimesError(_times: CookingTimes): { latestStart?: string } {
  throw new Error('not implemented')
}

export function cookingTimesBody<S extends object>(_settings: S, _times: CookingTimes): Omit<S, 'timeZoneConfigured'> & CookingTimes {
  throw new Error('not implemented')
}

export function canStartAt(_slotTime: string, _totalMinutes: number, _times: CookingTimes): boolean {
  throw new Error('not implemented')
}

export function startExample(_recipes: { name: string; totalMinutes?: number }[], _slots: { name: string; time: string }[], _times: CookingTimes): string | null {
  throw new Error('not implemented')
}
