// The photos of the read, in order: a thumb, its name, Edit and Remove (design 3.2, mock-up 13).
import { IconButton, Thumb } from '../../../ui'
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
          <IconButton icon="edit" label={t.editPhoto(i + 1)} disabled={disabled} onClick={() => onEdit(photo.id)} />
          <IconButton icon="delete" label={t.removePhoto(i + 1)} disabled={disabled} onClick={() => onRemove(photo.id)} />
        </li>
      ))}
    </ul>
  )
}
