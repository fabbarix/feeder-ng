import { http } from '../../lib/http'
import type { AdvanceStepDue } from './types'

export const todayApi = {
  advanceSteps: () => http.get<{ steps: AdvanceStepDue[] }>('/api/today/advance-steps'),
  streak: () => http.get<{ days: number }>('/api/today/streak'),
  /** B9-44 (TB-02): Done on an Advance Step, and its Undo (the board's call). */
  setMark: (scope: string, step: number, done: boolean) => http.put<unknown>('/api/cook/marks', { scope, step, done }),
}
