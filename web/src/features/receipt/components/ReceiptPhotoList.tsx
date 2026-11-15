// The photos of the read, in order: a framed thumb, its name, and Edit and Remove as one IconSet (design 3.2, mock-up 13; B9-50 SSP-19, A11Y-09).
import { IconButton, Thumb } from '../../../ui'
import { IconSet } from '../../../ui/IconSet'
import { receiptStrings as t } from '../strings'
import type { ReceiptPhotoItem } from '../hooks/useReceiptPhotos'

export interface ReceiptPhotoListProps {
  photos: ReceiptPhotoItem[]
  disabled: boolean
  onRemove: (id: string) => void
  /** Edit (rotate, crop) the photo with this id. */
  onEdit: (id: string) => void
}

export function ReceiptPhotoList({ photos, disabled, onRemove, onEdit }: ReceiptPhotoListProps) {
  return (
    <ul className="receipt-photos" aria-label={t.photosLabel}>
      {photos.map((photo, i) => (
        <li key={photo.id} className="receipt-photo">
          <Thumb name={t.photoLabel(i + 1)} imageUrl={photo.previewUrl} size={48} label={t.photoLabel(i + 1)} />
          <span className="receipt-photo__title">{t.photoLabel(i + 1)}</span>
          {/* A11Y-09: the row's icon actions are one IconSet (its token gap); the row sets no gap between them */}
          <IconSet>
            <IconButton icon="edit" label={t.editPhoto(i + 1)} disabled={disabled} onClick={() => onEdit(photo.id)} />
            <IconButton icon="remove" label={t.removePhoto(i + 1)} disabled={disabled} onClick={() => onRemove(photo.id)} />
          </IconSet>
        </li>
      ))}
    </ul>
  )
}
