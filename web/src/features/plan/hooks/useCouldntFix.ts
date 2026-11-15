import { useNavigate } from 'react-router-dom'
import type { CauseGroup } from '../lib/couldntGroups'
import type { SlotKey } from '../types'

/**
 * The one fix action of a cause: a link goes where it is fixed; "Choose a Recipe" opens the chooser for the first
 * affected meal when the screen has one (Plan), otherwise the Plan. B9-32 (PC-07): "Mark Recipes as Dessert" calls
 * `onMark` on a screen that has the sheet (Plan), otherwise it goes to the Recipes not marked with the Course.
 */
export function useCouldntFix(onChoose?: (key: SlotKey) => void, onMark?: (course: { id: number; name: string }) => void): (group: CauseGroup) => void {
  const navigate = useNavigate()
  return (group) => {
    if (group.fix.kind === 'link') {
      navigate(group.fix.to)
      return
    }
    if (group.fix.kind === 'mark') {
      if (onMark) onMark({ id: group.fix.courseId, name: group.fix.courseName })
      else navigate(`/recipes?notCourse=${group.fix.courseId}`)
      return
    }
    const first = group.slots[0]
    if (onChoose && first) onChoose({ date: first.date, mealSlotId: first.mealSlotId, courseId: first.courseId })
    else navigate('/plan')
  }
}
