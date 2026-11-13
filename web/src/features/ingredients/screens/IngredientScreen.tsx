import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { ApiError } from '../../../lib/http'
import { BentoGrid, BottomSheet, Button, CROP_ASPECTS, Chip, EmptyState, ImagePicker, PageHeader, TextField, Tile } from '../../../ui'
import { IngredientProducts } from '../../products'
import { IngredientExclusionList } from '../../recipes/components/IngredientExclusionList'
import { BaseUnitPicker } from '../components/BaseUnitPicker'
import { ConversionEditor } from '../components/ConversionEditor'
import { MergeSheet } from '../components/MergeSheet'
import { ShelfLifeEditor } from '../components/ShelfLifeEditor'
import { useDisplayUnitSystem } from '../hooks/useDisplayUnitSystem'
import { useIngredient } from '../hooks/useIngredient'
import { errorMessage } from '../lib/errorMessage'
import { displayName } from '../lib/names'
import { strings } from '../strings'

/**
 * Route /ingredients/:id. Heading = name; "Rename" (inline Name field + "Save name"). Below it a BentoGrid of Tiles:
 * Base Unit (BaseUnitPicker; a read-only value row with strings.baseUnitLocked(n) while referenced), Shelf Life (ShelfLifeEditor),
 * Unit Conversions (ConversionEditor), Merge (opens MergeSheet; on success navigates to the survivor) and Delete
 * (disabled with strings.deleteLocked(n) while referenced; otherwise asks strings.deleteConfirm in a sheet, then
 * deletes and navigates to /ingredients). While loading shows strings.loading; an unknown id (404) shows an
 * EmptyState under a PageHeader with the trail. The Excluded by Tile (#exclusions) lists who excludes the Ingredient.
 */
