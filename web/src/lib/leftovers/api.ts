// Typed calls for the Leftover routes (beta5-plan 2.3). All User, CSRF.
import { http } from '../http'
import type { DryRunRequest, FreezeResult, Leftover, LeftoverAnswer, LeftoverResult, PlannedMealRef } from './types'

/** `replanned` may be left out or null when nothing moved: the client treats that as no Planned Meals. */
const replannedOf = (refs: PlannedMealRef[] | null | undefined): PlannedMealRef[] => refs ?? []

type WireResult = { leftover: Leftover; replanned?: PlannedMealRef[] | null }
const resultOf = (out: WireResult): LeftoverResult => ({ leftover: out.leftover, replanned: replannedOf(out.replanned) })

export const leftoversApi = {
  /** `GET /api/plan/leftovers`, unwrapped from `{ leftovers }`. */
  list: async (): Promise<Leftover[]> => (await http.get<{ leftovers: Leftover[] }>('/api/plan/leftovers')).leftovers,
  /** `POST /api/plan/leftovers/{id}/had-it` `{ portions }`. */
  hadIt: async (id: number, portions: number): Promise<LeftoverResult> =>
    resultOf(await http.post<WireResult>(`/api/plan/leftovers/${id}/had-it`, { portions })),
  /** `POST /api/plan/leftovers/{id}/threw-out` `{ portions }`. */
  threwOut: async (id: number, portions: number): Promise<LeftoverResult> =>
    resultOf(await http.post<WireResult>(`/api/plan/leftovers/${id}/threw-out`, { portions })),
  /** `POST /api/plan/leftovers/{id}/freeze` `{ storagePlaceId, portions }`. */
  freeze: async (id: number, storagePlaceId: number, portions: number): Promise<FreezeResult> => {
    const out = await http.post<{ frozen: Leftover; left?: Leftover | null; replanned?: PlannedMealRef[] | null }>(
      `/api/plan/leftovers/${id}/freeze`,
      { storagePlaceId, portions },
    )
    return { frozen: out.frozen, left: out.left ?? null, replanned: replannedOf(out.replanned) }
  },
  /** `POST /api/plan/leftovers/{id}/take-out` `{ storagePlaceId }` (null = Not sorted); the flat Leftover. */
  takeOut: (id: number, storagePlaceId: number | null): Promise<Leftover> =>
    http.post<Leftover>(`/api/plan/leftovers/${id}/take-out`, { storagePlaceId }),
  /** `POST /api/plan/leftovers/{id}/answer` `{ answer }`; 204. */
  answer: async (id: number, answer: LeftoverAnswer): Promise<void> => {
    await http.post<void>(`/api/plan/leftovers/${id}/answer`, { answer })
  },
  /**
   * The server dry run (`?dryRun=1`): the Planned Meals the draft would replan, without writing anything.
   * Route and body are those of the real call.
   */
  preview: async (id: number, request: DryRunRequest): Promise<PlannedMealRef[]> => {
    const body = request.kind === 'freeze' ? { storagePlaceId: request.storagePlaceId, portions: request.portions } : { portions: request.portions }
    const out = await http.post<{ replanned?: PlannedMealRef[] | null }>(`/api/plan/leftovers/${id}/${request.kind}?dryRun=1`, body)
    return replannedOf(out.replanned)
  },
}
