// ReadPhotoPanel: the Photo tab of "Read a recipe" (docs/dev/design/photo-read.md section 5; photo-store.md "Copy" and "Remove").
// Either the editor of one photo, or the notes, the photos from before, the list in page order and the sources.
import { useId, useRef, type ReactNode } from 'react'
import { Button } from '../../../ui'
import { useBusyNote } from '../hooks/useBusyNote'
import { usePhotoFocus } from '../hooks/usePhotoFocus'
import type { UsePhotoPages } from '../hooks/usePhotoPages'
import { usePhotoSources } from '../hooks/usePhotoSources'
import { useRetakeRequest } from '../hooks/useRetakeRequest'
import { isSmallPhoto, canAdd, draftOutputSize, MAX_PHOTOS } from '../lib/photoPages'
import { problemText } from '../lib/photoMessages'
import { photoReadStrings as t, readStrings } from '../strings'
import { PhotoEditorPanel } from './PhotoEditorPanel'
import { PhotoList } from './PhotoList'
import { PhotoSources } from './PhotoSources'

export interface ReadPhotoPanelProps {
  pages: UsePhotoPages
  /** The Read step is locked (a read runs, the Assistant is off). */
  disabled?: boolean
}

export function ReadPhotoPanel({ pages, disabled }: ReadPhotoPanelProps): ReactNode {
  const { state } = pages
  const options = usePhotoSources()
  const busyNote = useBusyNote(pages.busy)
  const retake = useRetakeRequest()
  const root = useRef<HTMLDivElement>(null)
  const sources = useRef<HTMLDivElement>(null)
  const alert = useRef<HTMLDivElement>(null)
  const restoredNote = useId()
  const focus = usePhotoFocus(state, { root, sources, alert }, retake.openCamera)

  const editing = state.editing
  const photo = editing ? state.photos.find((p) => p.id === editing.id) : undefined
  const problem = state.problem
  const restored = pages.restoredCount

  const draftSize = draftOutputSize(state)
  const small = draftSize ? isSmallPhoto(draftSize) : false
  const editor = editing && photo && photo.source.kind === 'image' ? (
    <PhotoEditorPanel
      session={editing}
      number={state.photos.findIndex((p) => p.id === editing.id) + 1}
      src={pages.editorUrl ?? ''}
      size={{ width: photo.source.width, height: photo.source.height }}
      small={small}
      canRetake={editing.isNew && photo.source.origin === 'camera'}
      onChange={pages.setDraft}
      onUse={pages.commit}
      onCancel={pages.cancel}
      onRetake={() => {
        pages.cancel()
        retake.request()
      }}
    />
  ) : null

  return (
    <div
      ref={root}
      role="group"
      aria-label={t.group}
      aria-busy={pages.busy || undefined}
      className="photo-panel"
      onPaste={(e) => pages.onPaste(e.clipboardData)}
    >
      <p className="read-photos__note">{readStrings.photoHelp}</p>
      <p className="read-photos__note">{readStrings.photoPrivacy}</p>
      <p className="read-photos__note">{t.stayOnDevice}</p>
      {/* Mounted whenever the panel is usable: only its text changes, so the screen reader announces it. While the step is locked for a read,
          the read's own progress is the live region. */}
      {disabled ? null : <p role="status">{busyNote ? t.busy : ''}</p>}
      {problem ? (
        <div role="alert" tabIndex={-1} ref={alert} className="photo-panel__alert">
          <p>{problemText(problem)}</p>
          <Button variant="tertiary" onClick={pages.dismissProblem}>
            {t.dismiss}
          </Button>
        </div>
      ) : null}
      {editor ?? (
        <>
          {restored > 0 ? (
            <div className="photo-panel__restored">
              <p id={restoredNote} role="status">
                {t.restored(restored)}
              </p>
              <Button variant="tertiary" aria-describedby={restoredNote} onClick={pages.removeRestored}>
                {t.restoredRemove}
              </Button>
            </div>
          ) : null}
          {state.photos.length > 0 ? <p className="photo-panel__count">{t.count(state.photos.length, MAX_PHOTOS)}</p> : null}
          <PhotoList
            photos={state.photos}
            previewUrl={pages.previewUrl}
            disabled={disabled}
            onEdit={pages.edit}
            onRemove={(id) => {
              focus.removing()
              pages.remove(id)
            }}
            onMove={pages.move}
          />
          <PhotoSources
            options={options}
            canAdd={canAdd(state)}
            disabled={disabled}
            onFiles={(files, origin) => pages.addFiles(files, origin)}
            rootRef={sources}
            openCamera={retake.openCamera}
            onCameraOpened={retake.opened}
          />
        </>
      )}
    </div>
  )
}
