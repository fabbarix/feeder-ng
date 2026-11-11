import { useId, type ReactNode } from 'react'
import { Icon, Select, Switch, Tile, useRovingRadios } from '../../../ui'
import { photoUrl, type PhotoChoice, type PhotoRecipeOption } from '../lib/photoChoice'
import { readStrings as t } from '../strings'
import type { ReviewPhoto } from '../types'

export interface ReviewPhotoChoiceProps {
  importId: string
  photos: ReviewPhoto[]
  recipes: PhotoRecipeOption[]
  choice: PhotoChoice
  onToggle: (on: boolean) => void
  onPhoto: (index: number) => void
  onRecipe: (index: number) => void
}

/** The "Photo for the Recipe" tile of Import Review. Renders nothing without candidate photos. */
export function ReviewPhotoChoice({ importId, photos, recipes, choice, onToggle, onPhoto, onRecipe }: ReviewPhotoChoiceProps): ReactNode {
  if (photos.length === 0) return null
  const none = recipes.length === 0
  return (
    <Tile as="section" className="photo-choice">
      <h3>{t.photoChoiceTitle}</h3>
      <Switch label={t.photoSwitch} checked={choice.enabled} disabled={none} onChange={onToggle} />
      {none ? <p className="read-step__muted">{t.photoNoRecipe}</p> : null}
      {!none && !choice.enabled ? <p className="read-step__muted">{t.photoKept}</p> : null}
      {choice.enabled ? (
        <>
          {photos.length === 1 ? (
            <img className="photo-choice__thumb" src={photoUrl(importId, photos[0]!.index)} alt={t.photoLabel(1)} width={photos[0]!.width} height={photos[0]!.height} />
          ) : (
            <PhotoRadios importId={importId} photos={photos} value={choice.photo} onChange={onPhoto} />
          )}
          {recipes.length > 1 ? (
            <Select<number>
              label={t.photoRecipe}
              value={choice.recipe}
              options={recipes.map((r) => ({ value: r.index, label: r.name }))}
              onChange={onRecipe}
            />
          ) : null}
          {photos.length > 1 ? <p className="read-step__muted">{t.photoOnlyOne}</p> : null}
        </>
      ) : null}
    </Tile>
  )
}

interface PhotoRadiosProps {
  importId: string
  photos: ReviewPhoto[]
  value: number
  onChange: (index: number) => void
}

/** The candidate photos as one single-choice row of thumbnails (radio semantics, roving tabindex, arrow keys). */
function PhotoRadios({ importId, photos, value, onChange }: PhotoRadiosProps): ReactNode {
  const labelId = useId()
  const roving = useRovingRadios(photos.map((p) => ({ value: String(p.index) })), String(value), (v) => onChange(Number(v)))
  return (
    <div className="photo-choice__group">
      <span id={labelId} className="read-source__label">
        {t.photoGroup}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="photo-choice__radios">
        {photos.map((p) => {
          const key = String(p.index)
          return (
            <button
              key={p.index}
              ref={roving.register(key)}
              type="button"
              role="radio"
              aria-checked={p.index === value}
              aria-label={t.photoLabel(p.index + 1)}
              tabIndex={key === roving.tabStop ? 0 : -1}
              className="photo-choice__radio"
              onClick={() => onChange(p.index)}
              onKeyDown={(e) => roving.onKeyDown(e, key)}
            >
              <img src={photoUrl(importId, p.index)} alt={t.photoLabel(p.index + 1)} width={p.width} height={p.height} />
              {p.index === value ? (
                <span className="photo-choice__check" aria-hidden="true">
                  <Icon name="tick" size={16} />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
