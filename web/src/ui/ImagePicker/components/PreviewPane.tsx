import { useEffect, useState } from 'react'
import { Icon } from '../../Icon'
import { imagePickerStrings as t } from '../strings'

export interface PreviewPaneProps {
  /** The picture's URL (stored image, object URL or pasted link). */
  src: string
  /** Names the picture: the picker's label. */
  label: string
  size: 'hero' | 72
}

/** The current picture, named after the picker; a picture that fails to load says so (Replace and Remove stay available around it). */
export function PreviewPane({ src, label, size }: PreviewPaneProps) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  return (
    <div className="image-picker__preview" data-size={size}>
      {broken ? (
        <p className="image-picker__broken">
          <Icon name="file" size={24} />
          <span>{t.previewBroken}</span>
        </p>
      ) : (
        <img src={src} alt={label} className="image-picker__image" onError={() => setBroken(true)} />
      )}
    </div>
  )
}
