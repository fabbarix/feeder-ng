// Typed calls for the Leftover routes (beta5-plan 2.3). All User, CSRF.
// STUB (red): the developer implements these with `http` from '../http'.
import type { FreezeResult, Leftover, LeftoverAnswer, LeftoverResult } from './types'

const todo = <T>(): Promise<T> => Promise.reject(new Error('not implemented'))

export const leftoversApi = {
  /** `GET /api/plan/leftovers`, unwrapped from `{ leftovers }`. */
  list: (): Promise<Leftover[]> => todo(),
  /** `POST /api/plan/leftovers/{id}/had-it` `{ portions }`. */
  hadIt: (_id: number, _portions: number): Promise<LeftoverResult> => todo(),
  /** `POST /api/plan/leftovers/{id}/threw-out` `{ portions }`. */
  threwOut: (_id: number, _portions: number): Promise<LeftoverResult> => todo(),
  /** `POST /api/plan/leftovers/{id}/freeze` `{ storagePlaceId, portions }`. */
  freeze: (_id: number, _storagePlaceId: number, _portions: number): Promise<FreezeResult> => todo(),
  /** `POST /api/plan/leftovers/{id}/take-out` `{ storagePlaceId }` (null = Not sorted). */
  takeOut: (_id: number, _storagePlaceId: number | null): Promise<LeftoverResult> => todo(),
  /** `POST /api/plan/leftovers/{id}/answer` `{ answer }`; 204. */
  answer: (_id: number, _answer: LeftoverAnswer): Promise<void> => todo(),
}
