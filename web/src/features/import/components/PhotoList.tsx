// PhotoList: the photos in page order, reorderable with the shared Sortable (docs/dev/design/photo-read.md D7, sections 5 and 6).
// After a Remove the focus goes to the row now at that position, and a polite status says what was removed. The status stays mounted
// when the last photo goes (it is only dropped once there is nothing to announce), so the announcement is still read out.
import { useRef, type ReactNode } from 'react'
import { Sortable } from '../../../ui'
import { usePhotoListFocus } from '../hooks/usePhotoFocus'
import type { Photo, PhotoId } from '../lib/photoPages'
import { photoReadStrings as t, readStrings } from '../strings'
import { PhotoRow } from './PhotoRow'

export interface PhotoListProps {
  photos: Photo[]
  previewUrl: (id: PhotoId) => string | undefined
  disabled?: boolean
  onEdit: (id: PhotoId) => void
  onRemove: (id: PhotoId) => void
  onMove: (from: number, to: number) => void
}

export function PhotoList({ photos, previewUrl, disabled, onEdit, onRemove, onMove }: PhotoListProps): ReactNode {
  const list = useRef<HTMLElement>(null)
  const { announcement, removed } = usePhotoListFocus(photos, list)

  return (
    <>
      {photos.length > 0 ? (
        <Sortable
          as="ol"
          aria-label={t.listLabel}
          listRef={list}
          items={photos}
          getKey={(photo) => photo.id}
          getLabel={(_photo, index) => readStrings.photoLabel(index + 1)}
          onReorder={onMove}
          disabled={disabled}
          renderItem={(photo, ctx) => (
            <li {...ctx.itemProps} className={`photo-list__item ${ctx.itemProps.className ?? ''}`.trim()}>
              <PhotoRow
                photo={photo}
                number={ctx.position + 1}
                previewUrl={previewUrl(photo.id)}
                handle={ctx.handle}
                disabled={disabled}
                onEdit={() => onEdit(photo.id)}
                onRemove={() => {
                  removed(ctx.index)
                  onRemove(photo.id)
                }}
              />
            </li>
          )}
        />
      ) : null}
      {photos.length > 0 || announcement !== '' ? (
        <p role="status" className="photo-list__status">
          {announcement}
        </p>
      ) : null}
    </>
  )
}
