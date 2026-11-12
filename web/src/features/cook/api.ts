import { http as defaultHttp, type HttpClient } from '../../lib/http'
import type { CookSource, CookTimer, CookView, StartTimerInput, TimelineView, TimersResponse } from './types'

export interface CookApi {
  view(source: CookSource): Promise<CookView>
  /** GET /api/cook/meals/{date}/{slotId}/all: the slot's combined cooking timeline. */
  timeline(date: string, mealSlotId: number): Promise<TimelineView>
  /** GET /api/cook/meals/{date}/{slotId}/{courseId}: one Course's own view (the single-Course Cook Mode). */
  courseView(date: string, mealSlotId: number, courseId: number): Promise<CookView>
  setMark(scope: string, step: number, done: boolean): Promise<{ scope: string; step: number; done: boolean; doneAt: string | null }>
  timers(scope?: string): Promise<TimersResponse>
  startTimer(input: StartTimerInput): Promise<CookTimer>
  pauseTimer(id: number): Promise<CookTimer>
  resumeTimer(id: number): Promise<CookTimer>
  cancelTimer(id: number): Promise<void>
}

/**
 * Typed calls for /api/cook. view: GET /api/cook/meals/{date}/{slotId}/{courseId} or
 * GET /api/cook/recipes/{id}?batches=; setMark: PUT /api/cook/marks {scope, step, done};
 * timers: GET /api/cook/timers[?scope=] (encoded); startTimer: POST /api/cook/timers;
 * pause/resume: POST /api/cook/timers/{id}/pause|resume; cancel: DELETE /api/cook/timers/{id}.
 */
export function createCookApi(client: HttpClient): CookApi {
  return {
    view(source) {
      if (source.kind === 'meal') return client.get<CookView>(`/api/cook/meals/${source.date}/${source.mealSlotId}/${source.courseId}`)
      return client.get<CookView>(`/api/cook/recipes/${source.recipeId}?batches=${source.batches}`)
    },
    timeline(date, mealSlotId) {
      return client.get<TimelineView>(`/api/cook/meals/${date}/${mealSlotId}/all`)
    },
    courseView(date, mealSlotId, courseId) {
      return client.get<CookView>(`/api/cook/meals/${date}/${mealSlotId}/${courseId}`)
    },
    setMark(scope, step, done) {
      return client.put('/api/cook/marks', { scope, step, done })
    },
    timers(scope) {
      const query = scope ? `?scope=${encodeURIComponent(scope)}` : ''
      return client.get<TimersResponse>(`/api/cook/timers${query}`)
    },
    startTimer(input) {
      return client.post<CookTimer>('/api/cook/timers', input)
    },
    pauseTimer(id) {
      return client.post<CookTimer>(`/api/cook/timers/${id}/pause`)
    },
    resumeTimer(id) {
      return client.post<CookTimer>(`/api/cook/timers/${id}/resume`)
    },
    cancelTimer(id) {
      return client.delete<void>(`/api/cook/timers/${id}`)
    },
  }
}

export const cookApi: CookApi = createCookApi(defaultHttp)
