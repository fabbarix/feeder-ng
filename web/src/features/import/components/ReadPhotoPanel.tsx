import type { ReactNode } from 'react'
import type { PhotoSlots } from '../lib/photoSlots'

export interface ReadPhotoPanelProps {
  slots: PhotoSlots
  /** Slot `i` changed (null = removed). The parent applies lib/photoSlots.setSlot. */
  onSlotChange: (index: number, image: PhotoSlots[number]) => void
  disabled?: boolean
  /** A problem with the photos (from lib/readErrors), shown on the panel. */
  error?: string
}

/** One ImagePicker (raw mode) per slot, labelled "Photo 1"…, plus the helper and the privacy note. TODO(ra-e developer). */
export function ReadPhotoPanel(props: ReadPhotoPanelProps): ReactNode {
  void props
  return null
}
