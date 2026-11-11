// /settings/courses (ListPage): the Courses in the order every picker lists them. An Admin edits; a plain User reads.
import type { ReactElement } from 'react'
import type { Course } from '../../../lib/courses'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { Button, ListPage, PageHeader, Sortable, TextField, type SortableRenderContext } from '../../../ui'
import { CourseRemoveDialog } from '../components/CourseRemoveDialog'
import { CourseRow } from '../components/CourseRow'
import { coursesStrings as s } from '../coursesStrings'
import { useCoursesPage } from '../hooks/useCoursesPage'
import { documentLocale } from '../lib/locale'
import '../settings.css'

/** /settings/courses: the active Courses (drag to reorder, an Admin), Add Course, the archived section (Unarchive). */
export function CoursesPage(): ReactElement {
  const page = useCoursesPage()
  const breadcrumbs = useBreadcrumbs()
  const { courses, isAdmin, active, archived, renaming } = page

  const rowFor = (course: Course, sortable?: SortableRenderContext) => (
    <CourseRow
      course={course}
      canEdit={isAdmin}
      sortable={sortable}
      onAction={(action) => page.onAction(course, action)}
      renaming={renaming?.id === course.id ? renaming : undefined}
      onRenameChange={page.renameChange}
      onRenameSave={() => void page.saveRename()}
      onRenameCancel={page.cancelRename}
    />
  )

  return (
    <ListPage header={<PageHeader title={s.title} breadcrumbs={breadcrumbs} />}>
      <p className="pg__muted">{s.intro}</p>
      {!isAdmin && !courses.isPending && !courses.isError ? <p className="pg__muted">{s.readOnly}</p> : null}
      {courses.isPending ? (
        <p role="status">{s.loading}</p>
      ) : courses.isError ? (
        <p role="alert">{s.loadFailed}</p>
      ) : (
        <>
          <Sortable<Course>
            as="ul"
            className="courses-list"
            aria-label={s.listLabel}
            listRef={page.listRef}
            tabIndex={-1}
            items={active}
            getKey={(c) => String(c.id)}
            getLabel={(c) => c.name}
            onReorder={(from, to) => void page.reorder(from, to)}
            disabled={!isAdmin}
            renderItem={(course, ctx) => rowFor(course, isAdmin ? ctx : undefined)}
          />
          {isAdmin ? (
            <form
              className="courses-add"
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                void page.add()
              }}
            >
              <TextField
                label={s.newCourse}
                value={page.newName}
                error={page.addError}
                disabled={!page.canAdd}
                onChange={page.setNewName}
              />
              <Button type="submit" variant="secondary" disabled={!page.canAdd}>
                {s.addButton}
              </Button>
              {!page.canAdd ? <p className="pg__muted">{s.atLimit}</p> : null}
            </form>
          ) : null}
          {archived.length > 0 ? (
            <div className="courses-archived">
              <Button variant="tertiary" aria-expanded={page.archivedOpen} onClick={page.toggleArchived}>
                {s.archivedHeading(archived.length)}
              </Button>
              {page.archivedOpen ? (
                <ul aria-label={s.archivedHeading(archived.length)} className="courses-list courses-list--archived">
                  {archived.map((course) => (
                    <CourseRow
                      key={course.id}
                      course={course}
                      canEdit={isAdmin}
                      onAction={() => undefined}
                      onUnarchive={isAdmin ? () => void page.unarchive(course) : undefined}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
      <CourseRemoveDialog state={page.removal} locale={documentLocale()} />
    </ListPage>
  )
}
