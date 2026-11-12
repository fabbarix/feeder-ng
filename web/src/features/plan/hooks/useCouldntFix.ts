import { useNavigate } from 'react-router-dom'
import type { CauseGroup } from '../lib/couldntGroups'
import type { SlotKey } from '../types'

/**
 * The one fix action of a cause: a link goes where it is fixed; "Choose a Recipe" opens the chooser for the first
 * affected meal when the screen has one (Plan), otherwise the Plan.
 */
export function useCouldntFix(onChoose?: (key: SlotKey) => void): (group: CauseGroup) => void {
  const navigate = useNavigate()
  return (group) => {
    if (group.fix.kind === 'link') {
      navigate(group.fix.to)
      return
    }
    const first = group.slots[0]
    if (onChoose && first) onChoose({ date: first.date, mealSlotId: first.mealSlotId, ...(first.courseId !== undefined ? { courseId: first.courseId } : {}) })
    else navigate('/plan')
  }
}
