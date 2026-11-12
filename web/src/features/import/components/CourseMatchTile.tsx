import type { ReactNode } from 'react'
import type { CourseChoice } from '../../../lib/courses'
import { Chip, Tile, CourseSelect } from '../../../ui'
import { importStrings } from '../strings'
import type { CourseMatch } from '../types'

export interface CourseMatchTileProps {
  match: CourseMatch
  /** Names of the Recipes that use the name (lib/courseRows.usedByRecipes). */
  usedBy: readonly string[]
  /** The active Courses the name can stand for, household order. */
  courses: readonly CourseChoice[]
  /** Only an Admin is offered "Add as a Course" and "Unarchive". */
  isAdmin: boolean
  onUse: (courseId: number) => void
  onSkip: () => void
  onAdd: () => void
  onUnarchive: () => void
}

const s = importStrings.courses

/** CRS E2: one unknown or archived Course name of the file, with its answers (docs/dev/design/crs-e2.md 4.3). */
export function CourseMatchTile({ match, usedBy, courses, isAdmin, onUse, onSkip, onAdd, onUnarchive }: CourseMatchTileProps): ReactNode {
  const name = match.name
  const archived = match.status === 'archived'
  const answer = match.effective?.action
  // The select shows the Course the name is answered with; while Skip, Add or Unarchive is in force it is empty.
  const useCourseId = answer === 'use' ? (match.effective?.courseId ?? null) : null

  return (
    <Tile as="section" aria-label={name} span="full">
      <h2>{name}</h2>
      <Chip kind="tag">{archived ? s.statusArchived : s.statusUnknown}</Chip>
      <p>{archived ? s.archivedText(name) : s.unknownText(name)}</p>
      {usedBy.length > 0 ? <p>{s.usedBy(usedBy)}</p> : null}
      <CourseSelect label={s.useLabel} courses={courses} value={useCourseId} onChange={onUse} />
      <div role="group" aria-label={s.answerGroup(name)} className="import-chips">
        <Chip kind="filter" selected={answer === 'skip'} onClick={onSkip}>
          {s.skip(name)}
        </Chip>
        {!archived && isAdmin ? (
          <Chip kind="filter" selected={answer === 'add'} onClick={onAdd}>
            {s.add(name)}
          </Chip>
        ) : null}
        {archived && isAdmin ? (
          <Chip kind="filter" selected={answer === 'unarchive'} onClick={onUnarchive}>
            {s.unarchive(name)}
          </Chip>
        ) : null}
      </div>
      {!isAdmin ? <p>{archived ? s.adminOnlyUnarchive : s.adminOnlyAdd}</p> : null}
    </Tile>
  )
}
