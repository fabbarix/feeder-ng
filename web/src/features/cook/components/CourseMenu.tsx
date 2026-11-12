import type { ReactNode } from 'react'
import { Menu, type MenuEntry } from '../../../ui'
import type { CourseMenuEntry } from '../lib/timeline'
import { cookStrings } from '../strings'

export interface CourseMenuProps {
  entries: CourseMenuEntry[]
  onCooked: (courseId: number) => void
  onNotCooked: (courseId: number) => void
}

/** The Course menu of the Cook Mode header: "Mark <Course> as Cooked" and "Not cooked: <Course>" per Course. Nothing without entries. */
export function CourseMenu({ entries, onCooked, onNotCooked }: CourseMenuProps): ReactNode {
  if (entries.length === 0) return null
  const items: MenuEntry[] = entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    onSelect: () => (entry.action === 'cooked' ? onCooked(entry.courseId) : onNotCooked(entry.courseId)),
  }))
  return <Menu label={cookStrings.courseActions} items={items} />
}
