// Course names: the key that makes two names the same, and the validation both Settings > Courses and the pickers share.
import { COURSE_NAME_MAX } from './types'

export type CourseNameProblem = 'empty' | 'too_long' | 'taken'

export type CourseNameResult = { ok: true; name: string } | { ok: false; reason: CourseNameProblem; message: string }

/** `course.NameKey` (Go): trimmed, inner whitespace collapsed, lower-cased. Accents count ("Entrée" and "Entree" differ). */
export function courseNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Checks a name typed for a new or renamed Course against the other Courses (archived ones included: the key is unique
 * among all). `selfId` is the Course being renamed, so keeping its own name is fine. The returned name is trimmed.
 */
export function validateCourseName(name: string, others: ReadonlyArray<{ id: number; name: string }>, selfId?: number): CourseNameResult {
  const trimmed = name.trim()
  if (trimmed === '') return { ok: false, reason: 'empty', message: courseNameMessages.empty }
  if (Array.from(trimmed).length > COURSE_NAME_MAX) return { ok: false, reason: 'too_long', message: courseNameMessages.too_long }
  const key = courseNameKey(trimmed)
  if (others.some((o) => o.id !== selfId && courseNameKey(o.name) === key)) {
    return { ok: false, reason: 'taken', message: courseNameMessages.taken }
  }
  return { ok: true, name: trimmed }
}

/** Messages by problem; `validateCourseName` uses them. */
export const courseNameMessages: Record<CourseNameProblem, string> = {
  empty: 'Name the Course',
  too_long: `Use ${COURSE_NAME_MAX} characters or fewer`,
  taken: 'There is already a Course with that name',
}
