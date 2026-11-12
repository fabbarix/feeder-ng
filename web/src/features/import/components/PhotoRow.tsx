// PhotoRow: one photo of the list (docs/dev/design/photo-read.md section 5, "PhotoRow"). The status line and the small warning come from lib/photoMessages.
import type { ReactNode } from 'react'
import { Icon, IconButton, Thumb } from '../../../ui'
import { isSmallOutput, rowStatus } from '../lib/photoMessages'
import type { Photo } from '../lib/photoPages'
import { photoReadStrings as t, readStrings } from '../strings'

export interface PhotoRowProps {
  photo: Photo
  /** 1-based position ("Photo n"). */
  number: number
  previewUrl: string | undefined
  /** Sortable's drag handle. */
  handle?: ReactNode
  disabled?: boolean
  onEdit: () => void
  onRemove: () => void
}

export function PhotoRow({ photo, number, previewUrl, handle, disabled, onEdit, onRemove }: PhotoRowProps): ReactNode {
  const status = rowStatus(photo)
  const canEdit = photo.source.kind === 'image'
  return (
    <div className="photo-row">
      {handle}
      <div className="photo-row__picture">
        {previewUrl ? <Thumb imageUrl={previewUrl} size={72} /> : <Icon name="file" size={24} />}
      </div>
      <div className="photo-row__body">
        <p className="photo-row__title">{readStrings.photoLabel(number)}</p>
        {status ? (
          <p className="photo-row__status">
            {status.failed ? <Icon name="error" size={16} /> : null}
            {status.text}
          </p>
        ) : null}
        {isSmallOutput(photo) ? <p className="photo-row__note">{t.small}</p> : null}
      </div>
      <div className="photo-row__actions">
        {canEdit ? (
          <IconButton icon="edit" label={t.editButton(number)} data-photo-edit disabled={disabled} onClick={onEdit} />
        ) : null}
        <IconButton icon="delete" label={t.removeButton(number)} disabled={disabled} onClick={onRemove} />
      </div>
    </div>
  )
}
