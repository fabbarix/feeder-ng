// Typed calls for the Leftover routes (beta5-plan 2.3). All User, CSRF.
import { http } from '../http'
import type { FreezeResult, Leftover, LeftoverAnswer, LeftoverResult, PlannedMealRef } from './types'

/** A had-it, threw-out or take-out answer as the server may leave `replanned` out. */
type WireResult = Omit<LeftoverResult, 'replanned'> & { replanned?: PlannedMealRef[] }

/** The server leaves `replanned` out when nothing moved: the client treats that as no Planned Meals. */
const withReplanned = (out: WireResult): LeftoverResult => ({ ...out, replanned: out.replanned ?? [] })

export const leftoversApi = {
  /** `GET /api/plan/leftovers`, unwrapped from `{ leftovers }`. */
  list: async (): Promise<Leftover[]> => (await http.get<{ leftovers: Leftover[] }>('/api/plan/leftovers')).leftovers,
  /** `POST /api/plan/leftovers/{id}/had-it` `{ portions }`. */
  hadIt: async (id: number, portions: number): Promise<LeftoverResult> =>
    withReplanned(await http.post<WireResult>(`/api/plan/leftovers/${id}/had-it`, { portions })),
  /** `POST /api/plan/leftovers/{id}/threw-out` `{ portions }`. */
  threwOut: async (id: number, portions: number): Promise<LeftoverResult> =>
    withReplanned(await http.post<WireResult>(`/api/plan/leftovers/${id}/threw-out`, { portions })),
  /** `POST /api/plan/leftovers/{id}/freeze` `{ storagePlaceId, portions }`. */
  freeze: (id: number, storagePlaceId: number, portions: number): Promise<FreezeResult> =>
    http.post<FreezeResult>(`/api/plan/leftovers/${id}/freeze`, { storagePlaceId, portions }),
  /** `POST /api/plan/leftovers/{id}/take-out` `{ storagePlaceId }` (null = Not sorted). */
  takeOut: async (id: number, storagePlaceId: number | null): Promise<LeftoverResult> =>
    withReplanned(await http.post<WireResult>(`/api/plan/leftovers/${id}/take-out`, { storagePlaceId })),
  /** `POST /api/plan/leftovers/{id}/answer` `{ answer }`; 204. */
  answer: async (id: number, answer: LeftoverAnswer): Promise<void> => {
    await http.post<void>(`/api/plan/leftovers/${id}/answer`, { answer })
  },
}