export function IngredientScreen() {
  const { id: rawId } = useParams()
  const id = Number(rawId)
  const navigate = useNavigate()
  const system = useDisplayUnitSystem()
  const ing = useIngredient(id)

  const [renaming, setRenaming] = useState(false)
  const [nameText, setNameText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const ingredient = ing.ingredient
  const breadcrumbs = useBreadcrumbs(ingredient && displayName(ingredient.name))
  if (!ingredient) {
    if (ing.isLoading) return <p role="status">{strings.loading}</p>
    if (ing.error instanceof ApiError && ing.error.status === 404) {
      return (
        <section>
          <PageHeader title={breadcrumbs.at(-1)?.label ?? ''} breadcrumbs={breadcrumbs} />
          <EmptyState title={strings.notFoundTitle} />
        </section>
      )
    }
    return <p role="alert">{strings.actionFailed}</p>
  }

  const locked = ing.referenceCount > 0

  /** Runs a change, showing its failure inline. Resolves to true when it went through. */
  const attempt = async (change: () => Promise<unknown>): Promise<boolean> => {
    setError(null)
    try {
      await change()
      return true
    } catch (e) {
      setError(errorMessage(e))
      return false
    }
  }

  const saveName = async () => {
    if (await attempt(() => ing.rename(nameText))) setRenaming(false)
  }

  const remove = async () => {
    if (await attempt(() => ing.remove())) navigate('/ingredients')
  }

  return (
    <section>
      <PageHeader title={displayName(ingredient.name)} breadcrumbs={breadcrumbs} />
      {error ? <p role="alert">{error}</p> : null}

      {ingredient.baseRecipe ? (
        <p className="ingredient__base">
          <Chip kind="tag" icon="cook">
            {ingredient.baseRecipe.archived ? strings.baseRecipeArchived : strings.baseRecipeBadge}
          </Chip>{' '}
          <Link to={`/recipes/${ingredient.baseRecipe.id}`} aria-label={strings.openBaseRecipe(ingredient.baseRecipe.name)}>
            {ingredient.baseRecipe.name}
          </Link>
        </p>
      ) : null}

      {ingredient.baseRecipe ? (
        <p className="ingredient__helper">{strings.renameBaseRecipe}</p>
      ) : renaming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void saveName()
          }}
        >
          <TextField label={strings.nameLabel} value={nameText} onChange={setNameText} />
          <Button type="submit">{strings.saveName}</Button>
        </form>
      ) : (
        <Button
          variant="tertiary"
          onClick={() => {
            setNameText(ingredient.name)
            setRenaming(true)
          }}
        >
          {strings.rename}
        </Button>
      )}

      <BentoGrid min="card" label={strings.detailsLabel}>
        <Tile as="section" className="ingredient__tile" aria-label={strings.baseUnitLabel}>
          {locked ? (
            <>
              <div className="base-unit__value" data-testid="base-unit-value">
                <span className="base-unit__label">{strings.baseUnitLabel}</span>
                <span aria-hidden="true">{' · '}</span>
                <strong>{ingredient.baseUnit}</strong>
              </div>
              <p className="base-unit__helper">{strings.baseUnitLocked(ing.referenceCount)}</p>
            </>
          ) : (
            <BaseUnitPicker
              value={ingredient.baseUnit}
              onChange={(b) => {
                if (b !== ingredient.baseUnit) void attempt(() => ing.setBaseUnit(b))
              }}
            />
          )}
        </Tile>

        <Tile as="section" className="ingredient__tile" aria-label={strings.shelfLifeTile}>
          <ShelfLifeEditor days={ingredient.shelfLifeDays} onSave={(days) => void attempt(() => ing.setShelfLife(days))} />
        </Tile>

        <Tile as="section" className="ingredient__tile" aria-label={strings.frozenShelfLifeLabel}>
          <ShelfLifeEditor
            variant="frozen"
            days={ingredient.frozenShelfLifeDays ?? null}
            onSave={(days) => void attempt(() => ing.setFrozenShelfLife(days))}
          />
        </Tile>

        <Tile as="section" span="full" aria-labelledby="ingredient-picture-heading">
          <h2 id="ingredient-picture-heading">{strings.pictureLabel}</h2>
          <ImagePicker
            hideLabel
            label={strings.pictureLabel}
            value={ingredient.image ?? ''}
            onChange={(imageId) => void attempt(() => ing.setImage(imageId))}
            aspect={CROP_ASPECTS.landscape}
          />
        </Tile>

        <Tile as="section" span="full" aria-label={strings.conversionsTitle}>
          <ConversionEditor
            conversions={ingredient.conversions}
            base={ingredient.baseUnit}
            system={system}
            lockedUnits={ingredient.baseRecipe ? ['batch', 'portion'] : undefined}
            onAdd={(c) => void attempt(() => ing.setConversion(c))}
            onRemove={(unit) => void attempt(() => ing.removeConversion(unit))}
          />
        </Tile>

        <IngredientProducts ingredientId={id} ingredientName={ingredient.name} baseUnit={ingredient.baseUnit} system={system} />

        <Tile as="section" id="exclusions" span="full" aria-label={strings.excludedBy}>
          <h2>{strings.excludedBy}</h2>
          <IngredientExclusionList ingredientId={id} ingredientName={ingredient.name} />
        </Tile>

        <Tile as="section" aria-label={strings.mergeTitle}>
          <Button variant="tertiary" onClick={() => setMergeOpen(true)}>
            {strings.mergeInto}
          </Button>
        </Tile>

        <Tile as="section" aria-label={strings.deleteIngredient}>
          <Button variant="danger-tertiary" disabled={locked} onClick={() => setDeleteOpen(true)}>
            {strings.deleteIngredient}
          </Button>
          {locked ? <p>{strings.deleteLocked(ing.referenceCount)}</p> : null}
        </Tile>
      </BentoGrid>

      {mergeOpen ? (
        <MergeSheet
          open
          sourceId={id}
          onClose={() => setMergeOpen(false)}
          onMerged={(targetId) => {
            setMergeOpen(false)
            navigate(`/ingredients/${targetId}`)
          }}
        />
      ) : null}
      <BottomSheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={strings.deleteIngredient}>
        <p>{strings.deleteConfirm(ingredient.name)}</p>
        <Button onClick={() => void remove()}>{strings.deleteIngredient}</Button>
      </BottomSheet>
    </section>
  )
}
