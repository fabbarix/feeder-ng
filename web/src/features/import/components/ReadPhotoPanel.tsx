import type { ReactNode } from 'react'
import { ImagePicker, useMediaQuery } from '../../../ui'
import { slotKeys, type PhotoSlots } from '../lib/photoSlots'
import { readStrings as t } from '../strings'

export interface ReadPhotoPanelProps {
  slots: PhotoSlots
  /** Slot `i` changed (null = removed). The parent applies lib/photoSlots.setSlot. */
  onSlotChange: (index: number, image: PhotoSlots[number]) => void
  disabled?: boolean
}

/** What to photograph and the privacy note, then one ImagePicker (raw mode) per slot, labelled "Photo 1"…; a smaller preview at phone width. */
export function ReadPhotoPanel({ slots, onSlotChange, disabled }: ReadPhotoPanelProps): ReactNode {
  const wide = useMediaQuery('(min-width: 600px)')
  const keys = slotKeys(slots)
  return (
    <div className="read-photos">
      <p className="read-photos__note">{t.photoHelp}</p>
      <p className="read-photos__note">{t.photoPrivacy}</p>
      {slots.map((image, i) => (
        <ImagePicker
          key={keys[i]}
          mode="raw"
          output="dataUrl"
          maxSide={2576}
          aspect="free"
          size={wide ? 'hero' : 72}
          label={t.photoLabel(i + 1)}
          value={image}
          disabled={disabled}
          onChange={(next) => onSlotChange(i, next)}
        />
      ))}
    </div>
  )
}
