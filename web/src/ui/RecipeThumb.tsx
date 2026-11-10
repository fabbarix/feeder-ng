import { useState } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { recipeInitial } from './lib/recipeInitial'
import { tagIcon } from './lib/tagIcon'
import './RecipeThumb.css'

export type RecipeThumbSize = 40 | 48 | 72 | 'hero'

export interface RecipeThumbProps {
  /** Recipe name: source of the initial of the generated tile, and of `label`. */
  name: string
  photoUrl?: string
  /** Tags in order; the first one picks the icon of the generated tile (lib/tagIcon). */
  tags?: readonly string[]
  size?: RecipeThumbSize
  /** When given the thumb is an img with this accessible name; otherwise it is decorative (the name is shown next to it). */
  label?: string
}

const TAG_ICON_SIZE: Record<RecipeThumbSize, 16 | 20 | 24 | 28> = { 40: 16, 48: 20, 72: 24, hero: 28 }

/**
 * A photo (`object-fit: cover`) or, without a photo or when it fails to load, the generated tile:
 * soft fill, Tag icon at 40 % in accent-text, and the initial. Generated tiles carry data-generated and data-tag-icon.
 */
export function RecipeThumb({ name, photoUrl, tags, size = 48, label }: RecipeThumbProps) {
  const [failedUrl, setFailedUrl] = useState<string>()
  if (photoUrl && failedUrl !== photoUrl) {
    return (
      <span className="recipe-thumb" data-size={size}>
        <img src={photoUrl} alt={label ?? ''} onError={() => setFailedUrl(photoUrl)} />
      </span>
    )
  }
  const icon: IconName = tagIcon(tags?.[0])
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': 'true' as const }
  return (
    <span className="recipe-thumb" data-size={size} data-generated="" data-tag-icon={icon} {...a11y}>
      <span className="recipe-thumb__icon" aria-hidden="true">
        <Icon name={icon} size={TAG_ICON_SIZE[size]} />
      </span>
      <span className="recipe-thumb__initial">{recipeInitial(name)}</span>
    </span>
  )
}
