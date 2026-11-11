import type { ReactNode } from 'react'
import { ImagePicker } from '../../../ui/ImagePicker'
import type { PhotoSlots } from '../lib/photoSlots'
import { readStrings as t } from '../strings'

export interface ReadPhotoPanelProps {
  slots: PhotoSlots
  /** Slot `i` changed (null = removed). The parent applies lib/photoSlots.setSlot. */
  onSlotChange: (index: number, image: PhotoSlots[number]) => void
  disabled?: boolean
  /** A problem with the photos (from lib/readErrors), shown on the panel. */
  error?: string
}

/** One ImagePicker (raw mode) per slot, labelled "Photo 1"…, plus the helper and the privacy note. */
export function ReadPhotoPanel({ slots, onSlotChange, disabled, error }: ReadPhotoPanelProps): ReactNode {
  return (
    <div className="read-photos">
      {slots.map((image, i) => (
        <ImagePicker
          // The slots are positional (removing one closes the gap), so the position is the identity.
          key={i}
          mode="raw"
          output="dataUrl"
          maxSide={2576}
          aspect="free"
          label={t.photoLabel(i + 1)}
          value={image}
          disabled={disabled}
          onChange={(next) => onSlotChange(i, next)}
        />
      ))}
      <p className="read-photos__note">{t.photoHelp}</p>
      <p className="read-photos__note">{t.photoPrivacy}</p>
      {error ? (
        <p className="read-photos__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
