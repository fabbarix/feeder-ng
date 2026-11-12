// PhotoList: the photos in page order, reorderable with the shared Sortable (docs/dev/design/photo-read.md D7, sections 5 and 6).
// After a Remove the focus goes to the next row's Edit button, else the previous one's, and a polite status says what was removed.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Sortable } from '../../../ui'
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
  // The page position of the photo being removed, until the list shows the result.
  const removedAt = useRef<number | null>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    const at = removedAt.current
    if (at === null) return
    removedAt.current = null
    const edits = list.current?.querySelectorAll<HTMLButtonElement>('button[data-photo-edit]')
    edits?.[Math.min(at, photos.length - 1)]?.focus()
  }, [photos])

  if (photos.length === 0) return null

  return (
    <>
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
                removedAt.current = ctx.index
                setAnnouncement(t.removedAnnouncement(ctx.index + 1))
                onRemove(photo.id)
              }}
            />
          </li>
        )}
      />
      <p role="status" className="photo-list__status">
        {announcement}
      </p>
    </>
  )
}
