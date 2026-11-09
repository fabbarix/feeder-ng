import { http as defaultHttp, type HttpClient } from '../../lib/http'
import type { CookSource, CookTimer, CookView, StartTimerInput, TimersResponse } from './types'

export interface CookApi {
  view(source: CookSource): Promise<CookView>
  setMark(scope: string, step: number, done: boolean): Promise<{ scope: string; step: number; done: boolean; doneAt: string | null }>
  timers(scope?: string): Promise<TimersResponse>
  startTimer(input: StartTimerInput): Promise<CookTimer>
  pauseTimer(id: number): Promise<CookTimer>
  resumeTimer(id: number): Promise<CookTimer>
  cancelTimer(id: number): Promise<void>
}

/**
 * Typed calls for /api/cook. view: GET /api/cook/meals/{date}/{slotId} or
 * GET /api/cook/recipes/{id}?batches=; setMark: PUT /api/cook/marks {scope, step, done};
 * timers: GET /api/cook/timers[?scope=] (encoded); startTimer: POST /api/cook/timers;
 * pause/resume: POST /api/cook/timers/{id}/pause|resume; cancel: DELETE /api/cook/timers/{id}.
 */
export function createCookApi(_client: HttpClient): CookApi {
  const todo = (): never => {
    throw new Error('TODO')
  }
  return { view: todo, setMark: todo, timers: todo, startTimer: todo, pauseTimer: todo, resumeTimer: todo, cancelTimer: todo }
}

export const cookApi: CookApi = createCookApi(defaultHttp)
