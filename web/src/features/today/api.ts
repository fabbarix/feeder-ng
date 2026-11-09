import { http } from '../../lib/http'
import type { AdvanceStepDue } from './types'

export const todayApi = {
  advanceSteps: () => http.get<{ steps: AdvanceStepDue[] }>('/api/today/advance-steps'),
  streak: () => http.get<{ days: number }>('/api/today/streak'),
}
